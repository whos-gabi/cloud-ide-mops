package workspace

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/clientkube"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
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

func newFakeKubernetesService(t *testing.T) (*WorkspaceService, *fake.Clientset) {
	t.Helper()

	clientset := fake.NewClientset()
	k8s, err := clientkube.NewKubernetesClient(clientset)
	if err != nil {
		t.Fatalf("create Kubernetes client: %v", err)
	}
	service := NewWorkspaceService(k8s)
	service.namespace = "cloud-ide"
	return service, clientset
}

func TestCreateWorkspaceCreatesLabeledResources(t *testing.T) {
	service, clientset := newFakeKubernetesService(t)
	ctx := context.Background()

	err := service.CreateWorkspace(ctx, CreateWorkspaceRequest{WorkspaceID: "ws-1", UserID: "user-1"})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	deployment, err := clientset.AppsV1().Deployments("cloud-ide").Get(ctx, "ws-1", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get deployment: %v", err)
	}
	pvc, err := clientset.CoreV1().PersistentVolumeClaims("cloud-ide").Get(ctx, "ws-1-pvc", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get pvc: %v", err)
	}
	svc, err := clientset.CoreV1().Services("cloud-ide").Get(ctx, "ws-1", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get service: %v", err)
	}

	for name, labels := range map[string]map[string]string{
		"deployment": deployment.Labels,
		"pod":        deployment.Spec.Template.Labels,
		"pvc":        pvc.Labels,
		"service":    svc.Labels,
	} {
		if labels["app.kubernetes.io/managed-by"] != "workspace-manager" || labels["workspace-id"] != "ws-1" || labels["user-id"] != "user-1" {
			t.Fatalf("%s has labels %v", name, labels)
		}
	}

	pod := deployment.Spec.Template.Spec
	if pod.AutomountServiceAccountToken == nil || *pod.AutomountServiceAccountToken {
		t.Fatal("workspace pods must not get a Kubernetes API token")
	}
	if pod.EnableServiceLinks == nil || *pod.EnableServiceLinks {
		t.Fatal("workspace pods must not get service link env vars")
	}
}

