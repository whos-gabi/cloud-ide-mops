#!/usr/bin/env bash
# Installs the GitHub Actions runner that deploys this repo to k3s.
# Run once on the server, as root:
#   sudo bash infra/setup-runner.sh <RUNNER_TOKEN>
# Get the token from GitHub: repo Settings > Actions > Runners > New self-hosted runner
# (it's the value after --token in the "Configure" step; valid for 1 hour).
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${1:?usage: sudo bash infra/setup-runner.sh <RUNNER_TOKEN>}"
REPO_URL=https://github.com/whos-gabi/cloud-ide-mops
RUNNER_VERSION=2.338.2
RUNNER_USER=ghrunner
HOME_DIR=/home/$RUNNER_USER
RUNNER_DIR=$HOME_DIR/actions-runner

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }

echo "==> User $RUNNER_USER (can use docker)"
id "$RUNNER_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$RUNNER_USER"
usermod -aG docker "$RUNNER_USER"

echo "==> Allow it to import images into k3s (its only root command)"
echo "$RUNNER_USER ALL=(root) NOPASSWD: /usr/local/bin/k3s ctr -n k8s.io images import -" \
  > /etc/sudoers.d/$RUNNER_USER
chmod 440 /etc/sudoers.d/$RUNNER_USER
visudo -cf /etc/sudoers.d/$RUNNER_USER >/dev/null

echo "==> kubeconfig limited to the cloud-ide namespace"
kubectl apply -f infra/cluster-setup.yaml >/dev/null
TOKEN_B64=""
for _ in $(seq 1 30); do
  TOKEN_B64=$(kubectl -n cloud-ide get secret deployer-token -o jsonpath='{.data.token}')
  [ -n "$TOKEN_B64" ] && break
  sleep 1
done
SA_TOKEN=$(echo "$TOKEN_B64" | base64 -d)
CA_DATA=$(kubectl config view --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
mkdir -p "$HOME_DIR/.kube"
cat > "$HOME_DIR/.kube/config" <<KUBE
apiVersion: v1
kind: Config
clusters:
  - name: k3s
    cluster:
      server: https://127.0.0.1:6443
      certificate-authority-data: $CA_DATA
users:
  - name: deployer
    user:
      token: $SA_TOKEN
contexts:
  - name: deployer
    context: { cluster: k3s, user: deployer, namespace: cloud-ide }
current-context: deployer
KUBE
chmod 600 "$HOME_DIR/.kube/config"
chown -R "$RUNNER_USER:$RUNNER_USER" "$HOME_DIR/.kube"

echo "==> Download runner v$RUNNER_VERSION"
if [ ! -x "$RUNNER_DIR/config.sh" ]; then
  mkdir -p "$RUNNER_DIR"
  curl -fsSL "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz" \
    | tar xz -C "$RUNNER_DIR"
  "$RUNNER_DIR/bin/installdependencies.sh" >/dev/null
fi
echo "KUBECONFIG=$HOME_DIR/.kube/config" > "$RUNNER_DIR/.env"
chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"

echo "==> Register runner with GitHub"
cd "$RUNNER_DIR"
sudo -u "$RUNNER_USER" ./config.sh --unattended --replace \
  --url "$REPO_URL" --token "$TOKEN" \
  --name "$(hostname)-deploy" --labels cloud-ide-deploy --work _work

echo "==> Install and start as a service"
if [ ! -f .service ]; then ./svc.sh install "$RUNNER_USER"; fi
./svc.sh start
echo "==> Done. The runner should show as Idle in repo Settings > Actions > Runners."
