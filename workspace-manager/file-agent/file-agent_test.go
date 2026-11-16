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
