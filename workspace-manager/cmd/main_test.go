package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/workspace"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const testToken = "test-token"

type fakeWorkspaceService struct {
	createWorkspace func(context.Context, workspace.CreateWorkspaceRequest) error
	deleteWorkspace func(context.Context, string) error
	startWorkspace  func(context.Context, string) error
	readFile        func(context.Context, string, string) ([]byte, error)
	listFiles       func(context.Context, string, string) (*workspace.FileNode, error)
	createFile      func(context.Context, string, string, []byte) error
	deleteDirectory func(context.Context, string, string) error
}

func (f *fakeWorkspaceService) CreateWorkspace(ctx context.Context, req workspace.CreateWorkspaceRequest) error {
	return f.createWorkspace(ctx, req)
}

func (f *fakeWorkspaceService) DeleteWorkspace(ctx context.Context, id string) error {
	return f.deleteWorkspace(ctx, id)
}

func (f *fakeWorkspaceService) StartWorkspace(ctx context.Context, id string) error {
	return f.startWorkspace(ctx, id)
}

func (f *fakeWorkspaceService) StopWorkspace(context.Context, string) error { return nil }
func (f *fakeWorkspaceService) GetWorkspaceStatus(context.Context, string) (string, error) {
	return "running", nil
}
func (f *fakeWorkspaceService) ReadFile(ctx context.Context, id, path string) ([]byte, error) {
	return f.readFile(ctx, id, path)
}
func (f *fakeWorkspaceService) ListFiles(ctx context.Context, id, path string) (*workspace.FileNode, error) {
	return f.listFiles(ctx, id, path)
}
func (f *fakeWorkspaceService) CreateFile(ctx context.Context, id, path string, content []byte) error {
	return f.createFile(ctx, id, path, content)
}
func (f *fakeWorkspaceService) UpdateFile(context.Context, string, string, []byte) error { return nil }
func (f *fakeWorkspaceService) DeleteFile(context.Context, string, string) error         { return nil }
func (f *fakeWorkspaceService) RenameFile(context.Context, string, string, string) error { return nil }
func (f *fakeWorkspaceService) MoveFile(context.Context, string, string, string) error   { return nil }
func (f *fakeWorkspaceService) CreateDirectory(context.Context, string, string) error    { return nil }
func (f *fakeWorkspaceService) DeleteDirectory(ctx context.Context, id, path string) error {
	return f.deleteDirectory(ctx, id, path)
}

// serve sends a request with the right token through the router.
func serve(service workspaceService, method, target string, body io.Reader) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, body)
	req.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()
	newRouter(service, testToken).ServeHTTP(rec, req)
	return rec
}

func TestNewRouterHealth(t *testing.T) {
	r := newRouter(&fakeWorkspaceService{}, testToken)

	// No token: the readiness and liveness probes call it without one.
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if got := rec.Body.String(); got != "Up" {
		t.Fatalf("expected body %q, got %q", "Up", got)
	}
}

func TestRouterRejectsRequestsWithoutTheToken(t *testing.T) {
	called := false
	service := &fakeWorkspaceService{
		startWorkspace: func(context.Context, string) error {
			called = true
			return nil
		},
		createWorkspace: func(context.Context, workspace.CreateWorkspaceRequest) error {
			called = true
			return nil
		},
	}

	for _, header := range []string{"", testToken, "Bearer wrong", "Bearer " + testToken + "x", "bearer " + testToken} {
		for _, target := range []string{"/workspaces", "/workspaces/ws-1/start"} {
			req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(`{"workspaceID":"ws-1","userID":"u"}`))
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			rec := httptest.NewRecorder()
			newRouter(service, testToken).ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("%s with Authorization %q: expected status %d, got %d", target, header, http.StatusUnauthorized, rec.Code)
			}
		}
	}
	if called {
		t.Fatal("service was called without a valid token")
	}
}

