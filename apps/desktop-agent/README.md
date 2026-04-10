# apps/desktop-agent

Local execution agent in Go.

## Responsibility
- disk detection and future mount observation
- ingest staging
- checksum verification
- local copy, restore, and replica writes
- resumable jobs
- health and heartbeat reporting back to the control plane
- secure local storage of the redeemed device credential

## Guardrails
- writes remain local to the user-controlled data plane
- delete and cleanup stay separate from ingest success
- future storage adapters must implement the shared provider contract
- enrollment tokens are one-time bootstrap secrets, not long-lived agent identity
