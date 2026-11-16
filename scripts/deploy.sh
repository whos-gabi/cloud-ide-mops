#!/usr/bin/env bash
# Build both images on this server, load them into k3s and roll out.
# Usage: scripts/deploy.sh [tag]   (tag defaults to the current git commit)
# Runs from CI on every push to main; can also be run by hand on the server.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-$(git rev-parse HEAD)}"
NAMESPACE=cloud-ide
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo -n"

echo "==> Building images ($TAG)"
docker build -t "cloud-ide-backend:$TAG" --build-arg "APP_VERSION=$TAG" backend
docker build -t "cloud-ide-frontend:$TAG" frontend
docker build -f workspace-manager/dockerfile \
  -t "cloud-ide-workspace-manager:$TAG" workspace-manager
docker build -t "cloudcode:dev" workspace-runtime
agent_context="$(mktemp -d)"
manifests=""
cleanup() {
  rm -rf "$agent_context" "$manifests"
}
trap cleanup EXIT
cp workspace-manager/file-agent/dockerfile "$agent_context/dockerfile"
(cd workspace-manager/file-agent && go build -trimpath -ldflags="-s -w" -o "$agent_context/file-agent" .)
docker build -f "$agent_context/dockerfile" \
  -t "cloud-ide-file-agent:dev" "$agent_context"

echo "==> Importing images into k3s"
docker save "cloud-ide-backend:$TAG" "cloud-ide-frontend:$TAG" \
  "cloud-ide-workspace-manager:$TAG" "cloud-ide-file-agent:dev" \
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

echo "==> Applying manifests"
manifests="$(mktemp -d)"
cp k8s/* "$manifests/"
sed -i "s/newTag: .*/newTag: $TAG/" "$manifests/kustomization.yaml"
kubectl apply -k "$manifests"

echo "==> Waiting for rollout"
kubectl -n "$NAMESPACE" rollout status statefulset/postgres --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/backend --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/frontend --timeout=180s

echo "==> Cleaning up old images"
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '^cloud-ide-(backend|frontend):' | grep -v ":$TAG\$" \
  | xargs -r docker rmi >/dev/null || true
docker builder prune -f --filter until=72h >/dev/null || true

echo "==> Deployed $TAG"