func TestRouterWithEmptyTokenRejectsEverything(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-1/start", nil)
	req.Header.Set("Authorization", "Bearer ")
	rec := httptest.NewRecorder()
	newRouter(&fakeWorkspaceService{}, "").ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestRouterRejectsWorkspaceIDsOutsideItsOwn(t *testing.T) {
	called := false
	service := &fakeWorkspaceService{
		startWorkspace: func(context.Context, string) error {
			called = true
			return nil
		},
		deleteWorkspace: func(context.Context, string) error {
			called = true
			return nil
		},
	}

	long := "ws-" + strings.Repeat("a", 49)
	for _, id := range []string{"backend", "postgres", "workspace-manager", "ws-", "ws-Upper", "ws-a_b", "ws-a-", long} {
		for _, call := range []struct{ method, target string }{
			{http.MethodPost, "/workspaces/" + id + "/start"},
			{http.MethodDelete, "/workspaces/" + id},
		} {
			rec := serve(service, call.method, call.target, nil)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("%s %s: expected status %d, got %d", call.method, call.target, http.StatusBadRequest, rec.Code)
			}
		}
	}
	if called {
		t.Fatal("service was called with an invalid workspace id")
	}
}

func TestCreateWorkspaceHandler(t *testing.T) {
	var got workspace.CreateWorkspaceRequest
	service := &fakeWorkspaceService{
		createWorkspace: func(_ context.Context, req workspace.CreateWorkspaceRequest) error {
			got = req
			return nil
		},
	}

	body := `{"workspaceID":"ws-1","userID":"user-1"}`
	rec := serve(service, http.MethodPost, "/workspaces", strings.NewReader(body))

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
	if got.WorkspaceID != "ws-1" || got.UserID != "user-1" {
		t.Fatalf("unexpected request: %+v", got)
	}
}

func TestCreateWorkspaceHandlerRejectsInvalidJSON(t *testing.T) {
	rec := serve(&fakeWorkspaceService{}, http.MethodPost, "/workspaces", strings.NewReader("{"))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestCreateWorkspaceHandlerRejectsInvalidIDs(t *testing.T) {
	service := &fakeWorkspaceService{
		createWorkspace: func(context.Context, workspace.CreateWorkspaceRequest) error {
			t.Fatal("service was called with an invalid id")
			return nil
		},
	}

	for _, body := range []string{
		`{"workspaceID":"backend","userID":"user-1"}`,
		`{"workspaceID":"","userID":"user-1"}`,
		`{"workspaceID":"ws-1","userID":""}`,
		`{"workspaceID":"ws-1","userID":"not a label"}`,
	} {
		rec := serve(service, http.MethodPost, "/workspaces", strings.NewReader(body))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected status %d, got %d", body, http.StatusBadRequest, rec.Code)
		}
	}
}

func TestCreateWorkspaceHandlerReportsExistingWorkspaceAsConflict(t *testing.T) {
	service := &fakeWorkspaceService{
		createWorkspace: func(context.Context, workspace.CreateWorkspaceRequest) error {
			return fmt.Errorf("Error creating PVC: %w", apierrors.NewAlreadyExists(
				schema.GroupResource{Resource: "persistentvolumeclaims"}, "ws-1-pvc",
			))
		},
	}

	rec := serve(service, http.MethodPost, "/workspaces", strings.NewReader(`{"workspaceID":"ws-1","userID":"u"}`))

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d", http.StatusConflict, rec.Code)
	}
}

func TestDeleteWorkspaceHandler(t *testing.T) {
	var got string
	service := &fakeWorkspaceService{
		deleteWorkspace: func(_ context.Context, id string) error {
			got = id
			return nil
		},
	}

	rec := serve(service, http.MethodDelete, "/workspaces/ws-1", nil)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
	if got != "ws-1" {
		t.Fatalf("expected workspace %q, got %q", "ws-1", got)
	}
}

func TestStartWorkspaceHandlerReportsMissingWorkspaceAsNotFound(t *testing.T) {
	service := &fakeWorkspaceService{
		startWorkspace: func(context.Context, string) error {
			return fmt.Errorf("error starting workspace: %w", apierrors.NewNotFound(
				schema.GroupResource{Group: "apps", Resource: "deployments"}, "ws-1",
			))
		},
	}

	rec := serve(service, http.MethodPost, "/workspaces/ws-1/start", nil)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
}

