package workspace

import (
	"context"
	"strings"
	"testing"
)

func canceledContext() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
}

func assertServiceErrorContains(t *testing.T, err error, want string) {
	t.Helper()

	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("expected error to contain %q, got %q", want, err.Error())
	}
}

func TestReadFileReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	_, err := service.ReadFile(canceledContext(), "workspace-1", "README.md")

	assertServiceErrorContains(t, err, `read file "README.md"`)
}

func TestCreateFileReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	err := service.CreateFile(canceledContext(), "workspace-1", "main.go", []byte("package main"))

	assertServiceErrorContains(t, err, `create file "main.go"`)
}

func TestUpdateFileReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	err := service.UpdateFile(canceledContext(), "workspace-1", "main.go", []byte("package main"))

	assertServiceErrorContains(t, err, `update file "main.go"`)
}

func TestDeleteFileReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	err := service.DeleteFile(canceledContext(), "workspace-1", "main.go")

	assertServiceErrorContains(t, err, `delete file "main.go"`)
}

func TestCreateDirectoryReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	err := service.CreateDirectory(canceledContext(), "workspace-1", "src")

	assertServiceErrorContains(t, err, `create directory "src"`)
}

func TestListFilesReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	_, err := service.ListFiles(canceledContext(), "workspace-1", ".")

	assertServiceErrorContains(t, err, `list files in "."`)
}

func TestRenameFileReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	err := service.RenameFile(canceledContext(), "workspace-1", "old.go", "new.go")

	assertServiceErrorContains(t, err, `rename file "old.go"`)
}

func TestMoveFileReturnsRequestError(t *testing.T) {
	service := NewWorkspaceService(nil)

	err := service.MoveFile(canceledContext(), "workspace-1", "old.go", "src/old.go")

	assertServiceErrorContains(t, err, `move file "old.go"`)
}
