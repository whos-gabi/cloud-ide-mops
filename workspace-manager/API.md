# Workspace Manager API

## Scop

Workspace Manager este backend-ul care creează și controlează workspace-uri
Kubernetes. Fiecare workspace conține:

- un container `workspace-runtime`, unde rulează runtime-ul de limbaj;
- un container `file-agent`, care operează fișierele din `/workspace`;
- un PVC pentru persistența fișierelor;
- un Service intern pentru File Agent, pe portul `8081`.

Backend-ul Workspace Manager ascultă pe portul `8080`.

## Autentificare

Toate endpoint-urile, în afară de `GET /health`, cer header-ul:

```text
Authorization: Bearer <token>
```

Token-ul vine din variabila `WORKSPACE_MANAGER_TOKEN`. În cluster, `scripts/deploy.sh`
îl generează o singură dată în secretul `workspace-manager-token` (cheia `token`),
iar Workspace Manager și backend-ul îl citesc de acolo. Fără variabilă, serviciul nu
pornește. Un request fără token sau cu token greșit primește `401 Unauthorized`.
Backend-ul primește același secret prin `k8s/backend.yaml` din momentul în care
începe să apeleze serviciul (US04).

## URL de bază

În cluster, backend-ul poate fi accesat prin Service-ul său:

```text
http://workspace-manager:8080
```

Pentru testare locală:

```bash
kubectl -n cloud-ide port-forward service/workspace-manager 8080:8080
TOKEN=$(kubectl -n cloud-ide get secret workspace-manager-token -o jsonpath='{.data.token}' | base64 -d)
```

URL-ul de bază devine:

```text
http://127.0.0.1:8080
```

## Variabile și identificatori

### `workspaceID`

Identificator unic pentru workspace.

Este folosit ca:

- nume de Deployment;
- nume de Service;
- prefix pentru PVC (`<workspaceID>-pvc`);
- nume DNS intern pentru File Agent.

Trebuie să înceapă cu `ws-`, urmat de litere mici, cifre și `-` (fără `-` la final),
cel mult 51 de caractere în total, de exemplu:

```text
ws-123
```

Orice alt nume primește `400 Bad Request`. Astfel serviciul nu poate atinge alte
resurse din namespace (backend, frontend, postgres).

### `userID`

Identificatorul utilizatorului care deține workspace-ul. Este salvat ca label
Kubernetes și este trimis la crearea workspace-ului, deci trebuie să fie o valoare
validă de label (de exemplu un UUID); altfel răspunsul e `400 Bad Request`.

### `path`

Calea relativă în `/workspace`, transmisă ca query parameter:

```text
?path=src/main.py
```

Nu se folosesc căi absolute. Pentru fișiere din root:

```text
?path=README.md
```

Pentru listarea root-ului, `path` poate fi gol:

```text
?path=
```

Frontend-ul trebuie să encodeze valoarea query parameter-ului.

## Endpoints

### Health check

```http
GET /health
```

Răspuns:

```text
200 OK
Up
```

### Creare workspace

```http
POST /workspaces
Content-Type: application/json
```

Body:

```json
{
  "workspaceID": "ws-123",
  "userID": "user-456"
}
```

Răspuns:

```text
201 Created
```

Operația creează:

1. PVC-ul `<workspaceID>-pvc`;
2. Deployment-ul `<workspaceID>`, pornit (`replicas=1`);
3. Service-ul `<workspaceID>`.

Toate au label-ul `app.kubernetes.io/managed-by: workspace-manager`. Pod-urile nu
primesc token pentru API-ul Kubernetes. Dacă workspace-ul există deja: `409 Conflict`.

### Ștergere workspace

```http
DELETE /workspaces/{workspaceID}
```

Șterge Deployment-ul, Service-ul și PVC-ul, deci și fișierele. Părțile care lipsesc
deja sunt ignorate, așa că poate curăța și un workspace creat pe jumătate.
Kubernetes termină ștergerea în fundal, în câteva secunde. Până atunci, o creare
cu același `workspaceID` primește `409`, deci folosește un ID nou pentru fiecare workspace.

```text
204 No Content
```

### Pornire workspace

```http
POST /workspaces/{workspaceID}/start
```

Setează Deployment-ul la `replicas=1`. Dacă workspace-ul nu există: `404 Not Found`.

Răspuns:

```text
204 No Content
```

### Oprire workspace

```http
POST /workspaces/{workspaceID}/stop
```

Setează Deployment-ul la `replicas=0`. PVC-ul și Service-ul rămân
existente.

Răspuns:

```text
204 No Content
```

### Status workspace

```http
GET /workspaces/{workspaceID}/status
```

Răspunsuri posibile:

```text
starting
running
stopped
```

Statusul este trimis ca text simplu, nu ca JSON.

### Citire fișier

```http
GET /workspaces/{workspaceID}/files?path=src/main.py
```

