package workspace

import "os"

const defaultNamespace = "cloud-ide"

func configuredNamespace() string {
	namespace := os.Getenv("WORKSPACE_NAMESPACE")
	if namespace == "" {
		return defaultNamespace
	}
	return namespace
}

func workspaceRuntimeImage() string {
	return configuredValue("WORKSPACE_RUNTIME_IMAGE", "cloudcode:dev")
}

func fileAgentImage() string {
	return configuredValue("FILE_AGENT_IMAGE", "cloud-ide-file-agent:dev")
}

func configuredValue(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func (s *WorkspaceService) fileAgentURL(workspaceID, path string) string {
	return "http://" + workspaceID + "." + s.namespace + ".svc.cluster.local:8081" + path
}
