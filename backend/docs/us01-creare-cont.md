# US01 · Creare cont

> **Ca** vizitator, **vreau** să îmi creez un cont cu email și parolă, **pentru a** avea un spațiu de lucru propriu.

## Criterii de acceptare

| Criteriu | Cum e rezolvat în backend |
|---|---|
| Un email deja folosit este respins, cu un mesaj clar | `409 EMAIL_TAKEN`: „Există deja un cont cu acest email.”, indiferent de literele mari sau mici. |
| O parolă sub 8 caractere este respinsă, cu un mesaj clar | `400 VALIDATION_ERROR`, cu `fields.password`: „Parola trebuie să aibă cel puțin 8 caractere.” |
| Parola se salvează hash-uit, niciodată în clar (RNF3) | Hash scrypt cu salt aleator. Hash-ul nu apare în niciun răspuns. |
| După înregistrare, utilizatorul ajunge pe pagina de autentificare | Înregistrarea nu creează sesiune și nu setează cookie, deci utilizatorul trebuie să se autentifice după. |

## Endpoint

`POST /api/auth/register`

```json
{ "email": "ana@example.com", "password": "parola-buna" }
```

| Răspuns | Când |
|---|---|
| `201 { user: { id, email, createdAt } }` | Contul a fost creat. |
| `400 VALIDATION_ERROR` + `fields` | Emailul sau parola lipsesc sau nu sunt valide. |
| `409 EMAIL_TAKEN` | Există deja un cont cu acest email. |

Mesajele de validare:

| Câmp | Regulă | Mesaj |
|---|---|---|
| `email` | lipsește | Introdu adresa de email. |
| `email` | format greșit | Adresa de email nu este validă. |
| `email` | peste 254 de caractere | Adresa de email este prea lungă. |
| `password` | lipsește | Introdu parola. |
| `password` | sub 8 caractere | Parola trebuie să aibă cel puțin 8 caractere. |
| `password` | peste 128 de caractere | Parola poate avea cel mult 128 de caractere. |

## Cum funcționează

1. **Validare** (`registerSchema`, zod): emailul e curățat de spații și trecut la litere mici înainte de verificări, deci `" Ana@Example.com "` și `"ana@example.com"` sunt același cont.
2. **Hash** (`hashPassword`): scrypt cu N=16384, r=8, p=5, salt aleator de 16 octeți și cheie de 64 de octeți. Se salvează ca `scrypt$16384$8$5$<salt>$<hash>` (base64). Parametrii sunt în hash, deci pot fi crescuți mai târziu fără să se strice conturile vechi. Limita de 128 de caractere ține sub control costul hash-ului.
3. **Salvare**: backend-ul nu verifică înainte dacă emailul există. Inserează direct, iar constrângerea `UQ_users_email` din baza de date respinge duplicatul, care devine `409`. Așa, două înregistrări simultane cu același email creează un singur cont.
4. **Răspuns** (`toUserView`): doar `id`, `email` și `createdAt`.

## Baza de date

Migrarea `1794827149538-CreateUsers.ts` creează tabelul `users`:

| Coloană | Tip | Note |
|---|---|---|
| `id` | `uuid` | `PK_users`, generat cu `gen_random_uuid()` |
| `email` | `varchar(254)` | `UQ_users_email`, `CHK_users_email_lowercase` |
| `passwordHash` | `text` | `select: false` în model: nu se încarcă decât când e cerut explicit |
| `createdAt` | `timestamptz` | `now()` |
| `updatedAt` | `timestamptz` | `now()`, actualizat la fiecare salvare |

## Cod

| Fișier | Rol |
|---|---|
| `src/routes/auth.routes.ts` | `POST /register` |
| `src/controllers/auth.controller.ts` | `register`: validează, apelează service-ul, răspunde cu `201` |
| `src/validators/auth.validator.ts` | `registerSchema` |
| `src/validators/validate.ts` | transformă erorile zod în `400` cu `fields` |
| `src/services/auth.service.ts` | `register`: hash, salvare, `409` la email duplicat |
| `src/utils/password.ts` | `hashPassword`, `verifyPassword` |
| `src/repositories/user.repository.ts` | `create` |
| `src/database/errors.ts` | `isUniqueViolation`: recunoaște încălcarea unei constrângeri unice |
| `src/models/user.model.ts` | entitatea `User` |
| `src/views/user.view.ts` | `toUserView` |

## Teste

- `test/auth.register.test.ts` (12): cont creat fără hash în răspuns, parola salvată doar ca hash, email normalizat, fără login după înregistrare, email duplicat (și cu alte litere mari sau mici), limitele parolei, email invalid, câmpuri lipsă, body care nu e obiect, două înregistrări simultane.
- `test/password.test.ts` (5): formatul hash-ului, salt nou de fiecare dată, parolă corectă și greșită, hash stricat.

```bash
node --import tsx --test --test-concurrency=1 test/auth.register.test.ts test/password.test.ts
```
