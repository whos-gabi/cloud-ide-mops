// logica aplicatiei, creeare de workspace tot
package workspace

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/clientkube"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

// Largest file agent answer read: it never serves files over 10 MB (plus room
// for an error body). Listings aren't bounded by the agent, so they get more.
const (
	maxFileAgentResponse = 10<<20 + 1<<10
	maxFileListResponse  = 64 << 20
)

type WorkspaceService struct {
	k8s       *clientkube.KubernetesClient
	namespace string
	http      *http.Client
	// Base URL of a workspace's file agent; tests point it at a local server.
	fileAgentBaseURL func(workspaceID string) string
}

func NewWorkspaceService(
	k8s *clientkube.KubernetesClient,
) *WorkspaceService {
	s := &WorkspaceService{
		k8s:       k8s,
		namespace: configuredNamespace(),
		http:      &http.Client{Timeout: 30 * time.Second},
	}
	s.fileAgentBaseURL = s.clusterFileAgentURL
	return s
}

func (s *WorkspaceService) CreateWorkspace(ctx context.Context, req CreateWorkspaceRequest) error {

	pvc := BuildPVC(req)
	deployment := BuildDeployment(req)
	service := BuildService(req)

	_, err := s.k8s.CreatePVC(ctx, s.namespace, pvc)
	if err != nil {
		return fmt.Errorf("Error creating PVC: %w", err)
	}

	_, err = s.k8s.CreateDeployment(ctx, s.namespace, deployment)
	if err != nil {
		_ = s.k8s.DeletePVC(ctx, s.namespace, pvc.Name)
		return fmt.Errorf("Error creating Deployment: %w", err)
	}

	_, err = s.k8s.CreateService(
		ctx, s.namespace, service,
	)
	if err != nil {
		_ = s.k8s.DeleteDeployment(
			ctx, s.namespace, deployment.Name,
		)
		_ = s.k8s.DeletePVC(
			ctx, s.namespace, pvc.Name,
		)
		return fmt.Errorf("Error creating Service: %w", err)
	}

	return nil
}

func (s *WorkspaceService) StartWorkspace(
	ctx context.Context,
	workspaceID string,
) error {
	if err := s.k8s.ScaleDeployment(ctx, s.namespace, workspaceID, 1); err != nil {
		return fmt.Errorf("error starting workspace: %w", err)
	}

	return nil
}

func (s *WorkspaceService) StopWorkspace(
	ctx context.Context,
	workspaceID string,
) error {
	if err := s.k8s.ScaleDeployment(ctx, s.namespace, workspaceID, 0); err != nil {
		return fmt.Errorf("error stopping workspace: %w", err)
	}

	return nil
}

// DeleteWorkspace removes the Deployment, the Service and the PVC (with the
// files). Parts that are already gone are skipped, so it also cleans up after
// a half-finished create.
func (s *WorkspaceService) DeleteWorkspace(
	ctx context.Context,
	workspaceID string,
) error {
	// The Deployment goes first, so no pod keeps using the volume.
	err := s.k8s.DeleteDeployment(ctx, s.namespace, workspaceID)
	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("Error deleting deployment: %w", err)
	}
	err = s.k8s.DeleteService(ctx, s.namespace, workspaceID)
	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("Error deleting service: %w", err)
	}
	err = s.k8s.DeletePVC(ctx, s.namespace, pvcName(workspaceID))
	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("Error deleting PVC: %w", err)
	}

	return nil
}

func (s *WorkspaceService) GetWorkspaceStatus(
	ctx context.Context,
	workspaceID string,
) (string, error) {
	deployment, err := s.k8s.GetDeployment(ctx, s.namespace, workspaceID)
	if err != nil {
		return "", fmt.Errorf("error getting workspace status: %w", err)
	}

	if deployment.Spec.Replicas != nil && *deployment.Spec.Replicas == 0 {
		return "stopped", nil
	}

	if deployment.Status.AvailableReplicas > 0 {
		return "running", nil
	}

	return "starting", nil
}

func (s *WorkspaceService) ReadFile(
	ctx context.Context,
	workspaceID string,
	path string,
) ([]byte, error) {
	return s.fileAgentRequest(
		ctx, fmt.Sprintf("read file %q", path),
		http.MethodGet, workspaceID, "/files", pathQuery(path), nil,
	)
}

func (s *WorkspaceService) CreateFile(
	ctx context.Context,
	workspaceID string,
	path string,
	content []byte,
) error {
	_, err := s.fileAgentRequest(
		ctx, fmt.Sprintf("create file %q", path),
		http.MethodPost, workspaceID, "/files", pathQuery(path), content,
	)
	return err
}

func (s *WorkspaceService) UpdateFile(
	ctx context.Context,
	workspaceID string,
	path string,
	content []byte,
) error {
	_, err := s.fileAgentRequest(
		ctx, fmt.Sprintf("update file %q", path),
		http.MethodPut, workspaceID, "/files", pathQuery(path), content,
	)
	return err
}

