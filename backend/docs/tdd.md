# TDD: US01–US03

Cum am scris backend-ul pentru creare cont, autentificare și deconectare: întâi testul, apoi codul.

## Cum arată testele

- **Runner:** `node:test`, inclus în Node, cu `tsx` pentru TypeScript. Nu folosim alt framework.
- **HTTP real:** fiecare fișier de test pornește aplicația pe un port liber (`startServer()` din `test/helpers/server.ts`) și trimite request-uri reale cu `fetch`, inclusiv cookie-uri.
- **PostgreSQL real:** local, baza din `docker compose`; în CI, un container PostgreSQL temporar. Baza de date nu e simulată (fără mock-uri).
- **Izolare:** fiecare test folosește un email nou (`testEmail()` dă `test-<uuid>@example.com`). La final, utilizatorii de test se șterg, iar sesiunile lor se șterg odată cu ei. Fișierele rulează pe rând (`--test-concurrency=1`), pentru că folosesc aceeași bază.
- **Nume din story:** testele descriu comportamentul, nu implementarea, de exemplu „answers an unknown email exactly like a wrong password”.

## Ciclul

1. **Red:** scriem testele pentru un singur comportament și le rulăm. Trebuie să pice, și din motivul așteptat (de exemplu ruta lipsește), nu din cauza unei greșeli în test.
2. **Green:** scriem codul minim care le face să treacă.
3. **Refactor:** curățăm codul, cu toate testele verzi.

Dacă un test nou trece din prima, nu știm dacă poate pica vreodată. Atunci stricăm codul intenționat, verificăm că testul pică, apoi refacem codul.

## US01 · Creare cont

| Pas | Teste | Red: de ce a picat | Green |
|---|---|---|---|
| 1. Hash-ul parolei | 5, în `password.test.ts` | modulul nu exista | `utils/password.ts`: scrypt, salt nou la fiecare hash, comparare în timp constant |
| 2. `POST /register` | 12, în `auth.register.test.ts`, cel puțin unul pe criteriu | toate cu `404`, ruta nu exista | validator, service, repository, view, controller, rută |
| 3. Refactor | – | – | setup-ul comun al testelor mutat în `test/helpers/`; suita a rămas verde |

Ce n-a ieșit bine:
- **Pași prea mari.** Am scris toate cele 12 teste deodată, apoi toate straturile. La US02 și US03 am trecut la cicluri mici, cu un comportament pe ciclu.
- **Un Red slab.** Testele pentru hash au picat pentru că lipsea fișierul, nu pentru că un comportament era greșit.
- **Un caz fără test:** limita de 254 de caractere a emailului.

## US02 · Autentificare

| Ciclu | Comportament | Red: de ce a picat | Green |
|---|---|---|---|
| 1 | Login corect → `200 { user }`, cu emailul în orice formă | `404`, ruta nu exista | login minim, **fără verificarea parolei** |
| 2 | Parolă greșită, email necunoscut sau email invalid → același `401`; mesaje pentru câmpuri lipsă | parola greșită intra (`200`), emailul necunoscut dădea `500`, mesajele erau cele implicite din zod, în engleză | verificarea parolei, „Email sau parolă greșită.”, mesaje în română |
| 3 | Email necunoscut răspunde la fel de repede ca o parolă greșită | 2 ms față de 130 ms, deci se putea afla ce emailuri au cont | verificare față de un hash fals pentru emailurile necunoscute |
| 4 | Cookie de sesiune; în baza de date doar hash-ul tokenului; token nou la fiecare login; fără cookie la login eșuat | nu exista cookie `sid` | migrarea și modelul `sessions`, tokenul, cookie-ul |
| 5 | `GET /me` e protejat | toate 4 testele cu `404` | `cookie-parser`, căutarea sesiunii valide, `requireAuth`, ruta `/me` |

Ciclul 1 arată pasul minim: după el, orice parolă intra. Ciclul 2 a început cu un test care a obligat verificarea parolei.

## US03 · Deconectare

| Ciclu | Comportament | Red: de ce a picat | Green |
|---|---|---|---|
| 1 | Logout-ul închide sesiunea: tokenul primește `401`, rândul dispare | `404`, iar rândul exista încă | ruta și ștergerea sesiunii |
| 2 | Cookie-ul se șterge cu aceleași atribute | lipsea `Set-Cookie` | `clearSessionCookie`, cu aceleași opțiuni ca `setSessionCookie` |
| 3 | Logout fără sesiune sau de două ori → `204` | fără cookie dădea `500` (dublu-click-ul mergea deja; testul a rămas ca protecție) | ștergerea se face doar dacă există token |
| 4 | Celelalte dispozitive rămân conectate | a trecut din prima; am făcut logout-ul să șteargă toate sesiunile utilizatorului și testul a picat | nicio schimbare de cod |
| 5 | `Cache-Control: no-store` pe răspunsurile protejate, la `200` și la `401` | header-ul lipsea | setat în `requireAuth` |

Refactor: logout-ul și `requireAuth` citesc cookie-ul prin aceeași funcție, `readSessionToken`.

## Verificări în plus, la fiecare story

- `npm run build` (tsc) pentru `src/`. Testele le-am verificat cu tsc separat, pentru că build-ul nu le include.
- `npm run migration:check`: modelele și migrările descriu aceeași schemă. Pentru migrarea nouă (`CreateSessions`) am rulat și `migration:revert` urmat de `migration:run`, ca să verificăm `down()`.
- Fluxul complet cu `curl`: register → login → `/me` → logout.

## Rezultat

| Fișier | Teste | Ce acoperă |
|---|---|---|
| `test/password.test.ts` | 5 | US01, hash-ul parolei |
| `test/auth.register.test.ts` | 12 | US01 |
| `test/auth.login.test.ts` | 15 | US02 |
| `test/auth.logout.test.ts` | 8 | US03 |

Încă 13 teste (`test/app.test.ts`, `test/database.test.ts`) vin din configurarea inițială a bazei de date, care s-a făcut înainte de US01 și nu a fost scrisă TDD.

În CI, job-ul **test-backend** rulează toate testele și `migration:check` pe fiecare PR, iar deploy-ul se face doar dacă trec.

```bash
cd backend
npm test                                                                    # toate testele
node --import tsx --test --test-concurrency=1 test/password.test.ts test/auth.*.test.ts   # doar US01–US03
```