func TestReadFileHandler(t *testing.T) {
	service := &fakeWorkspaceService{
		readFile: func(_ context.Context, id, path string) ([]byte, error) {
			if id != "ws-1" || path != "README.md" {
				t.Fatalf("unexpected arguments: %q, %q", id, path)
			}
			return []byte("hello"), nil
		},
	}

	rec := serve(service, http.MethodGet, "/workspaces/ws-1/files?path=README.md", nil)

	if rec.Code != http.StatusOK || rec.Body.String() != "hello" {
		t.Fatalf("expected 200 and body %q, got %d and %q", "hello", rec.Code, rec.Body.String())
	}
}

func TestListFilesHandlerReturnsJSON(t *testing.T) {
	service := &fakeWorkspaceService{
		listFiles: func(context.Context, string, string) (*workspace.FileNode, error) {
			return &workspace.FileNode{
				Name:     ".",
				Type:     "directory",
				Children: []workspace.FileNode{{Name: "main.go", Type: "file"}},
			}, nil
		},
	}

	rec := serve(service, http.MethodGet, "/workspaces/ws-1/files/list?path=.", nil)

	var got workspace.FileNode
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(got.Children) != 1 || got.Children[0].Name != "main.go" {
		t.Fatalf("unexpected files: %+v", got)
	}
}

func TestFileHandlersForwardTheFileAgentStatus(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusNotFound, http.StatusConflict, http.StatusRequestEntityTooLarge} {
		service := &fakeWorkspaceService{
			createFile: func(context.Context, string, string, []byte) error {
				return fmt.Errorf(`create file "a.txt": %w`, &workspace.StatusError{Status: status, Message: "file agent says no"})
			},
		}

		rec := serve(service, http.MethodPost, "/workspaces/ws-1/files?path=a.txt", strings.NewReader("x"))

		if rec.Code != status {
			t.Fatalf("expected status %d, got %d", status, rec.Code)
		}
		if got := strings.TrimSpace(rec.Body.String()); got != "file agent says no" {
			t.Fatalf("expected the file agent's message, got %q", got)
		}
	}
}

func TestFileHandlersReportAnUnreachableWorkspaceAsUnavailable(t *testing.T) {
	service := &fakeWorkspaceService{
		readFile: func(context.Context, string, string) ([]byte, error) {
			return nil, fmt.Errorf(`read file "a.txt": %w: %w`, workspace.ErrUnavailable, errors.New("connection refused"))
		},
	}

	rec := serve(service, http.MethodGet, "/workspaces/ws-1/files?path=a.txt", nil)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d, got %d", http.StatusServiceUnavailable, rec.Code)
	}
}

func TestFileContentHandlerReturnsServerError(t *testing.T) {
	save := func(context.Context, string, string, []byte) error {
		return errors.New("storage unavailable")
	}

	req := httptest.NewRequest(http.MethodPost, "/workspaces/ws-1/files?path=main.go", strings.NewReader("package main"))
	rec := httptest.NewRecorder()
	fileContentHandler(save).ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "storage unavailable") {
		t.Fatalf("expected error body, got %q", rec.Body.String())
	}
}

func TestDeleteDirectoryHandler(t *testing.T) {
	var gotID, gotPath string
	service := &fakeWorkspaceService{
		deleteDirectory: func(_ context.Context, id, path string) error {
			gotID, gotPath = id, path
			return nil
		},
	}

	rec := serve(service, http.MethodDelete, "/workspaces/ws-1/directories?path=src%2Flib", nil)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
	if gotID != "ws-1" || gotPath != "src/lib" {
		t.Fatalf("unexpected arguments: %q, %q", gotID, gotPath)
	}
}

func TestDeleteDirectoryHandlerForwardsNotFound(t *testing.T) {
	service := &fakeWorkspaceService{
		deleteDirectory: func(context.Context, string, string) error {
			return &workspace.StatusError{Status: http.StatusNotFound, Message: "file not found"}
		},
	}

	rec := serve(service, http.MethodDelete, "/workspaces/ws-1/directories?path=src", nil)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
}