Răspunsul conține direct conținutul fișierului:

```text
200 OK
Content-Type: application/octet-stream
```

### Listare fișiere

```http
GET /workspaces/{workspaceID}/files/list?path=src
```

Returnează directorul și elementele sale directe în format JSON:

```json
{
  "name": "src",
  "type": "directory",
  "children": [
    {
      "name": "main.py",
      "type": "file",
      "size": 128
    }
  ]
}
```

### Creare fișier

```http
POST /workspaces/{workspaceID}/files?path=src/main.py
```

Body-ul requestului este conținutul brut al fișierului.

```text
204 No Content
```

Operația eșuează dacă fișierul există deja.

### Actualizare fișier

```http
PUT /workspaces/{workspaceID}/files?path=src/main.py
```

Body-ul requestului este noul conținut brut al fișierului.

```text
204 No Content
```

### Ștergere fișier

```http
DELETE /workspaces/{workspaceID}/files?path=src/main.py
```

```text
204 No Content
```

### Redenumire fișier

```http
POST /workspaces/{workspaceID}/files/rename?path=src/main.py&destination=src/app.py
```

Redenumește un fișier în același workspace. Căile sunt relative la `/workspace`.

```text
204 No Content
```

### Mutare fișier

```http
POST /workspaces/{workspaceID}/files/move?path=src/app.py&destination=archive/app.py
```

Mută un fișier în alt director din același workspace. Directorul destinație
trebuie să existe deja.

```text
204 No Content
```

### Creare director

```http
POST /workspaces/{workspaceID}/directories?path=src
```

```text
201 Created
```

## Exemple pentru backend

Serviciul e doar pentru backend: browser-ul nu are acces la el și nu are token-ul.

```javascript
const baseURL = "http://workspace-manager:8080";
const headers = { Authorization: `Bearer ${process.env.WORKSPACE_MANAGER_TOKEN}` };
const workspaceID = "ws-123";

await fetch(`${baseURL}/workspaces/${workspaceID}/start`, {
  method: "POST",
  headers,
});

const response = await fetch(
  `${baseURL}/workspaces/${workspaceID}/files?path=README.md`,
  { headers },
);
const content = await response.text();
```

## Exemple cu curl

`TOKEN` ca la „Pentru testare locală” de mai sus.

```bash
curl -i http://127.0.0.1:8080/health

curl -i -X POST http://127.0.0.1:8080/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"workspaceID":"ws-123","userID":"user-456"}'

curl -i -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/workspaces/ws-123/status

curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:8080/workspaces/ws-123/directories?path=src'

curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:8080/workspaces/ws-123/files?path=README.md' \
  --data '# Workspace'

curl -iG -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/workspaces/ws-123/files/list \
  --data-urlencode 'path=src'

curl -i -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:8080/workspaces/ws-123/files?path=README.md'

curl -i -X PUT -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:8080/workspaces/ws-123/files?path=README.md' \
  --data '# Updated workspace'

curl -i -X DELETE -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:8080/workspaces/ws-123/files?path=README.md'

curl -i -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/workspaces/ws-123
```

## Erori

Corpul răspunsului de eroare este un mesaj text.

| Status | Când |
|---|---|
| `400 Bad Request` | body JSON invalid, `workspaceID` sau `userID` invalid, cale invalidă (File Agent) |
| `401 Unauthorized` | lipsește token-ul sau e greșit |
| `404 Not Found` | workspace-ul (Deployment-ul) nu există, inclusiv la operațiile pe fișiere; fișierul sau directorul nu există (File Agent) |
| `409 Conflict` | workspace-ul există deja, fișierul sau directorul există deja (File Agent) |
| `413 Request Entity Too Large` | fișier peste 10 MB (File Agent) |
| `503 Service Unavailable` | File Agent nu răspunde: workspace-ul e oprit sau încă pornește |
| `500 Internal Server Error` | orice altă eroare de Kubernetes sau de File Agent |

Pentru erorile File Agent, statusul și mesajul lui sunt transmise mai departe neschimbate.

## Arhitectura internă

Fluxul pentru fișiere este:

```text
Frontend
  -> Workspace Manager :8080
  -> Service <workspaceID> în namespace cloud-ide :8081
  -> container file-agent
  -> /workspace din PVC
```

Runtime-ul de limbaj și File Agent folosesc același PVC montat la
`/workspace`.

## Limitări actuale

- File Agent nu are autentificare: din cluster (inclusiv din alt workspace) poate
  fi apelat direct pe portul `8081`. Izolarea între workspace-uri (US18) va cere
  NetworkPolicy.
- Nu există endpoint HTTP pentru `exec`; execuțiile trebuie implementate prin
  Kubernetes API `pods/exec`.
- Service-ul Workspace Manager trebuie să aibă RBAC pentru resursele din
  namespace-ul `cloud-ide` (sau valoarea variabilei `WORKSPACE_NAMESPACE`).
