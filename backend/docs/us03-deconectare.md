# US03 · Deconectare

> **Ca** utilizator, **vreau** să mă deconectez, **pentru ca** altcineva să nu-mi poată folosi contul de pe același dispozitiv.

## Criterii de acceptare

| Criteriu | Cum e rezolvat în backend |
|---|---|
| După deconectare, sesiunea e invalidată | Sesiunea se șterge din baza de date, iar cookie-ul `sid` se șterge din browser. Tokenul vechi, chiar copiat, primește `401`. |
| Butonul Back din browser nu mai deschide paginile protejate | Toate răspunsurile rutelor protejate au `Cache-Control: no-store`, deci browserul nu păstrează copii ale lor. |

## Endpoint

`POST /api/auth/logout`, fără body. Răspunde mereu cu `204`, fără conținut.

## Cum funcționează

1. Citește tokenul din cookie-ul `sid` (`readSessionToken`).
2. Dacă există un token, șterge sesiunea cu hash-ul lui (`sessionService.end`). Doar sesiunea asta: celelalte dispozitive rămân conectate.
3. Șterge cookie-ul cu aceleași atribute cu care a fost setat (`clearSessionCookie`). Browserul șterge un cookie doar dacă atributele (`Path`, `HttpOnly`, `SameSite`, `Secure`) se potrivesc, așa că `setSessionCookie` și `clearSessionCookie` folosesc aceeași constantă.
4. Răspunde cu `204`.

## Decizii

- **Reușește mereu.** Fără cookie, cu o sesiune expirată sau la dublu-click, rezultatul e același: utilizatorul nu mai e conectat. De aceea logout-ul nu folosește `requireAuth` și nu întoarce niciodată o eroare.
- **Ștergere reală, nu „soft delete”.** Un rând din `sessions` e doar o cheie de acces, nu are istoric de păstrat. Cu un câmp de tip `revokedAt`, fiecare căutare ar trebui să-l filtreze, iar o singură căutare care uită filtrul ar face un token vechi să meargă din nou. Dacă rândul nu mai există, tokenul nu mai are cu ce să se potrivească.
- **Doar dispozitivul curent.** Story-ul vorbește despre „același dispozitiv”, deci sesiunile de pe alte dispozitive rămân valide.
- **`Cache-Control: no-store`** e pus în `requireAuth`, deci se aplică automat oricărei rute protejate, inclusiv răspunsurilor `401`.

## Cod

| Fișier | Rol |
|---|---|
| `src/routes/auth.routes.ts` | `POST /logout` |
| `src/controllers/auth.controller.ts` | `logout` |
| `src/services/session.service.ts` | `end`: șterge doar sesiunea curentă |
| `src/repositories/session.repository.ts` | `deleteByTokenHash` |
| `src/utils/session-cookie.ts` | `clearSessionCookie`, `readSessionToken` (folosit și de `requireAuth`) |
| `src/middleware/require-auth.ts` | `Cache-Control: no-store` |

Nu e nicio migrare nouă: US03 folosește tabelul `sessions` din US02.

## Teste

`test/auth.logout.test.ts` (8): tokenul nu mai deschide rutele protejate după logout, rândul dispare din baza de date, cookie-ul primește aceleași atribute și o dată de expirare în trecut, logout fără cookie, logout de două ori cu același token, celelalte dispozitive rămân conectate, și `no-store` pe răspunsurile protejate, atât la `200`, cât și la `401`.

```bash
node --import tsx --test --test-concurrency=1 test/auth.logout.test.ts
```
