package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

const maxFileSize = 10 << 20 // 10 MB

type FileAgent struct {
	root *os.Root
}

type FileInfo struct {
	Name      string    `json:"name"`
	IsDir     bool      `json:"isDir"`
	IsSymlink bool      `json:"isSymlink"`
	Size      int64     `json:"size"`
	ModTime   time.Time `json:"modTime"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

func main() {
	rootPath := getEnv("FILE_AGENT_ROOT", "/workspace")
	addr := getEnv("FILE_AGENT_ADDR", ":8081")

	root, err := os.OpenRoot(rootPath)
	if err != nil {
		log.Fatalf("cannot open workspace root: %v", err)
	}
	defer root.Close()

	agent := &FileAgent{
		root: root,
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("/files", agent.handleFile)
	mux.HandleFunc("/files/list", agent.handleList)
	mux.HandleFunc("/files/rename", agent.handleRename)
	mux.HandleFunc("/files/move", agent.handleMove)
	mux.HandleFunc("/directories", agent.handleDirectory)

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("File Agent listening on %s", addr)

	if err := server.ListenAndServe(); err != nil &&
		!errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server error: %v", err)
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

// ------------------------------------------------------------------
// File operations
// ------------------------------------------------------------------

func (a *FileAgent) handleFile(w http.ResponseWriter, r *http.Request) {
	path, err := safePath(r.URL.Query().Get("path"), false)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	switch r.Method {
	case http.MethodGet:
		a.readFile(w, path)

	case http.MethodPut:
		a.writeFile(w, r, path, false)

	case http.MethodPost:
		a.writeFile(w, r, path, true)

	case http.MethodDelete:
		a.deleteFile(w, path)

	default:
		w.Header().Set("Allow", "GET, PUT, POST, DELETE")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (a *FileAgent) handleRename(w http.ResponseWriter, r *http.Request) {
	a.handleMovePath(w, r)
}

func (a *FileAgent) handleMove(w http.ResponseWriter, r *http.Request) {
	a.handleMovePath(w, r)
}

func (a *FileAgent) handleMovePath(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	source, err := safePath(r.URL.Query().Get("path"), false)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid source path")
		return
	}

	destination, err := safePath(r.URL.Query().Get("destination"), false)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid destination path")
		return
	}

	info, err := a.root.Stat(source)
	if err != nil {
		handleFileError(w, err)
		return
	}
	if !info.Mode().IsRegular() {
		writeError(w, http.StatusBadRequest, "path is not a regular file")
		return
	}

	if err := a.root.Rename(source, destination); err != nil {
		handleFileError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *FileAgent) readFile(w http.ResponseWriter, path string) {
	file, err := a.root.Open(path)
	if err != nil {
		handleFileError(w, err)
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot inspect file")
		return
	}

	if !info.Mode().IsRegular() {
		writeError(w, http.StatusBadRequest, "path is not a regular file")
		return
	}

	if info.Size() > maxFileSize {
		writeError(w, http.StatusRequestEntityTooLarge, "file too large")
		return
	}

	contentType := mime.TypeByExtension(filepath.Ext(path))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))

	if _, err := io.Copy(w, file); err != nil {
		log.Printf("file read error: %v", err)
	}
}

func (a *FileAgent) writeFile(
	w http.ResponseWriter,
	r *http.Request,
	path string,
	createOnly bool,
) {
	r.Body = http.MaxBytesReader(w, r.Body, maxFileSize)
	defer r.Body.Close()

	content, err := io.ReadAll(r.Body)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "file too large")
			return
		}

		writeError(w, http.StatusBadRequest, "cannot read request body")
		return
	}

	flags := os.O_WRONLY | os.O_CREATE
	if createOnly {
		flags |= os.O_EXCL
	} else {
		flags |= os.O_TRUNC
	}

	file, err := a.root.OpenFile(path, flags, 0644)
	if err != nil {
		if createOnly && errors.Is(err, fs.ErrExist) {
			writeError(w, http.StatusConflict, "file already exists")
			return
		}
		handleFileError(w, err)
		return
	}

	_, writeErr := file.Write(content)
	closeErr := file.Close()

	if writeErr != nil || closeErr != nil {
		writeError(w, http.StatusInternalServerError, "cannot write file")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *FileAgent) deleteFile(w http.ResponseWriter, path string) {
	info, err := a.root.Stat(path)
	if err != nil {
		handleFileError(w, err)
		return
	}

	if !info.Mode().IsRegular() {
		writeError(w, http.StatusBadRequest, "path is not a regular file")
		return
	}

	if err := a.root.Remove(path); err != nil {
		handleFileError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ------------------------------------------------------------------
// Directory operations
// ------------------------------------------------------------------

func (a *FileAgent) handleList(w http.ResponseWriter, r *http.Request) {
	path, err := safePath(r.URL.Query().Get("path"), true)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	dir, err := a.root.Open(path)
	if err != nil {
		handleFileError(w, err)
		return
	}
	defer dir.Close()

	info, err := dir.Stat()
	if err != nil {
		handleFileError(w, err)
		return
	}

	if !info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is not a directory")
		return
	}

	entries, err := dir.ReadDir(-1)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot list directory")
		return
	}

	result := make([]FileInfo, 0, len(entries))

	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		result = append(result, FileInfo{
			Name:      entry.Name(),
			IsDir:     entry.IsDir(),
			IsSymlink: entry.Type()&os.ModeSymlink != 0,
			Size:      info.Size(),
			ModTime:   info.ModTime(),
		})
	}

	writeJSON(w, http.StatusOK, result)
}

func (a *FileAgent) handleDirectory(w http.ResponseWriter, r *http.Request) {
	path, err := safePath(r.URL.Query().Get("path"), false)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := a.root.Mkdir(path, 0755); err != nil {
		if errors.Is(err, fs.ErrExist) {
			writeError(w, http.StatusConflict, "directory already exists")
			return
		}

		handleFileError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// ------------------------------------------------------------------
// Path validation
// ------------------------------------------------------------------

func safePath(raw string, allowRoot bool) (string, error) {
	if !utf8.ValidString(raw) || strings.ContainsRune(raw, '\x00') {
		return "", errors.New("invalid path")
	}

	// API-ul primește paths relative, cu separator /.
	if strings.Contains(raw, "\\") {
		return "", errors.New("invalid path")
	}

	if raw == "" {
		if allowRoot {
			return ".", nil
		}
		return "", errors.New("empty path")
	}

	cleaned := filepath.Clean(filepath.FromSlash(raw))

	// Respinge absolute paths, ../ și alte forme non-locale.
	if !filepath.IsLocal(cleaned) || cleaned == "." {
		return "", errors.New("path outside workspace")
	}

	return cleaned, nil
}

// ------------------------------------------------------------------
// HTTP helpers
// ------------------------------------------------------------------

func handleFileError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		writeError(w, http.StatusNotFound, "file not found")

	case errors.Is(err, fs.ErrPermission):
		writeError(w, http.StatusForbidden, "permission denied")

	case errors.Is(err, fs.ErrExist):
		writeError(w, http.StatusConflict, "already exists")

	default:
		log.Printf("filesystem error: %v", err)
		writeError(w, http.StatusInternalServerError, "filesystem operation failed")
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, ErrorResponse{Error: message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
