# ADR-022: Hosted Staging Archive Handoff

## Status
Accepted for MVP

## Context
ADR-010 selects cloud-staging-first iPhone ingest. ADR-019 allows `hosted-staging` as a non-path source reference for `archive-placement` execution manifests. ADR-021 defines hosted staging retention and quota rules, including that staged uploads are temporary convenience storage and not archive safety.

The remaining material gap is the concrete handoff from a completed hosted-staging upload to a desktop-agent archive placement job. The handoff must let an authenticated desktop agent fetch bytes without exposing raw local paths, without turning hosted staging into archive-primary storage, and without adding hidden retention automation.

## Decision
For MVP, a hosted-staging archive handoff uses an explicit claimed job and lease-authorized source fetch:

- `job_runs.payload.execution.source.kind` may be `hosted-staging`.
- `source.stagingObjectId` identifies the staged object by opaque control-plane id.
- The desktop agent may fetch the staged object only through a job-scoped API route that requires:
  - a valid Bearer device credential,
  - a running job claimed by that device,
  - a valid lease token for that job,
  - a job execution manifest whose `source.kind` is `hosted-staging`,
  - a matching `source.stagingObjectId`,
  - the same library id across job, device, and staging object.
- The fetch route streams bytes only. It does not return storage-root paths, staging filesystem paths, or local device paths.
- The desktop agent writes fetched bytes to a local temporary source file, runs the existing local provider `Put` path with checksum verification and atomic destination rename, then removes the temporary source file.
- The API may mark a fetched `staged` object as `archiving` as an observable status transition. It must not mark the asset verified or cleanup-eligible from fetch alone.
- Checksum mismatch, expired staging, missing object, lease mismatch, provider mismatch, unavailable disk, and unsupported provider are blocked outcomes with safe error classes.

## Consequences
### Positive
- Gives iPhone staged uploads a concrete, safe path into desktop archive placement.
- Keeps the control plane out of local path authority.
- Reuses the ADR-018 job lease model for byte-fetch authorization.
- Preserves ADR-021 safety language: hosted staging is temporary and not archive truth.

### Trade-offs
- The desktop agent needs a temporary source cache for streamed hosted bytes.
- Large objects still follow ADR-021 MVP size limits and may need later multipart/resume work.
- Fetch authorization is intentionally stricter than general staging list access, so manual debugging requires an active claim or admin tooling later.

## Revisit Trigger
Revisit when:
- resumable large-object staging is added,
- a production object-store provider replaces local filesystem staging,
- multi-device archive agents need work-stealing across staged objects, or
- retention cleanup becomes an observable scheduled job with its own ADR.
