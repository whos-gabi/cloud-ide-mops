# Cloud IDE

IDE în browser: editezi cod (cu drag & drop), îți faci cont, imporți repo-uri din GitHub, iar adminii au un dashboard.

**Live:** https://ide.filegrid.cc.cd

## Structură

```
frontend/            React + TypeScript (Vite), servit de nginx
backend/             Node + Express + TypeScript, API sub /api, PostgreSQL prin TypeORM
k8s/                 manifestele Kubernetes (k3s) pentru deploy
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

La pornire, backend-ul așteaptă baza de date și aplică singur migrările noi. Testele (`cd backend && npm test`) rulează pe aceeași bază locală.

## Backend: structură (MVC)

```
backend/src/
  config/        setări din variabile de mediu (DATABASE_URL, PORT)
  database/      conexiunea TypeORM, migrările, runInTransaction
  models/        entitățile TypeORM (un fișier *.model.ts pe tabel)
  repositories/  interogările pe baza de date
  services/      regulile de business
  validators/    validarea body-ului (zod), cu mesaje pentru fiecare câmp
  views/         ce returnează API-ul (ex. user fără parolă)
  controllers/   handler-ele pentru request-uri
  routes/        ce URL ajunge la ce controller (totul sub /api)
  middleware/    tratarea erorilor, 404
  errors/        HttpError: status + cod + mesaj
  utils/         hash-ul parolelor (scrypt)
```

Un request trece prin route → controller (validare) → service → repository. Ce scrie mai multe lucruri deodată folosește `runInTransaction` din `database/transaction.ts`: ori se salvează tot, ori nimic.

## Baza de date și migrări

Schema se schimbă **doar** prin migrări: clase TypeORM scrise de mână, cu `up()` și `down()`, în `backend/src/database/migrations/`. Backend-ul le aplică la pornire, în ordine, fiecare în tranzacția ei.

Pentru o schimbare de schemă (din `backend/`):

1. Creezi fișierul: `npm run migration:create -- src/database/migrations/AddProjects`. Rezultă `<timestamp>-AddProjects.ts`, cu `up()` și `down()` goale.
2. Scrii în `up()` schimbarea și în `down()` cum se anulează (vezi `1794827149538-CreateUsers.ts`).
3. Actualizezi sau adaugi modelul în `src/models/` ca să se potrivească.
4. `npm run migration:run` o aplică, `npm run migration:revert` o anulează pe ultima, `npm run migration:show` arată ce e aplicat.
5. `npm run migration:check` verifică dacă modelele și migrările descriu aceeași schemă. Rulează și în CI.

Convenții:
- Tabele snake_case la plural (`users`, `project_files`), coloane camelCase între ghilimele (`"createdAt"`).
- Nume explicite pentru constrângeri: `PK_<tabel>`, `UQ_<tabel>_<coloane>`, `IDX_<tabel>_<coloane>`, `FK_<tabel>_<coloană>`, `CHK_<tabel>_<regulă>`.
- La `@Column` treci mereu tipul (`{ type: 'text' }`): în dev (tsx) TypeORM nu-l poate ghici singur.
- O migrare deja aplicată (merge-uită pe `main`) nu se mai modifică; pentru orice schimbare faci una nouă.

## API

Erorile au forma `{ error, code, fields? }`: `error` e mesajul pentru utilizator, `fields` are câte un mesaj pentru fiecare câmp invalid.

| Endpoint | Story | Body | Răspuns |
|---|---|---|---|
| `POST /api/auth/register` | US01 | `{ email, password }` | `201 { user }` · `400 VALIDATION_ERROR` · `409 EMAIL_TAKEN` |
| `POST /api/auth/login` | US02 | `{ email, password }` | `200 { user }` + cookie `sid` · `401 INVALID_CREDENTIALS` |
| `GET /api/auth/me` | US02 | – | `200 { user }` · `401 UNAUTHENTICATED` |
| `POST /api/auth/logout` | US03 | – | `204`, șterge sesiunea și cookie-ul (reușește și fără sesiune) |

Sesiunea e un cookie `sid` (HttpOnly, 7 zile); în baza de date se păstrează doar hash-ul lui. Rutele protejate folosesc middleware-ul `requireAuth` și răspund cu `401 UNAUTHENTICATED` fără sesiune validă; la 401 frontend-ul trimite utilizatorul la autentificare. Răspunsurile lor au `Cache-Control: no-store`, ca butonul Back să nu mai arate date după deconectare. Deconectarea închide doar sesiunea de pe dispozitivul curent.

## Cum ajunge codul live

1. Faci un branch, dai push și deschizi un PR pe `main`.
2. GitHub Actions face build la frontend și backend (job-ul **build**) și rulează testele backend-ului pe un PostgreSQL temporar (job-ul **test-backend**, inclusiv `migration:check`). Dacă pică, vezi eroarea în PR.
3. După merge pe `main` (sau push direct pe `main`), job-ul **deploy** rulează pe server: construiește imaginile Docker, le încarcă în k3s și face rollout. Durează în jur de 1–2 minute.
4. Versiunea live (commit-ul) apare pe pagina principală și la https://ide.filegrid.cc.cd/api/health.

Progresul și log-urile se văd în tab-ul **Actions** din GitHub.

## Server (doar pentru admin)

- Cluster: k3s pe VPS, namespace `cloud-ide`, cu ingress prin Traefik.
- Cloudflare face proxy pentru domeniu către server.
- Deploy manual, de pe server: `./scripts/deploy.sh`
- Pod-uri și log-uri: `kubectl -n cloud-ide get pods`, apoi `kubectl -n cloud-ide logs deploy/backend`
- Baza de date: PostgreSQL 17 ca StatefulSet `postgres` (`k8s/postgres.yaml`), cu datele pe un volum de 5Gi pe disc. E accesibilă doar din cluster. Consolă SQL: `kubectl -n cloud-ide exec -it postgres-0 -- psql -U cloudide`
- Parola bazei de date e în secretul `postgres-credentials`, creat de `deploy.sh` la primul deploy cu o valoare aleatoare. **Nu șterge acest secret:** volumul păstrează parola veche și backend-ul nu s-ar mai putea conecta.
- Runner-ul CI se instalează o singură dată: `sudo bash infra/setup-runner.sh <RUNNER_TOKEN>` (detalii în script).
