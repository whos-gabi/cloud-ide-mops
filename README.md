# Cloud IDE

IDE în browser: editezi cod (cu drag & drop), îți faci cont, imporți repo-uri din GitHub, iar adminii au un dashboard.

**Live:** https://ide.filegrid.cc.cd

## Structură

```
frontend/            React + TypeScript (Vite), servit de nginx
backend/             Node + Express + TypeScript, API sub /api, PostgreSQL prin TypeORM
k8s/                 manifestele Kubernetes (k3s) pentru deploy
workspace-manager/   serviciul Go care creează workspace-uri în namespace-ul cloud-ide
scripts/             deploy.sh: build + deploy pe server
infra/               setup unic al serverului (namespace, runner CI)
docker-compose.yml   baza de date pentru dezvoltare locală
```

Pe domeniu, `/api/*` merge la backend și restul la frontend. Tot ce e în backend trebuie să fie sub `/api`.

## Rulare locală

Ai nevoie de Node 24+ și Docker. Pornește întâi baza de date, apoi folosește două terminale:

```bash
docker compose up -d db                      # PostgreSQL pe localhost:5432
```

```bash
cd backend && npm install && npm run dev     # http://localhost:3000
```

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

În dev, frontend-ul trimite `/api` mai departe la backend-ul local, deci nu ai probleme cu CORS.

Proiectele (US04) au nevoie de `workspace-manager`, care rulează doar în Kubernetes. Local pornești, într-un al treilea terminal, o versiune falsă, în memorie, pe care backend-ul o folosește implicit:

```bash
cd backend && npm run dev:workspace-manager  # http://localhost:8080
```

Ține fișierele proiectelor doar cât rulează; după repornire, proiectele vechi nu mai au fișiere.

La pornire, backend-ul așteaptă baza de date și aplică singur migrările noi. Testele (`cd backend && npm test`) rulează pe aceeași bază locală.

## Backend: structură (MVC)

```
backend/src/
  config/        setări din variabile de mediu (DATABASE_URL, PORT)
  database/      conexiunea TypeORM, migrările, runInTransaction
  models/        entitățile TypeORM (un fișier *.model.ts pe tabel)
  repositories/  interogările pe baza de date
  services/      regulile de business
  clients/       apelurile către alte servicii (workspace-manager)
  validators/    validarea body-ului (zod), cu mesaje pentru fiecare câmp
  views/         ce returnează API-ul (ex. user fără parolă)
  controllers/   handler-ele pentru request-uri
  routes/        ce URL ajunge la ce controller (totul sub /api)
  middleware/    requireAuth, tratarea erorilor, 404
  errors/        HttpError: status + cod + mesaj
  utils/         hash-ul parolelor, tokenul și cookie-ul sesiunii
```

Un request trece prin route → controller (validare) → service → repository. Ce scrie mai multe lucruri deodată folosește `runInTransaction` din `database/transaction.ts`: ori se salvează tot, ori nimic.

Documentația backend-ului (baza de date, US01–US03, TDD) e în [`backend/docs/`](backend/docs/README.md).

## Baza de date și migrări

Schema se schimbă **doar** prin migrări TypeORM, cu `up()` și `down()`, în `backend/src/database/migrations/`. Backend-ul le aplică singur la pornire. O migrare deja merge-uită pe `main` nu se mai modifică.

Pașii pentru o migrare nouă și convențiile de nume sunt în [`backend/docs/baza-de-date.md`](backend/docs/baza-de-date.md).

## API

Erorile au forma `{ error, code, fields? }`: `error` e mesajul pentru utilizator, `fields` are câte un mesaj pentru fiecare câmp invalid.

