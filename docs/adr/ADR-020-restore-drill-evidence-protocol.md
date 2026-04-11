# ADR-020: Restore Drill Evidence Protocol

## Status
Accepted for MVP

## Context
ADR-012 requires restore drills from MVP onward because backup claims are not meaningful without restore validation. Existing restore-readiness views show whether assets have verified placements, but they do not prove that a restore drill was executed.

Life-Loop needs a conservative restore protocol that does not claim safety from metadata alone and does not require an undeclared destination-path model.

## Decision
For MVP, restore drills are explicit jobs with separate evidence records.

Rules:
1. Restore-readiness candidates are advisory inputs. They are not restore-drill evidence.
2. A restore drill may be scheduled from a small sample of ready/degraded/blocked candidates, but a drill can only pass when each sampled item has explicit evidence.
3. Evidence is recorded per sampled asset with:
   - `asset_id`,
   - candidate status at scheduling time,
   - evidence status: `ready`, `restored`, `verified`, `partial`, `failed`, or `blocked`,
   - safe evidence summary,
   - optional storage target id,
   - optional checksum used for verification,
   - timestamps.
4. `passed` requires all sampled items to reach `verified`.
5. `failed` records at least one failed or blocked item.
6. `partial` evidence keeps the drill running or failed with notes; it must not be presented as a safe pass.
7. The desktop agent must not upload restore destination paths. It may report safe target ids, checksums, evidence status, and safe error classes.
8. Until a data-plane restore executor exists, API/web surfaces may schedule drills and record explicit evidence, but must not convert metadata-only readiness into a passing drill.

## Consequences
### Positive
- Keeps restore-readiness views distinct from executed restore evidence.
- Allows a useful drill history UI before full restore byte execution is complete.
- Avoids false “safe” claims from placement metadata alone.

### Trade-offs
- Full automated restore execution remains blocked on a data-plane restore executor.
- MVP needs separate evidence records in addition to `restore_drills`.
- Operators may see scheduled/running drills with blocked evidence until executor support lands.

## Revisit Trigger
Revisit when:
- the desktop agent implements restore destination selection,
- hosted staging and local archive manifests can provide complete restore source material,
- restore drills need automatic scheduling, or
- multi-asset restore workflows need richer destination packaging.
