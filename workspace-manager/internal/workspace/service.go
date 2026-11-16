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

	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/clientkube"
)

type WorkspaceService struct {
	k8s       *clientkube.KubernetesClient
	namespace string
}

func NewWorkspaceService(
	k8s *clientkube.KubernetesClient,
) *WorkspaceService {
	return &WorkspaceService{
		k8s:       k8s,
		namespace: configuredNamespace(),
	}
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

func (s *WorkspaceService) DeleteWorkspace(
	ctx context.Context,
	workspaceID string,
) error {

	err := s.k8s.DeleteService(ctx, s.namespace, workspaceID)
	if err != nil {
		return fmt.Errorf("Error deleting service: %w", err)
	}
	err = s.k8s.DeletePVC(ctx, s.namespace, workspaceID+"-pvc")
	if err != nil {
		return fmt.Errorf("Error deleting PVC: %w", err)
	}
	err = s.k8s.DeleteDeployment(ctx, s.namespace, workspaceID)
	if err != nil {
		return fmt.Errorf("Error deleting deployment: %w", err)
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
	serviceURL := "http://" + workspaceID + "." + s.namespace + ".svc.cluster.local:8081/files"

	query := url.Values{}
	query.Set("path", path)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		serviceURL+"?"+query.Encode(),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("create file read request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("read file %q: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read file response body: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf(
			"file agent returned status %s: %s",
			resp.Status,
			string(body),
		)
	}

	return body, nil
}

func (s *WorkspaceService) CreateFile(
	ctx context.Context,
	workspaceID string,
	path string,
	content []byte,
) error {
	serviceURL := s.fileAgentURL(workspaceID, "/files")

	query := url.Values{}
	query.Set("path", path)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		serviceURL+"?"+query.Encode(),
		bytes.NewReader(content),
	)
	if err != nil {
		return fmt.Errorf("create file request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("create file %q: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read create file response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf(
			"file agent returned status %s: %s",
			resp.Status,
			string(body),
		)
	}

	return nil
}

func (s *WorkspaceService) UpdateFile(
	ctx context.Context,
	workspaceID string,
	path string,
	content []byte,
) error {
	serviceURL := s.fileAgentURL(workspaceID, "/files")

	query := url.Values{}
	query.Set("path", path)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPut,
		serviceURL+"?"+query.Encode(),
		bytes.NewReader(content),
	)
	if err != nil {
		return fmt.Errorf("create update file request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("update file %q: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read update file response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf(
			"file agent returned status %s: %s",
			resp.Status,
			string(body),
		)
	}

	return nil
}

func (s *WorkspaceService) DeleteFile(
	ctx context.Context,
	workspaceID string,
	path string,
) error {
	serviceURL := s.fileAgentURL(workspaceID, "/files")

	query := url.Values{}
	query.Set("path", path)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodDelete,
		serviceURL+"?"+query.Encode(),
		nil,
	)
	if err != nil {
		return fmt.Errorf("create delete file request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("delete file %q: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read delete file response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf(
			"file agent returned status %s: %s",
			resp.Status,
			string(body),
		)
	}

	return nil
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
	serviceURL := s.fileAgentURL(workspaceID, "/files/"+operation)

	query := url.Values{}
	query.Set("path", path)
	query.Set("destination", destination)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		serviceURL+"?"+query.Encode(),
		nil,
	)
	if err != nil {
		return fmt.Errorf("create %s file request: %w", operation, err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("%s file %q: %w", operation, path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read %s file response: %w", operation, err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf(
			"file agent returned status %s: %s",
			resp.Status,
			string(body),
		)
	}

	return nil
}

func (s *WorkspaceService) CreateDirectory(
	ctx context.Context,
	workspaceID string,
	path string,
) error {
	serviceURL := s.fileAgentURL(workspaceID, "/directories")

	query := url.Values{}
	query.Set("path", path)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		serviceURL+"?"+query.Encode(),
		nil,
	)
	if err != nil {
		return fmt.Errorf("create directory request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("create directory %q: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read create directory response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf(
			"file agent returned status %s: %s",
			resp.Status,
			string(body),
		)
	}

	return nil
}

func (s *WorkspaceService) ListFiles(
	ctx context.Context,
	workspaceID string,
	path string,
) (*FileNode, error) {
	serviceURL := s.fileAgentURL(workspaceID, "/files/list")

	query := url.Values{}
	query.Set("path", path)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		serviceURL+"?"+query.Encode(),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("create file list request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("list files in %q: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read file list response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf(
			"file agent returned status %s: %s",
			resp.Status,
			string(body),
		)
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

type fileAgentEntry struct {
	Name      string `json:"name"`
	IsDir     bool   `json:"isDir"`
	IsSymlink bool   `json:"isSymlink"`
	Size      int64  `json:"size"`
}