| Endpoint | Story | Body | Răspuns |
|---|---|---|---|
| `POST /api/auth/register` | [US01](backend/docs/us01-creare-cont.md) | `{ email, password }` | `201 { user }` · `400 VALIDATION_ERROR` · `409 EMAIL_TAKEN` |
| `POST /api/auth/login` | [US02](backend/docs/us02-autentificare.md) | `{ email, password }` | `200 { user }` + cookie `sid` · `400 VALIDATION_ERROR` · `401 INVALID_CREDENTIALS` |
| `GET /api/auth/me` | [US02](backend/docs/us02-autentificare.md) | – | `200 { user }` · `401 UNAUTHENTICATED` |
| `POST /api/auth/logout` | [US03](backend/docs/us03-deconectare.md) | – | `204` (și fără sesiune) |
| `GET /api/projects` | US04 | – | `200 { projects }`, ale utilizatorului, cele modificate recent primele |
| `POST /api/projects` | US04 | `{ name, language }` | `201 { project }` · `400 VALIDATION_ERROR` · `409 PROJECT_NAME_TAKEN` · `409 PROJECT_LIMIT_REACHED` · `503 WORKSPACE_UNAVAILABLE` |
| `GET /api/projects/:projectId` | US08 | – | `200 { project }` · `404 PROJECT_NOT_FOUND` |
| `GET /api/projects/:projectId/files?path=` | US08 | – | `200 { path, entries }`, un singur nivel, directoarele primele · `400 VALIDATION_ERROR` · `404 PATH_NOT_FOUND` · `503 WORKSPACE_UNAVAILABLE` |
| `POST /api/projects/:projectId/files` | US08 | `{ parent, name, type }` | `201 { entry }` · `400 VALIDATION_ERROR` · `400 INVALID_PATH` · `404 PATH_NOT_FOUND` · `409 NAME_TAKEN` · `503` |
| `DELETE /api/projects/:projectId/files?path=&type=` | US08 | – | `204`; un director se șterge cu tot conținutul · `400 VALIDATION_ERROR` · `400 INVALID_PATH` · `404 PATH_NOT_FOUND` · `503` |

Un proiect are `language` unul dintre `python`, `javascript`, `java`, `cpp`, iar numele (cel mult 100 de caractere, fără caractere invizibile) e unic printre proiectele utilizatorului, fără să conteze literele mari. Un utilizator poate avea cel mult 10 proiecte (`config.projects.maxPerUser`), pentru că fiecare ține un workspace pe server. La creare, backend-ul îi face proiectului un workspace prin `workspace-manager` și scrie în el fișierul inițial: `main.py`, `index.js`, `Main.java` sau `main.cpp`. Răspunde abia după aceea, de obicei în câteva secunde. Dacă workspace-ul nu pornește în 60 s, proiectul și workspace-ul se șterg și răspunsul e `503`.

Fișierele unui proiect (US08) sunt în workspace-ul lui. Căile sunt relative la rădăcina proiectului (`src/main.py`; `""` e rădăcina) și nu pot ieși din ea. `type` e `file` sau `directory`, iar un element de oricare tip blochează numele în directorul lui. `400 INVALID_PATH` înseamnă că părintele e un fișier sau că `type` nu se potrivește cu ce e pe disc. Alte erori ale mediului de lucru devin `502 WORKSPACE_ERROR`. Un proiect al altui utilizator primește `404 PROJECT_NOT_FOUND`, la fel ca unul care nu există. Crearea și ștergerea actualizează „ultima modificare” a proiectului.

