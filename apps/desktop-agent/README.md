# apps/desktop-agent

Local execution agent in Go.

## Responsibility
- disk detection and future mount observation
- ingest staging
- checksum verification
- local copy, restore, and replica writes
- atomic local write + verify provider primitives
- resumable jobs
- health and heartbeat reporting back to the control plane
- secure local storage of the redeemed device credential

## Guardrails
- writes remain local to the user-controlled data plane
- delete and cleanup stay separate from ingest success
- future storage adapters must implement the shared provider contract
- enrollment tokens are one-time bootstrap secrets, not long-lived agent identity
- local storage-target path binding follows accepted `ADR-015`
- raw local target paths stay in the agent-local binding file and must not be uploaded to the control plane in MVP

## Storage target binding
MVP storage execution uses an agent-local JSON file keyed by control-plane storage target id.

Default path:
- macOS/Linux config dir: `life-loop/storage-bindings.json`
- fallback: `.life-loop/storage-bindings.json`

Example:

```json
{
  "bindings": [
    {
      "storageTargetId": "00000000-0000-0000-0000-000000000000",
      "provider": "local-disk",
      "rootPath": "/Volumes/LifeLoopPrimary"
    }
  ]
}
```

Rules:
- `rootPath` must be absolute.
- duplicate `storageTargetId` entries are rejected.
- when a device credential is available, the agent compares local binding ids/providers with credential-scoped control-plane storage targets.
- missing, extra, or provider-mismatched bindings are logged without exposing local root paths to the control plane.
- the agent validates root health locally at startup.
- missing binding files do not stop heartbeat, but archive execution remains blocked until bindings exist.

## Job execution
After each heartbeat interval, the agent makes one bounded claim request for `archive-placement` and `placement-verification` jobs.

Execution rules:
- job claims use the device credential and a server-issued lease token.
- `placement-verification` verifies the checksum at `binding.rootPath + execution.relativePath`.
- `archive-placement` remains blocked until the job includes a supported non-path source reference from ADR-019.
- missing manifests, missing bindings, provider mismatches, unsupported providers, unavailable disks, and checksum mismatches complete the claim as `blocked` with a safe error class.
- completion reports do not include raw local filesystem paths.