func (s *WorkspaceService) DeleteFile(
	ctx context.Context,
	workspaceID string,
	path string,
) error {
	_, err := s.fileAgentRequest(
		ctx, fmt.Sprintf("delete file %q", path),
		http.MethodDelete, workspaceID, "/files", pathQuery(path), nil,
	)
	return err
}

func (s *WorkspaceService) RenameFile(
	ctx context.Context,
	workspaceID string,
	path string,
	destination string,
) error {
	return s.moveFile(ctx, workspaceID, path, destination, "rename")
}

func (s *WorkspaceService) MoveFile(
	ctx context.Context,
	workspaceID string,
	path string,
	destination string,
) error {
	return s.moveFile(ctx, workspaceID, path, destination, "move")
}

func (s *WorkspaceService) moveFile(
	ctx context.Context,
	workspaceID string,
	path string,
	destination string,
	operation string,
) error {
	query := pathQuery(path)
	query.Set("destination", destination)

	_, err := s.fileAgentRequest(
		ctx, fmt.Sprintf("%s file %q", operation, path),
		http.MethodPost, workspaceID, "/files/"+operation, query, nil,
	)
	return err
}

func (s *WorkspaceService) CreateDirectory(
	ctx context.Context,
	workspaceID string,
	path string,
) error {
	_, err := s.fileAgentRequest(
		ctx, fmt.Sprintf("create directory %q", path),
		http.MethodPost, workspaceID, "/directories", pathQuery(path), nil,
	)
	return err
}

// DeleteDirectory removes a directory with everything in it.
func (s *WorkspaceService) DeleteDirectory(
	ctx context.Context,
	workspaceID string,
	path string,
) error {
	_, err := s.fileAgentRequest(
		ctx, fmt.Sprintf("delete directory %q", path),
		http.MethodDelete, workspaceID, "/directories", pathQuery(path), nil,
	)
	return err
}

func (s *WorkspaceService) ListFiles(
	ctx context.Context,
	workspaceID string,
	path string,
) (*FileNode, error) {
	body, err := s.fileAgentRequest(
		ctx, fmt.Sprintf("list files in %q", path),
		http.MethodGet, workspaceID, "/files/list", pathQuery(path), nil,
	)
	if err != nil {
		return nil, err
	}

	var entries []fileAgentEntry
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil, fmt.Errorf("decode file list response: %w", err)
	}

	result := &FileNode{
		Name: path,
		Type: "directory",
	}
	if result.Name == "" {
		result.Name = "."
	}

	for _, entry := range entries {
		nodeType := "file"
		if entry.IsSymlink {
			nodeType = "symlink"
		} else if entry.IsDir {
			nodeType = "directory"
		}

		result.Children = append(result.Children, FileNode{
			Name: entry.Name,
			Type: nodeType,
			Size: entry.Size,
		})
	}

	return result, nil
}

// fileAgentRequest calls the workspace's file agent and returns the response
// body. op names the operation in error messages, e.g. `read file "a.txt"`.
// A non-2xx answer becomes a *StatusError; a file agent that can't be
// reached becomes ErrUnavailable.
func (s *WorkspaceService) fileAgentRequest(
	ctx context.Context,
	op string,
	method string,
	workspaceID string,
	endpoint string,
	query url.Values,
	body []byte,
) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		method,
		s.fileAgentBaseURL(workspaceID)+endpoint+"?"+query.Encode(),
		reqBody,
	)
	if err != nil {
		return nil, fmt.Errorf("%s: create request: %w", op, err)
	}

	resp, err := s.http.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("%s: %w", op, err)
		}
		// A workspace that doesn't exist (any more) is a 404, not "starting".
		if s.k8s != nil {
			_, getErr := s.k8s.GetDeployment(ctx, s.namespace, workspaceID)
			if apierrors.IsNotFound(getErr) {
				return nil, fmt.Errorf("%s: %w", op, getErr)
			}
		}
		return nil, fmt.Errorf("%s: %w: %w", op, ErrUnavailable, err)
	}
	defer resp.Body.Close()

	limit := int64(maxFileAgentResponse)
	if endpoint == "/files/list" {
		limit = maxFileListResponse
	}
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, fmt.Errorf("%s: read response: %w", op, err)
	}
	if int64(len(respBody)) > limit {
		return nil, fmt.Errorf("%s: response larger than %d bytes", op, limit)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("%s: %w", op, &StatusError{
			Status:  resp.StatusCode,
			Message: fileAgentMessage(respBody),
		})
	}

	return respBody, nil
}

func pathQuery(path string) url.Values {
	query := url.Values{}
	query.Set("path", path)
	return query
}

type fileAgentEntry struct {
	Name      string `json:"name"`
	IsDir     bool   `json:"isDir"`
	IsSymlink bool   `json:"isSymlink"`
	Size      int64  `json:"size"`
}