Rutele protejate folosesc middleware-ul `requireAuth` (`401 UNAUTHENTICATED` fără sesiune validă). Cum funcționează sesiunea: [US02](backend/docs/us02-autentificare.md#sesiunea).

## Cum ajunge codul live

1. Faci un branch, dai push și deschizi un PR pe `main`.
2. GitHub Actions verifică PR-ul. Dacă ceva pică, vezi eroarea în PR:
   - **build**: build la frontend și backend.
   - **test-backend**: testele backend-ului pe un PostgreSQL temporar, inclusiv `migration:check`.
   - **test-go**: `go vet` și `go test` pentru `workspace-manager`.
   - **deploy-rehearsal**: rulează `scripts/deploy.sh` pe un k3s temporar, cu aceeași versiune, aceleași permisiuni, aceeași regulă `sudo` și aceleași comenzi ca pe server, apoi verifică site-ul prin ingress. Dacă ar pica deploy-ul după merge, pică aici. Când pică, motivul (pod-uri, evenimente, log-uri) apare direct pe pagina de checks a PR-ului.
   - **infra-check**: pică dacă PR-ul schimbă `infra/` și un admin nu a confirmat încă că a aplicat schimbarea pe server (vezi regulile de mai jos).
3. După merge pe `main` (sau push direct pe `main`), job-ul **deploy** rulează pe server: construiește imaginile Docker, le încarcă în k3s și face rollout. Durează în jur de 1–2 minute.
4. Versiunea live (commit-ul) apare pe pagina principală și la https://ide.filegrid.cc.cd/api/health.

Progresul și log-urile se văd în tab-ul **Actions** din GitHub.

Reguli pentru deploy:
- `deploy.sh` poate folosi doar comenzile din `SERVER_TOOLS` (în `.github/workflows/ci-cd.yml`): în principal `docker`, `kubectl` și `k3s`. Orice compilare (Go, Node etc.) se face în Dockerfile, nu direct pe server. Dacă ai nevoie de o comandă nouă, o instalezi întâi pe server și abia apoi o adaugi în listă.
- O componentă nouă se adaugă în `scripts/deploy.sh` (build și import) și în `k8s/kustomization.yaml`.
- Fișierele din `infra/` (de exemplu permisiunile contului de deploy) **nu** se aplică automat. Dacă un PR le schimbă, check-ul **infra-check** pică. Un admin rulează atunci pe server, din branch-ul PR-ului, `sudo kubectl apply -f infra/cluster-setup.yaml` și pune pe PR eticheta `infra-applied`. Check-ul rulează din nou și trece. Fără acest pas, deploy-ul de după merge se oprește cu mesajul „Deploy blocked”.

## Server (doar pentru admin)

- Cluster: k3s pe VPS, namespace `cloud-ide`, cu ingress prin Traefik.
- Workspace Manager și workspace-urile create dinamic rulează în același namespace
  `cloud-ide`; manifestul lui este `k8s/workspace-manager.yaml`.
- Workspace Manager cere `Authorization: Bearer <token>` (vezi `workspace-manager/API.md`).
  Token-ul e în secretul `workspace-manager-token`, creat de `deploy.sh` la primul deploy.
  Workspace Manager acceptă doar workspace-uri cu numele `ws-...`, deci nu poate atinge
  backend-ul, frontend-ul sau baza de date.
- Imaginea `cloud-ide-file-agent` are ca tag hash-ul directorului `workspace-manager/file-agent`,
  deci se schimbă doar când se schimbă codul lui. Atunci `deploy.sh` actualizează și
  workspace-urile existente (`kubectl set image`): pod-urile lor repornesc, fișierele rămân.
- `scripts/deploy.sh` construiește și importă imaginile `cloud-ide-workspace-manager`,
  `cloud-ide-file-agent` și runtime-ul `cloudcode:dev` din
  `workspace-runtime/Dockerfile`. Runtime-ul poate fi înlocuit prin variabila
  `WORKSPACE_RUNTIME_IMAGE`.
- Cloudflare face proxy pentru domeniu către server.
- Deploy manual, de pe server: `./scripts/deploy.sh`
- Pod-uri și log-uri: `kubectl -n cloud-ide get pods`, apoi `kubectl -n cloud-ide logs deploy/backend`
- Baza de date: PostgreSQL 17 ca StatefulSet `postgres` (`k8s/postgres.yaml`), cu datele pe un volum de 5Gi pe disc. E accesibilă doar din cluster. Consolă SQL: `kubectl -n cloud-ide exec -it postgres-0 -- psql -U cloudide`
- Parola bazei de date e în secretul `postgres-credentials`, creat de `deploy.sh` la primul deploy cu o valoare aleatoare. **Nu șterge acest secret:** volumul păstrează parola veche și backend-ul nu s-ar mai putea conecta.
- Runner-ul CI se instalează o singură dată: `sudo bash infra/setup-runner.sh <RUNNER_TOKEN>` (detalii în script).
