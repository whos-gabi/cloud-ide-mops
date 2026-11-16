package workspace

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/clientkube"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

func TestWorkspaceServiceKubernetesIntegration(t *testing.T) {
	if os.Getenv("RUN_K8S_INTEGRATION") != "1" {
		t.Skip("set RUN_K8S_INTEGRATION=1 to run against Kubernetes")
	}

	configPath := os.Getenv("KUBECONFIG")
	if configPath == "" {
		configPath = filepath.Join(homedir.HomeDir(), ".kube", "config")
	}

	config, err := clientcmd.BuildConfigFromFlags("", configPath)
	if err != nil {
		t.Fatalf("build Kubernetes config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		t.Fatalf("create Kubernetes clientset: %v", err)
	}

	k8sClient, err := clientkube.NewKubernetesClient(clientset)
	if err != nil {
		t.Fatalf("create Kubernetes client: %v", err)
	}

	service := NewWorkspaceService(k8sClient)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	workspaceID := "tdd-integration-" + time.Now().Format("20060102150405")
	req := CreateWorkspaceRequest{
		WorkspaceID: workspaceID,
		UserID:      "tdd-user",
	}

	if err := service.CreateWorkspace(ctx, req); err != nil {
		t.Fatalf("create workspace resources: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanupCancel()
		if err := service.DeleteWorkspace(cleanupCtx, workspaceID); err != nil {
			t.Errorf("delete workspace resources: %v", err)
		}
	})

	if _, err := k8sClient.GetPVC(ctx, configuredNamespace(), workspaceID+"-pvc"); err != nil {
		t.Fatalf("verify PVC: %v", err)
	}
	if _, err := k8sClient.GetDeployment(ctx, configuredNamespace(), workspaceID); err != nil {
		t.Fatalf("verify deployment: %v", err)
	}
	if _, err := k8sClient.GetService(ctx, configuredNamespace(), workspaceID); err != nil {
		t.Fatalf("verify service: %v", err)
	}

	if err := retryOnConflict(func() error {
		return service.StopWorkspace(ctx, workspaceID)
	}); err != nil {
		t.Fatalf("stop workspace: %v", err)
	}
	status, err := service.GetWorkspaceStatus(ctx, workspaceID)
	if err != nil {
		t.Fatalf("get stopped workspace status: %v", err)
	}
	if status != "stopped" {
		t.Fatalf("expected stopped status, got %q", status)
	}

	if err := retryOnConflict(func() error {
		return service.StartWorkspace(ctx, workspaceID)
	}); err != nil {
		t.Fatalf("start workspace: %v", err)
	}
	deployment, err := k8sClient.GetDeployment(ctx, configuredNamespace(), workspaceID)
	if err != nil {
		t.Fatalf("get started deployment: %v", err)
	}
	if deployment.Spec.Replicas == nil || *deployment.Spec.Replicas != 1 {
		t.Fatalf("expected one replica after start, got %v", deployment.Spec.Replicas)
	}
}

func retryOnConflict(operation func() error) error {
	var err error
	for attempt := 0; attempt < 5; attempt++ {
		err = operation()
		if err == nil || !strings.Contains(err.Error(), "object has been modified") {
			return err
		}
		time.Sleep(250 * time.Millisecond)
	}
	return err
}
