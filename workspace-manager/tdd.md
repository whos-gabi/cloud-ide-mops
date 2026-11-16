# TDD - Workspace Manager

## Obiectiv

Aplicația este verificată prin teste unitare și teste de integrare. Testele descriu comportamentul așteptat al API-ului și al serviciului de workspace, iar implementarea este validată prin rularea suitei complete.

## Ciclul TDD

### Red

Pentru fiecare funcționalitate au fost definite mai întâi cazurile de test:

- răspunsul endpoint-ului de health check;
- crearea unui workspace;
- validarea payload-ului JSON;
- citirea și listarea fișierelor;
- propagarea erorilor;
- pornirea și oprirea unui workspace;
- crearea resurselor Kubernetes.

Testele folosesc verificări explicite pentru statusuri HTTP, payload-uri, identificatori de workspace, conținutul fișierelor și starea resurselor.

### Green

Implementarea curentă trece toate testele unitare și testele de integrare Kubernetes disponibile.

### Refactor

Routerul HTTP folosește interfața `workspaceService`, ceea ce permite izolarea handler-elor de infrastructura Kubernetes și menține testele independente de implementarea concretă a clientului.

## Teste HTTP

Testele sunt implementate în [cmd/main_test.go]

| Test | Comportament verificat |
|---|---|
| `TestNewRouterHealth` | `GET /health` returnează `200 OK` și `Up`, fără token |
| `TestRouterRejectsRequestsWithoutTheToken` | Fără token sau cu token greșit: `401`, service-ul nu e apelat |
| `TestRouterWithEmptyTokenRejectsEverything` | Un token gol în configurație nu deschide API-ul |
| `TestRouterRejectsWorkspaceIDsOutsideItsOwn` | Nume ca `backend` sau `postgres` returnează `400` |
| `TestCreateWorkspaceHandler` | Un workspace valid returnează `201 Created` |
| `TestCreateWorkspaceHandlerRejectsInvalidJSON` | JSON-ul invalid returnează `400 Bad Request` |
| `TestCreateWorkspaceHandlerRejectsInvalidIDs` | `workspaceID`/`userID` invalide returnează `400` |
| `TestCreateWorkspaceHandlerReportsExistingWorkspaceAsConflict` | Un workspace existent returnează `409` |
| `TestDeleteWorkspaceHandler` | `DELETE /workspaces/{id}` returnează `204` |
| `TestStartWorkspaceHandlerReportsMissingWorkspaceAsNotFound` | Un workspace inexistent returnează `404` |
| `TestReadFileHandler` | Citirea unui fișier returnează conținutul corect |
| `TestListFilesHandlerReturnsJSON` | Lista de fișiere este serializată corect în JSON |
| `TestFileHandlersForwardTheFileAgentStatus` | `400`, `404`, `409`, `413` de la File Agent ajung neschimbate |
| `TestFileHandlersReportAnUnreachableWorkspaceAsUnavailable` | Un workspace oprit returnează `503` |
| `TestFileContentHandlerReturnsServerError` | Erorile de stocare returnează `500 Internal Server Error` |

## Teste Workspace Service

Testele sunt implementate în [internal/workspace/service_test.go]

Sunt verificate operațiile:

- citire fișier;
- creare fișier;
- actualizare fișier;
- ștergere fișier;
- creare director;
- listare fișiere;
- crearea resurselor, cu label-uri și fără token Kubernetes în pod (`TestCreateWorkspaceCreatesLabeledResources`);
- ștergerea completă, și a unui workspace creat pe jumătate (`TestDeleteWorkspaceRemovesEverythingAndToleratesMissingParts`);
- erorile File Agent devin `StatusError` cu statusul lui, iar un File Agent care nu răspunde devine `ErrUnavailable`;
- formatul `workspaceID` (`TestValidWorkspaceID`).

Testele verifică erori descriptive și păstrează service-ul izolat de un cluster Kubernetes pentru testele unitare: resursele se verifică pe clientul fals din `k8s.io/client-go/kubernetes/fake`, iar File Agent e înlocuit cu un server `httptest`.

Rulare:

```bash
go test ./internal/workspace -run 'Test(ReadFile|CreateFile|UpdateFile|DeleteFile|CreateDirectory|ListFiles)'
```

## Test de integrare Kubernetes

Testul de integrare este în [internal/workspace/service_integration_test.go]

Acesta verifică funcționalitatea reală în Kubernetes:

1. creează PVC-ul, Deployment-ul și Service-ul;
2. verifică existența resurselor;
3. oprește workspace-ul și verifică statusul `stopped`;
4. pornește workspace-ul și verifică o replică activată;
5. elimină resursele create după test.

Testul folosește configurația din `KUBECONFIG` sau `~/.kube/config` și necesită
namespace-ul `cloud-ide` (sau valoarea variabilei `WORKSPACE_NAMESPACE`).

```bash
RUN_K8S_INTEGRATION=1 go test ./internal/workspace \
  -run TestWorkspaceServiceKubernetesIntegration -v
```

## Validare completă

```bash
go test ./...
```

Rezultat:

```text
ok      github.com/whos-gabi/cloud-ide-mops/workspace-manager/cmd
ok      github.com/whos-gabi/cloud-ide-mops/workspace-manager/internal/workspace
```

## Rulare detaliată

```bash
go test ./cmd -v
go test ./internal/workspace -v
```
