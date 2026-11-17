# Baza de date și migrări

PostgreSQL 17, folosit prin TypeORM. Configurarea e în `src/database/data-source.ts`, iar adresa bazei vine din `DATABASE_URL`.

## Unde rulează

| Mediu | Cum |
|---|---|
| Local | `docker compose up -d db`, din rădăcina repo-ului. PostgreSQL pe `127.0.0.1:5432`, cu utilizatorul, parola și baza `cloudide`, iar datele stau într-un volum Docker. Fără `DATABASE_URL`, backend-ul se conectează aici. |
| CI | Job-ul **test-backend** pornește un PostgreSQL temporar și rulează pe el testele și `migration:check`. |
| Producție | StatefulSet-ul `postgres` din k3s, cu parola în secretul `postgres-credentials` (vezi „Server” în README-ul principal). În producție, backend-ul nu pornește fără `DATABASE_URL`. |

Ca să ștergi tot din baza locală și să pornești de la zero: `docker compose down -v && docker compose up -d db`.

## Conexiunea

- `synchronize: false`: TypeORM nu modifică niciodată schema singur.
- Cel mult 10 conexiuni deschise, cu 5 s de așteptare pentru una nouă.
- `id`-urile `uuid` le generează PostgreSQL (`gen_random_uuid()`).

## La pornirea backend-ului

1. Așteaptă baza de date și reîncearcă până la 60 s, ca un deploy nou să nu cadă cât timp PostgreSQL încă pornește.
2. Aplică migrările noi, în ordine, fiecare în tranzacția ei. Ține un lock în PostgreSQL (`pg_advisory_lock`), ca două pod-uri să nu le ruleze în același timp.
3. Pornește serverul.

`GET /api/health` răspunde mereu cu `200` și spune dacă baza răspunde: `database: "ok"` sau `"error"`, verificat în cel mult 500 ms. Astfel, o problemă scurtă a bazei nu face Kubernetes să repornească backend-ul.

## O migrare nouă

Schema se schimbă **doar** prin migrări: clase TypeORM scrise de mână, cu `up()` și `down()`, în `src/database/migrations/`. Din `backend/`:

1. Creezi fișierul: `npm run migration:create -- src/database/migrations/<Nume>`. Rezultă `<timestamp>-<Nume>.ts`, cu `up()` și `down()` goale.
2. Scrii în `up()` schimbarea și în `down()` cum se anulează (vezi `1794827149538-CreateUsers.ts`).
3. Actualizezi sau adaugi modelul în `src/models/` ca să se potrivească.
4. `npm run migration:run` o aplică, `npm run migration:revert` o anulează pe ultima, `npm run migration:show` arată ce e aplicat.
5. `npm run migration:check` verifică dacă modelele și migrările descriu aceeași schemă. Rulează și în CI.

## Convenții

- Tabele snake_case la plural (`users`, `project_files`), coloane camelCase între ghilimele (`"createdAt"`).
- Nume explicite pentru constrângeri: `PK_<tabel>`, `UQ_<tabel>_<coloane>`, `IDX_<tabel>_<coloane>`, `FK_<tabel>_<coloană>`, `CHK_<tabel>_<regulă>`.
- La `@Column` treci mereu tipul (`{ type: 'text' }`): în dev (tsx), TypeORM nu-l poate ghici singur.
- O migrare deja aplicată (merge-uită pe `main`) nu se mai modifică; pentru orice schimbare faci una nouă.

## Tranzacții

Ce scrie mai multe lucruri deodată folosește `runInTransaction` din `src/database/transaction.ts`: ori se salvează tot, ori nimic. Dacă primește `manager`-ul unei tranzacții deja deschise, lucrează în ea în loc să deschidă una nouă.

## Tabelele din US01–US03

| Tabel | Migrare | Detalii |
|---|---|---|
| `users` | `1794827149538-CreateUsers.ts` | [US01](us01-creare-cont.md#baza-de-date) |
| `sessions` | `1794837499908-CreateSessions.ts` | [US02](us02-autentificare.md#baza-de-date) |
