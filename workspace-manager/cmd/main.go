package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/clientkube"
	"github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/workspace"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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
	// Shared with the backend through the workspace-manager-token secret.
	token := os.Getenv("WORKSPACE_MANAGER_TOKEN")
	if token == "" {
		log.Fatal("WORKSPACE_MANAGER_TOKEN is not set")
	}

	clientset, err := GetClientSet()

	if err != nil {
		panic(err)
	}

	k8sClient, err := clientkube.NewKubernetesClient(clientset)
	if err != nil {
		panic(err)
	}

	service := workspace.NewWorkspaceService(k8sClient)

	r := newRouter(service, token)

	log.Println("Workspace Manager running on :8080")

	log.Fatal(http.ListenAndServe(":8080", r))
}

type createWorkspaceRequest struct {
	WorkspaceID string `json:"workspaceID"`
	UserID      string `json:"userID"`
}

type workspaceService interface {
	CreateWorkspace(context.Context, workspace.CreateWorkspaceRequest) error
	DeleteWorkspace(context.Context, string) error
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

// Every route except /health needs "Authorization: Bearer <token>".
func newRouter(service workspaceService, token string) chi.Router {
	r := chi.NewRouter()

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Up"))
	})

	r.Group(func(r chi.Router) {
		r.Use(requireToken(token))

		r.Post("/workspaces", createWorkspaceHandler(service))

		r.Route("/workspaces/{workspaceID}", func(r chi.Router) {
			r.Use(requireValidWorkspaceID)

			r.Delete("/", deleteWorkspaceHandler(service))
			r.Post("/start", startWorkspaceHandler(service))
			r.Post("/stop", stopWorkspaceHandler(service))
			r.Get("/status", workspaceStatusHandler(service))
			r.Get("/files", readFileHandler(service))
			r.Get("/files/list", listFilesHandler(service))
			r.Post("/files", createFileHandler(service))
			r.Put("/files", updateFileHandler(service))
			r.Delete("/files", deleteFileHandler(service))
			r.Post("/files/rename", renameFileHandler(service))
			r.Post("/files/move", moveFileHandler(service))
			r.Post("/directories", createDirectoryHandler(service))
		})
	})

	return r
}

// requireToken rejects requests without the shared token. An empty token
// rejects everything, so a missing secret can't open the API.
func requireToken(token string) func(http.Handler) http.Handler {
	expected := []byte("Bearer " + token)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := []byte(r.Header.Get("Authorization"))
			if token == "" || subtle.ConstantTimeCompare(got, expected) != 1 {
				w.Header().Set("WWW-Authenticate", "Bearer")
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// requireValidWorkspaceID keeps the manager to its own resources: only
// "ws-..." names, never e.g. the backend's Deployment.
func requireValidWorkspaceID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !workspace.ValidWorkspaceID(chi.URLParam(r, "workspaceID")) {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// writeServiceError answers with the status that matches err: what the file
// agent answered, 503 if the workspace can't be reached, or the Kubernetes
// error's meaning. Anything else is a 500.
func writeServiceError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	message := err.Error()

	var statusErr *workspace.StatusError
	switch {
	case errors.As(err, &statusErr):
		status, message = statusErr.Status, statusErr.Message
	case errors.Is(err, workspace.ErrUnavailable):
		status = http.StatusServiceUnavailable
	case apierrors.IsNotFound(err):
		status = http.StatusNotFound
	case apierrors.IsAlreadyExists(err):
		status = http.StatusConflict
	case apierrors.IsInvalid(err):
		status = http.StatusBadRequest
	}

	if status >= http.StatusInternalServerError {
		log.Printf("request failed (%d): %v", status, err)
	}
	http.Error(w, message, status)
}

func createWorkspaceHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createWorkspaceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if !workspace.ValidWorkspaceID(req.WorkspaceID) {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		if !workspace.ValidUserID(req.UserID) {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		err := service.CreateWorkspace(r.Context(), workspace.CreateWorkspaceRequest{
			WorkspaceID: req.WorkspaceID,
			UserID:      req.UserID,
		})
		if err != nil {
			writeServiceError(w, err)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}

func deleteWorkspaceHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := service.DeleteWorkspace(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
		)
		if err != nil {
			writeServiceError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func startWorkspaceHandler(service workspaceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := service.StartWorkspace(
			r.Context(),
			chi.URLParam(r, "workspaceID"),
		)
		if err != nil {
			writeServiceError(w, err)
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
			writeServiceError(w, err)
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
			writeServiceError(w, err)
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
			writeServiceError(w, err)
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
			writeServiceError(w, err)
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
			writeServiceError(w, err)
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
			writeServiceError(w, err)
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
			writeServiceError(w, err)
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
			writeServiceError(w, err)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}
