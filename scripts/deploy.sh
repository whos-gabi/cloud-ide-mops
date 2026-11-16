#!/usr/bin/env bash
# Build all images, load them into k3s and roll out.
# Usage: scripts/deploy.sh [tag]   (tag defaults to the current git commit)
# Runs from CI on every push to main (and on PRs, against a throwaway k3s);
# can also be run by hand on the server. Needs only docker, kubectl and k3s.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-$(git rev-parse HEAD)}"
# The file agent runs inside every workspace. Its tag changes only when its
# code does, so workspaces are restarted (below) only when needed.
FILE_AGENT_IMAGE="cloud-ide-file-agent:$(git rev-parse --short=12 HEAD:workspace-manager/file-agent)"
NAMESPACE=cloud-ide
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo -n"

manifests="$(mktemp -d)"
trap 'rm -rf "$manifests"' EXIT
cp k8s/* "$manifests/"
sed -i "s/newTag: .*/newTag: $TAG/" "$manifests/kustomization.yaml"
sed -i "s|value: cloud-ide-file-agent:.*|value: $FILE_AGENT_IMAGE|" "$manifests/workspace-manager.yaml"
grep -q "value: $FILE_AGENT_IMAGE" "$manifests/workspace-manager.yaml"

# Fail in seconds, before the slow image builds, if the cluster would reject the
# manifests (e.g. the deployer account lacks a permission they need).
echo "==> Checking manifests against the cluster (dry run)"
if ! kubectl apply -k "$manifests" --dry-run=server >/dev/null; then
  echo "::error title=Deploy blocked::The cluster rejected the manifests (see above)." \
    "If it says 'forbidden', an admin must run on the server:" \
    "sudo kubectl apply -f infra/cluster-setup.yaml" >&2
  exit 1
fi

echo "==> Building images ($TAG)"
docker build -t "cloud-ide-backend:$TAG" --build-arg "APP_VERSION=$TAG" backend
docker build -t "cloud-ide-frontend:$TAG" frontend
docker build -f workspace-manager/dockerfile \
  -t "cloud-ide-workspace-manager:$TAG" workspace-manager
docker build -f workspace-manager/file-agent/dockerfile \
  -t "$FILE_AGENT_IMAGE" workspace-manager/file-agent
docker build -t "cloudcode:dev" workspace-runtime

echo "==> Importing images into k3s"
docker save "cloud-ide-backend:$TAG" "cloud-ide-frontend:$TAG" \
  "cloud-ide-workspace-manager:$TAG" "$FILE_AGENT_IMAGE" \
  "cloudcode:dev" \
  | $SUDO /usr/local/bin/k3s ctr -n k8s.io images import -

echo "==> Database credentials"
# Created once; don't rotate it, the data volume keeps the original password.
if kubectl -n "$NAMESPACE" get secret postgres-credentials >/dev/null 2>&1; then
  echo "secret postgres-credentials already exists"
else
  DB_PASSWORD="$(openssl rand -hex 24)"
  kubectl -n "$NAMESPACE" create secret generic postgres-credentials \
    --from-literal=password="$DB_PASSWORD" \
    --from-literal=database-url="postgres://cloudide:$DB_PASSWORD@postgres:5432/cloudide"
  unset DB_PASSWORD
fi

echo "==> Workspace manager token"
# Created once; workspace-manager reads it, and so will the backend (US04).
if kubectl -n "$NAMESPACE" get secret workspace-manager-token >/dev/null 2>&1; then
  echo "secret workspace-manager-token already exists"
else
  kubectl -n "$NAMESPACE" create secret generic workspace-manager-token \
    --from-literal=token="$(openssl rand -hex 32)"
fi

echo "==> Applying manifests"
kubectl apply -k "$manifests"

echo "==> Waiting for rollout"
kubectl -n "$NAMESPACE" rollout status statefulset/postgres --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/backend --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/frontend --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/workspace-manager --timeout=180s

echo "==> Workspaces: file agent $FILE_AGENT_IMAGE"
# Workspaces created by earlier deploys still run their old file agent. Only
# those whose image differs change (and restart); the files stay on the volume.
WORKSPACES=app.kubernetes.io/managed-by=workspace-manager
if [ -n "$(kubectl -n "$NAMESPACE" get deployment -l "$WORKSPACES" -o name)" ]; then
  kubectl -n "$NAMESPACE" set image deployment -l "$WORKSPACES" "file-agent=$FILE_AGENT_IMAGE"
fi

echo "==> Cleaning up old images"
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '^cloud-ide-(backend|frontend|workspace-manager):' | grep -v ":$TAG\$" \
  | xargs -r docker rmi >/dev/null || true
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep '^cloud-ide-file-agent:' | grep -vx "$FILE_AGENT_IMAGE" \
  | xargs -r docker rmi >/dev/null || true
docker builder prune -f --filter until=72h >/dev/null || true

echo "==> Deployed $TAG"
