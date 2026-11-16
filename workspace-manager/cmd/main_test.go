package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/workspace"
)

type fakeWorkspaceService struct {
	createWorkspace func(context.Context, workspace.CreateWorkspaceRequest) error
	startWorkspace  func(context.Context, string) error
	readFile        func(context.Context, string, string) ([]byte, error)
	listFiles       func(context.Context, string, string) (*workspace.FileNode, error)
	createFile      func(context.Context, string, string, []byte) error
}

func (f *fakeWorkspaceService) CreateWorkspace(ctx context.Context, req workspace.CreateWorkspaceRequest) error {
	return f.createWorkspace(ctx, req)
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

func TestNewRouterHealth(t *testing.T) {
	r := newRouter(&fakeWorkspaceService{})

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

func TestCreateWorkspaceHandler(t *testing.T) {
	var got workspace.CreateWorkspaceRequest
	service := &fakeWorkspaceService{
		createWorkspace: func(_ context.Context, req workspace.CreateWorkspaceRequest) error {
			got = req
			return nil
		},
	}

	body := `{"workspaceID":"ws-1","userID":"user-1"}`
	req := httptest.NewRequest(http.MethodPost, "/workspaces", strings.NewReader(body))
	rec := httptest.NewRecorder()
	newRouter(service).ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
	if got.WorkspaceID != "ws-1" || got.UserID != "user-1" {
		t.Fatalf("unexpected request: %+v", got)
	}
}

func TestCreateWorkspaceHandlerRejectsInvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/workspaces", strings.NewReader("{"))
	rec := httptest.NewRecorder()
	newRouter(&fakeWorkspaceService{}).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
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

	req := httptest.NewRequest(http.MethodGet, "/workspaces/ws-1/files?path=README.md", nil)
	rec := httptest.NewRecorder()
	newRouter(service).ServeHTTP(rec, req)

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

	req := httptest.NewRequest(http.MethodGet, "/workspaces/ws-1/files/list?path=.", nil)
	rec := httptest.NewRecorder()
	newRouter(service).ServeHTTP(rec, req)

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
