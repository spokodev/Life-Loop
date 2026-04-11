# ADR-019: Desktop Agent Execution Manifest

## Status
Accepted for MVP

## Context
ADR-018 defines how a desktop agent safely claims, leases, heartbeats, and completes jobs, but it does not define the executable payload shape for jobs that move or verify bytes.

The current domain model has asset, blob, placement, and storage target metadata. It deliberately does not store machine-local filesystem paths in the control plane. ADR-015 also requires local storage target roots to remain in an agent-local binding file.

This leaves one material implementation gap: the agent needs enough information to execute `archive-placement` and `placement-verification` jobs without uploading or receiving raw local paths from the hosted control plane.

## Decision
For MVP, device-agent job claims may include a safe execution manifest derived from `job_runs.payload.execution`.

The execution manifest may contain:
- `schemaVersion`: currently `1`,
- `operation`: `archive-placement` or `placement-verification`,
- `storageTargetId`,
- `provider`,
- `relativePath`: a storage-target-relative object key or path segment,
- `blobId`,
- `assetId`,
- `checksumSha256`,
- `sizeBytes`,
- `source`: a non-path source reference for placement jobs.

Allowed `source.kind` values for MVP:
- `agent-local-staging`: resolves through an agent-local staging/source manifest, not through a control-plane path.
- `hosted-staging`: resolves through a future hosted staging fetch API with documented retention/quota policy.

Rules:
1. The control plane must never store or return absolute local source paths or storage-root paths.
2. `relativePath` must be relative, normalized, and must not contain drive roots, leading slashes, `..`, or platform-specific absolute path prefixes.
3. The desktop agent resolves `storageTargetId` through the ADR-015 local binding file, then joins the binding root with the safe `relativePath`.
4. The desktop agent resolves `agent-local-staging` through an agent-local source manifest keyed by an opaque id. That manifest is device-local and is not uploaded to the control plane.
5. The desktop agent blocks jobs that lack an execution manifest, reference unsupported source kinds, reference missing bindings, mismatch providers, fail health checks, or fail checksum verification. It reports only safe error classes and operator-readable reasons.
6. `placement-verification` can execute with `storageTargetId`, `provider`, `relativePath`, and `checksumSha256`; it does not need a source reference.
7. `archive-placement` must not execute unless it has both a valid destination reference and a supported source reference.
8. Successful execution reports only ids, checksums, size, placement outcome, health state, and safe error classes. It must not report raw paths.

## Consequences
### Positive
- Keeps the control plane as metadata/policy authority, not machine-local path authority.
- Gives the agent enough structure to execute and safely block jobs.
- Allows hosted iPhone staging and local desktop staging to share one job protocol later.
- Preserves retry safety because invalid manifests become explicit blocked jobs, not silent executor failures.

### Trade-offs
- Some current `archive-placement` jobs remain blocked until producers attach a valid execution manifest and source reference.
- The API must expose a claim-only execution manifest while keeping generic job list surfaces path-free.
- A device-local source manifest is required before local desktop-origin placement jobs can execute from raw files.

## Revisit Trigger
Revisit when:
- hosted staging retention/quota policy is accepted,
- source manifests need multi-device coordination,
- object key generation needs stronger content-addressed layout rules, or
- BYO remote providers need provider-specific execution metadata.
