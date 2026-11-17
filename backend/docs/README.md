# Documentație backend

Ce face fiecare story implementat în backend și cum a fost scris.

| Fișier | Conținut |
|---|---|
| [baza-de-date.md](baza-de-date.md) | PostgreSQL și TypeORM: unde rulează, ce se întâmplă la pornire, cum scrii o migrare |
| [us01-creare-cont.md](us01-creare-cont.md) | US01 · Creare cont: `POST /api/auth/register` |
| [us02-autentificare.md](us02-autentificare.md) | US02 · Autentificare: `POST /api/auth/login`, `GET /api/auth/me`, sesiunea |
| [us03-deconectare.md](us03-deconectare.md) | US03 · Deconectare: `POST /api/auth/logout` |
| [tdd.md](tdd.md) | Cum am lucrat test-first la US01–US03 |

## Comun pentru toate

- Toate rutele sunt sub `/api/auth` (`src/routes/auth.routes.ts`).
- Erorile au forma `{ error, code, fields? }`: `error` e mesajul pentru utilizator, `code` e un cod fix pe care clientul îl poate verifica, iar `fields` are câte un mesaj pentru fiecare câmp invalid.
- Comenzile de test se rulează din `backend/`, cu baza de date pornită (`docker compose up -d db`, din rădăcina repo-ului).
