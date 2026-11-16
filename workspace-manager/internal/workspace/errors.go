package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// StatusError is a file agent answer other than 2xx (e.g. 404 not found,
// 409 already exists). The HTTP layer forwards Status instead of turning
// every failure into a 500.
type StatusError struct {
	Status  int
	Message string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("file agent returned status %d: %s", e.Status, e.Message)
}

// ErrUnavailable means the workspace's file agent could not be reached,
// e.g. because the workspace is stopped or still starting.
var ErrUnavailable = errors.New("workspace is not reachable")

// fileAgentMessage extracts the message from a file agent error body
// ({"error": "..."}), falling back to the raw body.
func fileAgentMessage(body []byte) string {
	var payload struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(body, &payload) == nil && payload.Error != "" {
		return payload.Error
	}
	return strings.TrimSpace(string(body))
}

// A workspace ID names the Deployment, the Service and the PVC ("<id>-pvc"),
// so it must be a DNS label short enough for the "-pvc" suffix. The "ws-"
// prefix keeps the manager away from everything else in the namespace
// (backend, frontend, postgres, the manager itself).
var workspaceIDPattern = regexp.MustCompile(`^ws-[a-z0-9]([-a-z0-9]{0,46}[a-z0-9])?$`)

func ValidWorkspaceID(id string) bool {
	return workspaceIDPattern.MatchString(id)
}

// The user ID is stored as a Kubernetes label value.
var labelValuePattern = regexp.MustCompile(`^[A-Za-z0-9]([-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$`)

func ValidUserID(id string) bool {
	return labelValuePattern.MatchString(id)
}
