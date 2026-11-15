# Cloud IDE

IDE în browser: editezi cod (cu drag & drop), îți faci cont, imporți repo-uri din GitHub, iar adminii au un dashboard.

**Live:** https://ide.filegrid.cc.cd

## Structură

```
frontend/   React + TypeScript (Vite), servit de nginx
backend/    Node + Express + TypeScript, API sub /api
k8s/        manifestele Kubernetes (k3s) pentru deploy
scripts/    deploy.sh: build + deploy pe server
infra/      setup unic al serverului (namespace, runner CI)
```

Pe domeniu, `/api/*` merge la backend și restul la frontend. Tot ce e în backend trebuie să fie sub `/api`.

## Rulare locală

Ai nevoie de Node 24+. Folosește două terminale:

```bash
cd backend && npm install && npm run dev     # http://localhost:3000
```

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

În dev, frontend-ul trimite `/api` mai departe la backend-ul local, deci nu ai probleme cu CORS.

## Cum ajunge codul live

1. Faci un branch, dai push și deschizi un PR pe `main`.
2. GitHub Actions face build la frontend și backend (job-ul **build**). Dacă pică, vezi eroarea în PR.
3. După merge pe `main` (sau push direct pe `main`), job-ul **deploy** rulează pe server: construiește imaginile Docker, le încarcă în k3s și face rollout. Durează în jur de 1–2 minute.
4. Versiunea live (commit-ul) apare pe pagina principală și la https://ide.filegrid.cc.cd/api/health.

Progresul și log-urile se văd în tab-ul **Actions** din GitHub.

## Server (doar pentru admin)

- Cluster: k3s pe VPS, namespace `cloud-ide`, cu ingress prin Traefik.
- Cloudflare face proxy pentru domeniu către server.
- Deploy manual, de pe server: `./scripts/deploy.sh`
- Pod-uri și log-uri: `kubectl -n cloud-ide get pods`, apoi `kubectl -n cloud-ide logs deploy/backend`
- Runner-ul CI se instalează o singură dată: `sudo bash infra/setup-runner.sh <RUNNER_TOKEN>` (detalii în script).
