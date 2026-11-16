package workspace

type CreateWorkspaceRequest struct {
	WorkspaceID string
	UserID      string
}

type FileNode struct {
	Name     string     `json:"name"`
	Type     string     `json:"type"`
	Size     int64      `json:"size,omitempty"`
	Children []FileNode `json:"children,omitempty"`
}
