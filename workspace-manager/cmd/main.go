package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/clientkube"
	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/workspace"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

func GetClientSet() (*kubernetes.Clientset, error) {

	config, err := rest.InClusterConfig()
	if err == nil {
		log.Println("Using in-cluster Kubernetes configuration.")
		// If successful, create and return the Clientset using this config.
		return kubernetes.NewForConfig(config)
	}

	kubeconfig := filepath.Join(homedir.HomeDir(), ".kube", "config")

	config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to build kubeconfig from %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	return clientset, nil

}

func main() {

	clientset, err := GetClientSet()

	if err != nil {
		panic(err)
	}

	k8sClient, err := clientkube.NewKubernetesClient(clientset)
	if err != nil {
		panic(err)
	}

	service := workspace.NewWorkspaceService(k8sClient)

	r := newRouter(service)

	log.Println("Workspace Manager running on :8080")

	log.Fatal(http.ListenAndServe(":8080", r))
}

type createWorkspaceRequest struct {
	WorkspaceID string `json:"workspaceID"`
	UserID      string `json:"userID"`
}

type workspaceService interface {
	CreateWorkspace(context.Context, workspace.CreateWorkspaceRequest) error
	StartWorkspace(context.Context, string) error
	StopWorkspace(context.Context, string) error
	GetWorkspaceStatus(context.Context, string) (string, error)
	ReadFile(context.Context, string, string) ([]byte, error)
	ListFiles(context.Context, string, string) (*workspace.FileNode, error)
	CreateFile(context.Context, string, string, []byte) error
	UpdateFile(context.Context, string, string, []byte) error
	DeleteFile(context.Context, string, string) error
	RenameFile(context.Context, string, string, string) error
	MoveFile(context.Context, string, string, string) error
	CreateDirectory(context.Context, string, string) error
}

func newRouter(service workspaceService) chi.Router {
	r := chi.NewRouter()

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Up"))
	})
	r.Post("/workspaces", createWorkspaceHandler(service))
	r.Post("/workspaces/{workspaceID}/start", startWorkspaceHandler(service))
	r.Post("/workspaces/{workspaceID}/stop", stopWorkspaceHandler(service))
	r.Get("/workspaces/{workspaceID}/status", workspaceStatusHandler(service))
	r.Get("/workspaces/{workspaceID}/files", readFileHandler(service))
	r.Get("/workspaces/{workspaceID}/files/list", listFilesHandler(service))
	r.Post("/workspaces/{workspaceID}/files", createFileHandler(service))
	r.Put("/workspaces/{workspaceID}/files", updateFileHandler(service))
	r.Delete("/workspaces/{workspaceID}/files", deleteFileHandler(service))
	r.Post("/workspaces/{workspaceID}/files/rename", renameFileHandler(service))
	r.Post("/workspaces/{workspaceID}/files/move", moveFileHandler(service))
	r.Post("/workspaces/{workspaceID}/directories", createDirectoryHandler(service))

	return r
}

func createWorkspaceHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createWorkspaceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		err := service.CreateWorkspace(r.Context(), workspace.CreateWorkspaceRequest{
			WorkspaceID: req.WorkspaceID,
			UserID:      req.UserID,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}

func startWorkspaceHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := service.StartWorkspace(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func stopWorkspaceHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := service.StopWorkspace(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func workspaceStatusHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status, err := service.GetWorkspaceStatus(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte(status))
	}
}

func readFileHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := service.ReadFile(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
			r.URL.Query().Get("path"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(content)
	}
}

func listFilesHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		files, err := service.ListFiles(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
			r.URL.Query().Get("path"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(files); err != nil {
			http.Error(w, "cannot encode file list", http.StatusInternalServerError)
		}
	}
}

func createFileHandler(service workspaceService) http.HandlerFunc {
	return fileContentHandler(service.CreateFile)
}

func updateFileHandler(service workspaceService) http.HandlerFunc {
	return fileContentHandler(service.UpdateFile)
}

func fileContentHandler(
	save func(context.Context, string, string, []byte) error,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "cannot read request body", http.StatusBadRequest)
			return
		}

		err = save(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
			r.URL.Query().Get("path"),
			content,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func deleteFileHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := service.DeleteFile(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
			r.URL.Query().Get("path"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func renameFileHandler(service workspaceService) http.HandlerFunc {
	return moveFileHandlerWith(service.RenameFile)
}

func moveFileHandler(service workspaceService) http.HandlerFunc {
	return moveFileHandlerWith(service.MoveFile)
}

func moveFileHandlerWith(
	move func(context.Context, string, string, string) error,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := move(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
			r.URL.Query().Get("path"),
			r.URL.Query().Get("destination"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func createDirectoryHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := service.CreateDirectory(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
			r.URL.Query().Get("path"),
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}
