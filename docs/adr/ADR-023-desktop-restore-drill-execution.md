# ADR-023: Desktop Restore Drill Execution

## Status
Accepted for MVP

## Context
ADR-012 requires restore drills from MVP onward. ADR-020 defines restore-drill evidence and explicitly blocks metadata-only pass claims, but it leaves one material gap for implementation: the desktop agent needs a safe way to know which sampled assets to restore and where to put temporary restored bytes without uploading machine-local destination paths to the control plane.

This decision must preserve:
- ADR-001 control-plane vs data-plane separation,
- ADR-002 local-first originals,
- ADR-015 agent-local storage target bindings,
- ADR-018 explicit job claim and lease protocol,
- ADR-019 path-free execution manifests,
- ADR-020 evidence-based restore pass semantics,
- the MVP ban on automatic cleanup or delete behavior.

## Decision
For MVP, a desktop restore drill is an explicit `restore-drill` job with a claim-only execution manifest. The API must not automatically schedule drills in the background.

The restore drill execution manifest may contain:
- `schemaVersion`: currently `1`,
- `operation`: `restore-drill`,
- `restoreDrillId`,
- `samples`: a bounded list of sampled assets,
- for each sample:
  - `assetId`,
  - `candidateStatus` at scheduling time,
  - `source.storageTargetId`,
  - `source.provider`,
  - `source.relativePath`,
  - `source.checksumSha256`,
  - optional `source.blobId`,
  - optional `source.sizeBytes`.

Rules:
1. The control plane must never store or return absolute restore destination paths.
2. The desktop agent chooses the restore destination from agent-local config, not from the hosted control plane.
3. The MVP destination is an agent-local restore-drill workspace. If the workspace is not configured or not writable, the agent records `blocked` evidence with a safe error class.
4. The agent resolves each source through the ADR-015 local binding file and the safe storage-target-relative path from the manifest.
5. The agent must copy sampled bytes into the local restore-drill workspace, verify the restored copy checksum, and then record per-asset evidence.
6. A sample may record `verified` only when the copied bytes match the expected checksum. It reports only `assetId`, `candidateStatus`, `evidenceStatus`, `storageTargetId`, `checksumSha256`, `safeErrorClass` when relevant, and a safe summary.
7. Missing binding, provider mismatch, unsafe relative path, missing source, unavailable disk, checksum mismatch, unsupported provider, and missing restore workspace are blocked or failed outcomes with safe error classes.
8. Temporary restore-drill workspace handling must not delete originals, phone assets, archive placements, or staged uploads. Any workspace cleanup must be limited to agent-local temporary drill artifacts and must not be represented as product cleanup eligibility.
9. The job completes `succeeded` only when all samples are recorded as `verified`; it completes `blocked` or `completed_with_warnings` with a reason when any sample is blocked, failed, or partial.
10. Restore-readiness candidates remain advisory. They may be used by an explicit user/operator action to build a restore-drill manifest, but they are not evidence until the agent records per-sample evidence.

## Consequences
### Positive
- Gives the desktop agent enough information to execute a real restore drill without path leakage.
- Keeps restore pass state evidence-based and separate from placement metadata.
- Preserves local-first originals and control-plane/data-plane separation.
- Gives blocked restore drills actionable safe error classes instead of silent failure.

### Trade-offs
- A restore-drill workspace must be configured on the agent host before automated drill execution can pass.
- The control plane needs a manifest builder before web/API can create executable restore-drill jobs.
- MVP restore drills are bounded samples, not full-library restores.

## Revisit Trigger
Revisit when:
- restore drills need packaged multi-asset destinations,
- operators need long-lived restored artifact retention,
- non-local providers need provider-specific restore source material,
- restore-drill scheduling becomes automatic, or
- workspace cleanup needs product-visible retention controls.