func TestDeleteWorkspaceRemovesEverything(t *testing.T) {
	service, clientset := newFakeKubernetesService(t)
	ctx := context.Background()

	if err := service.CreateWorkspace(ctx, CreateWorkspaceRequest{WorkspaceID: "ws-1", UserID: "user-1"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := service.DeleteWorkspace(ctx, "ws-1"); err != nil {
		t.Fatalf("delete workspace: %v", err)
	}

	if _, err := clientset.AppsV1().Deployments("cloud-ide").Get(ctx, "ws-1", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("expected deployment to be gone, got %v", err)
	}
	if _, err := clientset.CoreV1().Services("cloud-ide").Get(ctx, "ws-1", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("expected service to be gone, got %v", err)
	}
	if _, err := clientset.CoreV1().PersistentVolumeClaims("cloud-ide").Get(ctx, "ws-1-pvc", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("expected pvc to be gone, got %v", err)
	}
}

func TestDeleteWorkspaceRemovesEverythingAndToleratesMissingParts(t *testing.T) {
	service, clientset := newFakeKubernetesService(t)
	ctx := context.Background()

	if err := service.CreateWorkspace(ctx, CreateWorkspaceRequest{WorkspaceID: "ws-1", UserID: "user-1"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	// A half-created workspace: the Service never got created.
	if err := clientset.CoreV1().Services("cloud-ide").Delete(ctx, "ws-1", metav1.DeleteOptions{}); err != nil {
		t.Fatalf("delete service: %v", err)
	}

	if err := service.DeleteWorkspace(ctx, "ws-1"); err != nil {
		t.Fatalf("delete workspace: %v", err)
	}

	if _, err := clientset.AppsV1().Deployments("cloud-ide").Get(ctx, "ws-1", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("expected deployment to be gone, got %v", err)
	}
	if _, err := clientset.CoreV1().PersistentVolumeClaims("cloud-ide").Get(ctx, "ws-1-pvc", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("expected pvc to be gone, got %v", err)
	}

	// Deleting it again is not an error.
	if err := service.DeleteWorkspace(ctx, "ws-1"); err != nil {
		t.Fatalf("delete missing workspace: %v", err)
	}
}

func TestFileAgentErrorBecomesStatusError(t *testing.T) {
	agent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/files" || r.URL.Query().Get("path") != "a.txt" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"file already exists"}` + "\n"))
	}))
	defer agent.Close()

	service := NewWorkspaceService(nil)
	service.fileAgentBaseURL = func(string) string { return agent.URL }

	err := service.CreateFile(context.Background(), "ws-1", "a.txt", []byte("x"))

	var statusErr *StatusError
	if !errors.As(err, &statusErr) {
		t.Fatalf("expected a StatusError, got %v", err)
	}
	if statusErr.Status != http.StatusConflict || statusErr.Message != "file already exists" {
		t.Fatalf("unexpected status error: %+v", statusErr)
	}
}

func closedServerURL() string {
	agent := httptest.NewServer(http.NotFoundHandler())
	agent.Close()
	return agent.URL
}

func TestUnreachableFileAgentIsUnavailable(t *testing.T) {
	service, _ := newFakeKubernetesService(t)
	if err := service.CreateWorkspace(context.Background(), CreateWorkspaceRequest{WorkspaceID: "ws-1", UserID: "user-1"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	url := closedServerURL()
	service.fileAgentBaseURL = func(string) string { return url }

	_, err := service.ListFiles(context.Background(), "ws-1", "")

	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected ErrUnavailable, got %v", err)
	}
}

func TestFileCallOnAMissingWorkspaceIsNotFound(t *testing.T) {
	service, _ := newFakeKubernetesService(t)
	url := closedServerURL()
	service.fileAgentBaseURL = func(string) string { return url }

	_, err := service.ReadFile(context.Background(), "ws-gone", "a.txt")

	if !apierrors.IsNotFound(err) || errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected a not-found error, got %v", err)
	}
}

func TestOversizedFileAgentAnswerIsAnError(t *testing.T) {
	agent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(bytes.Repeat([]byte("a"), maxFileAgentResponse+1))
	}))
	defer agent.Close()

	service := NewWorkspaceService(nil)
	service.fileAgentBaseURL = func(string) string { return agent.URL }

	if _, err := service.ReadFile(context.Background(), "ws-1", "big.bin"); err == nil {
		t.Fatal("expected an error instead of a truncated file")
	}
}

func TestValidWorkspaceID(t *testing.T) {
	for _, id := range []string{"ws-1", "ws-0f8c2b1e-6a9d-4c3b-9a51-2f7e8d6c4b10", "ws-" + strings.Repeat("a", 48)} {
		if !ValidWorkspaceID(id) {
			t.Errorf("expected %q to be valid", id)
		}
	}
	for _, id := range []string{"", "ws-", "ws--", "ws-a-", "backend", "WS-1", "ws-A", "ws-a.b", "ws-" + strings.Repeat("a", 49)} {
		if ValidWorkspaceID(id) {
			t.Errorf("expected %q to be invalid", id)
		}
	}
}

func TestDeleteDirectoryCallsTheFileAgent(t *testing.T) {
	var got string
	agent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Method + " " + r.URL.Path + "?" + r.URL.RawQuery
		w.WriteHeader(http.StatusNoContent)
	}))
	defer agent.Close()

	service := NewWorkspaceService(nil)
	service.fileAgentBaseURL = func(string) string { return agent.URL }

	if err := service.DeleteDirectory(context.Background(), "ws-1", "src/lib"); err != nil {
		t.Fatalf("delete directory: %v", err)
	}
	if got != "DELETE /directories?path=src%2Flib" {
		t.Fatalf("unexpected file agent request %q", got)
	}
}
