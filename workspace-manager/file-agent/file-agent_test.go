package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func newTestAgent(t *testing.T) (*FileAgent, string) {
	t.Helper()

	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatalf("open test root: %v", err)
	}
	t.Cleanup(func() {
		_ = root.Close()
	})

	return &FileAgent{root: root}, dir
}

func TestHandleRenameRenamesFile(t *testing.T) {
	agent, dir := newTestAgent(t)
	source := filepath.Join(dir, "old.txt")
	if err := os.WriteFile(source, []byte("content"), 0644); err != nil {
		t.Fatalf("create source file: %v", err)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/files/rename?path=old.txt&destination=new.txt",
		nil,
	)
	rec := httptest.NewRecorder()
	agent.handleRename(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
	if _, err := os.Stat(filepath.Join(dir, "old.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected old file to be removed, got %v", err)
	}
	if content, err := os.ReadFile(filepath.Join(dir, "new.txt")); err != nil || string(content) != "content" {
		t.Fatalf("expected renamed content, got %q and error %v", content, err)
	}
}

func TestHandleMoveMovesFileToExistingDirectory(t *testing.T) {
	agent, dir := newTestAgent(t)
	if err := os.Mkdir(filepath.Join(dir, "archive"), 0755); err != nil {
		t.Fatalf("create destination directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main"), 0644); err != nil {
		t.Fatalf("create source file: %v", err)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/files/move?path=main.go&destination=archive/main.go",
		nil,
	)
	rec := httptest.NewRecorder()
	agent.handleMove(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
	if _, err := os.Stat(filepath.Join(dir, "main.go")); !os.IsNotExist(err) {
		t.Fatalf("expected source file to be removed, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "archive", "main.go")); err != nil {
		t.Fatalf("expected moved file: %v", err)
	}
}

func TestHandleMoveRejectsPathOutsideWorkspace(t *testing.T) {
	agent, _ := newTestAgent(t)

	req := httptest.NewRequest(
		http.MethodPost,
		"/files/move?path=main.go&destination=../main.go",
		nil,
	)
	rec := httptest.NewRecorder()
	agent.handleMove(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestDeleteDirectoryRemovesItWithEverythingInside(t *testing.T) {
	agent, dir := newTestAgent(t)
	if err := os.MkdirAll(filepath.Join(dir, "src", "lib", "deep"), 0755); err != nil {
		t.Fatalf("create directories: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "src", "lib", "deep", "a.py"), []byte("x"), 0644); err != nil {
		t.Fatalf("create file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "keep.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("create file: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/directories?path=src", nil)
	rec := httptest.NewRecorder()
	agent.handleDirectory(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d: %s", http.StatusNoContent, rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "src")); !os.IsNotExist(err) {
		t.Fatalf("expected src to be removed, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "keep.txt")); err != nil {
		t.Fatalf("expected other files to stay: %v", err)
	}
}

func TestDeleteDirectoryDoesNotFollowSymlinksOutOfIt(t *testing.T) {
	agent, dir := newTestAgent(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "precious.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("create outside file: %v", err)
	}
	if err := os.Mkdir(filepath.Join(dir, "src"), 0755); err != nil {
		t.Fatalf("create directory: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "src", "link")); err != nil {
		t.Fatalf("create symlink: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/directories?path=src", nil)
	rec := httptest.NewRecorder()
	agent.handleDirectory(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d: %s", http.StatusNoContent, rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(outside, "precious.txt")); err != nil {
		t.Fatalf("a file outside the workspace was removed: %v", err)
	}
}

func TestDeleteDirectoryRejectsFilesMissingPathsAndTheRoot(t *testing.T) {
	agent, dir := newTestAgent(t)
	if err := os.WriteFile(filepath.Join(dir, "main.py"), []byte("x"), 0644); err != nil {
		t.Fatalf("create file: %v", err)
	}

	for target, want := range map[string]int{
		"/directories?path=main.py":   http.StatusBadRequest,
		"/directories?path=missing":   http.StatusNotFound,
		"/directories?path=":          http.StatusBadRequest,
		"/directories?path=.":         http.StatusBadRequest,
		"/directories?path=../escape": http.StatusBadRequest,
	} {
		req := httptest.NewRequest(http.MethodDelete, target, nil)
		rec := httptest.NewRecorder()
		agent.handleDirectory(rec, req)

		if rec.Code != want {
			t.Fatalf("%s: expected status %d, got %d", target, want, rec.Code)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "main.py")); err != nil {
		t.Fatalf("expected main.py to stay: %v", err)
	}
}

func TestCreateInsideAFileIsABadRequest(t *testing.T) {
	agent, dir := newTestAgent(t)
	if err := os.WriteFile(filepath.Join(dir, "main.py"), []byte("x"), 0644); err != nil {
		t.Fatalf("create file: %v", err)
	}

	for _, call := range []struct {
		handler func(http.ResponseWriter, *http.Request)
		target  string
	}{
		{agent.handleFile, "/files?path=main.py/a.txt"},
		{agent.handleDirectory, "/directories?path=main.py/src"},
	} {
		req := httptest.NewRequest(http.MethodPost, call.target, nil)
		rec := httptest.NewRecorder()
		call.handler(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected status %d, got %d: %s", call.target, http.StatusBadRequest, rec.Code, rec.Body.String())
		}
	}
}
