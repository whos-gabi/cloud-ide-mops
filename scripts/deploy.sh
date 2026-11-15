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

echo "==> Importing images into k3s"
docker save "cloud-ide-backend:$TAG" "cloud-ide-frontend:$TAG" \
  | $SUDO /usr/local/bin/k3s ctr -n k8s.io images import -

echo "==> Applying manifests"
manifests="$(mktemp -d)"
trap 'rm -rf "$manifests"' EXIT
cp k8s/* "$manifests/"
sed -i "s/newTag: .*/newTag: $TAG/" "$manifests/kustomization.yaml"
kubectl apply -k "$manifests"

echo "==> Waiting for rollout"
kubectl -n "$NAMESPACE" rollout status deployment/backend --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/frontend --timeout=180s

echo "==> Cleaning up old images"
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '^cloud-ide-(backend|frontend):' | grep -v ":$TAG\$" \
  | xargs -r docker rmi >/dev/null || true
docker builder prune -f --filter until=72h >/dev/null || true

echo "==> Deployed $TAG"
