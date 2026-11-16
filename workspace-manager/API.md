# Workspace Manager API

## Scop

Workspace Manager este backend-ul care creează și controlează workspace-uri
Kubernetes. Fiecare workspace conține:

- un container `workspace-runtime`, unde rulează runtime-ul de limbaj;
- un container `file-agent`, care operează fișierele din `/workspace`;
- un PVC pentru persistența fișierelor;
- un Service intern pentru File Agent, pe portul `8081`.

Backend-ul Workspace Manager ascultă pe portul `8080`.

În configurația actuală nu există autentificare sau token-uri.

## URL de bază

În cluster, backend-ul poate fi accesat prin Service-ul său:

```text
http://workspacemanager:8080
```

Pentru testare locală:

```bash
kubectl port-forward service/workspacemanager 8080:8080
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

Trebuie să fie compatibil cu numele resurselor Kubernetes, de exemplu:

```text
workspace-123
```

### `userID`

Identificatorul utilizatorului care deține workspace-ul. Este salvat ca label
Kubernetes și este trimis la crearea workspace-ului.

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
  "workspaceID": "workspace-123",
  "userID": "user-456"
}
```

Răspuns:

```text
201 Created
```

Operația creează:

1. PVC-ul `<workspaceID>-pvc`;
2. Deployment-ul `<workspaceID>`;
3. Service-ul `<workspaceID>`.

### Pornire workspace

```http
POST /workspaces/{workspaceID}/start
```

Setează Deployment-ul la `replicas=1`.

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

## Exemple pentru frontend

```javascript
const baseURL = "http://127.0.0.1:8080";
const workspaceID = "workspace-123";

await fetch(`${baseURL}/workspaces/${workspaceID}/start`, {
  method: "POST",
});

const response = await fetch(
  `${baseURL}/workspaces/${workspaceID}/files?path=README.md`,
);
const content = await response.text();
```

Pentru upload:

```javascript
await fetch(
  `${baseURL}/workspaces/${workspaceID}/files?path=README.md`,
  {
    method: "PUT",
    body: "# Workspace",
  },
);
```

## Exemple pentru backend/integration tests

```bash
curl -i http://127.0.0.1:8080/health

curl -i -X POST http://127.0.0.1:8080/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"workspaceID":"workspace-123","userID":"user-456"}'

curl -i http://127.0.0.1:8080/workspaces/workspace-123/status

curl -i -X POST \
  http://127.0.0.1:8080/workspaces/workspace-123/directories?path=src

curl -i -X POST \
  http://127.0.0.1:8080/workspaces/workspace-123/files?path=README.md \
  --data '# Workspace'

curl -iG \
  http://127.0.0.1:8080/workspaces/workspace-123/files/list \
  --data-urlencode 'path=src'

curl -i \
  http://127.0.0.1:8080/workspaces/workspace-123/files?path=README.md

curl -i -X PUT \
  http://127.0.0.1:8080/workspaces/workspace-123/files?path=README.md \
  --data '# Updated workspace'

curl -i -X DELETE \
  http://127.0.0.1:8080/workspaces/workspace-123/files?path=README.md
```

## Erori

În forma actuală:

- body JSON invalid la creare workspace: `400 Bad Request`;
- erorile de Kubernetes sau File Agent sunt returnate de handler-ele
  Workspace Manager ca `500 Internal Server Error`;
- File Agent poate furniza mesaje mai precise, precum `404`, `409` sau
  `400`, dar acestea sunt momentan împachetate de backend ca eroare `500`.

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

- Nu există autentificare.
- Nu există endpoint pentru ștergerea completă a workspace-ului.
- Nu există endpoint HTTP pentru `exec`; execuțiile trebuie implementate prin
  Kubernetes API `pods/exec`.
- Service-ul Workspace Manager trebuie să aibă RBAC pentru resursele din
  namespace-ul `cloud-ide` (sau valoarea variabilei `WORKSPACE_NAMESPACE`).
