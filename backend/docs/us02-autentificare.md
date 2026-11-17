# US02 · Autentificare

> **Ca** utilizator, **vreau** să mă autentific cu email și parolă sau Google/GitHub, **pentru a**-mi accesa proiectele.

## Criterii de acceptare

| Criteriu | Cum e rezolvat în backend |
|---|---|
| Cu email și parolă corecte, utilizatorul ajunge la lista proiectelor sale | `200 { user }` și cookie-ul de sesiune `sid`. |
| Cu date greșite apare un mesaj de eroare care nu spune care câmp e greșit | Același `401 INVALID_CREDENTIALS`, „Email sau parolă greșită.”, pentru parolă greșită, email necunoscut sau email cu format greșit, în același timp de răspuns. |
| Paginile protejate redirecționează la autentificare un utilizator neautentificat | Middleware-ul `requireAuth` răspunde cu `401 UNAUTHENTICATED` pe orice rută protejată, dacă nu există o sesiune validă. |

## Endpoint-uri

### `POST /api/auth/login`

```json
{ "email": "ana@example.com", "password": "parola-buna" }
```

| Răspuns | Când |
|---|---|
| `200 { user: { id, email, createdAt } }` + cookie `sid` | Date corecte. |
| `400 VALIDATION_ERROR` + `fields` | Lipsește emailul („Introdu adresa de email.”) sau parola („Introdu parola.”). |
| `401 INVALID_CREDENTIALS` | Orice altceva: parolă greșită, email necunoscut, email cu format greșit. |

La login, validarea verifică doar că există emailul și parola. Formatul emailului nu se verifică separat: un email greșit e tratat ca date greșite, nu primește un mesaj pe câmp.

### `GET /api/auth/me`

Prima rută protejată. Răspunde cu `200 { user }` pentru utilizatorul sesiunii sau cu `401 UNAUTHENTICATED`, „Trebuie să te autentifici.”

## Sesiunea

- La fiecare login se generează un token nou: 32 de octeți aleatori (`crypto.randomBytes`), în base64url.
- Tokenul ajunge doar în cookie. În baza de date se salvează **doar SHA-256-ul lui**, deci cine ar vedea tabelul `sessions` nu ar avea sesiuni pe care să le poată folosi.
- Cookie-ul `sid`: `HttpOnly` (scripturile din pagină nu îl pot citi), `SameSite=Lax`, `Secure` în producție (doar HTTPS), `Path=/`, valabil 7 zile.
- Fiecare login creează un rând nou în `sessions`, deci același cont poate fi deschis pe mai multe dispozitive.
- O sesiune e validă cât timp rândul ei există și `expiresAt` e în viitor.

**De ce același răspuns pentru email necunoscut și parolă greșită:** altfel s-ar putea afla ce emailuri au cont. Și timpul de răspuns ar trăda asta, pentru că verificarea scrypt durează. De aceea, pentru un email necunoscut, parola se verifică totuși față de un hash fals, ca răspunsul să dureze cât la o parolă greșită.

## `requireAuth`

`src/middleware/require-auth.ts` protejează orice rută:

1. citește tokenul din cookie-ul `sid`;
2. caută o sesiune validă cu hash-ul tokenului și încarcă utilizatorul ei;
3. dacă o găsește, pune utilizatorul în `req.user` și lasă request-ul să treacă; altfel răspunde cu `401 UNAUTHENTICATED`.

Se adaugă pe o rută (`router.get('/me', requireAuth, me)`) sau pe un router întreg (`router.use(requireAuth)`). Tipul lui `req.user` e declarat în `src/types/express.d.ts`.

## Baza de date

Migrarea `1794837499908-CreateSessions.ts` creează tabelul `sessions`:

| Coloană | Tip | Note |
|---|---|---|
| `id` | `uuid` | `PK_sessions` |
| `tokenHash` | `varchar(64)` | SHA-256 în hex, `UQ_sessions_tokenHash` |
| `userId` | `uuid` | `FK_sessions_userId` → `users(id)`, `ON DELETE CASCADE`; index `IDX_sessions_userId` |
| `expiresAt` | `timestamptz` | data la care sesiunea expiră |
| `createdAt` | `timestamptz` | `now()` |

Dacă un utilizator e șters, sesiunile lui se șterg odată cu el (`CASCADE`).

## Cod

| Fișier | Rol |
|---|---|
| `src/routes/auth.routes.ts` | `POST /login`, `GET /me` (cu `requireAuth`) |
| `src/controllers/auth.controller.ts` | `login` (setează cookie-ul), `me` |
| `src/validators/auth.validator.ts` | `loginSchema` |
| `src/services/auth.service.ts` | `login`: verifică parola, cu hash fals pentru email necunoscut |
| `src/services/session.service.ts` | `start`, `findUser` |
| `src/repositories/user.repository.ts` | `findByEmailWithPassword` |
| `src/repositories/session.repository.ts` | `create`, `findActive` |
| `src/utils/session-token.ts` | `generateSessionToken`, `hashSessionToken` |
| `src/utils/session-cookie.ts` | `setSessionCookie`, `readSessionToken` |
| `src/middleware/require-auth.ts` | `requireAuth` |
| `src/models/session.model.ts` | entitatea `Session` |

## Teste

`test/auth.login.test.ts` (15): login corect, email cu alte litere mari sau mici și cu spații, același 401 pentru parolă greșită, email necunoscut și email invalid, același timp de răspuns, atributele cookie-ului, doar hash-ul tokenului în baza de date, token nou la fiecare login, fără cookie la login eșuat, câmpuri lipsă, și `/me` cu sesiune validă, fără cookie, cu token inventat și cu sesiune expirată.

```bash
node --import tsx --test --test-concurrency=1 test/auth.login.test.ts
```
