# 10. QA and Review Strategy

## Quality loop
design -> implement -> review -> break intentionally -> fix -> verify -> release

## Review tracks
- architecture review
- code review
- security review
- UX review
- bug review
- release review

## Mandatory scenarios
- interrupted upload
- disk unplug during write
- duplicate import
- low storage space
- partial Live Photo pair
- stale replica
- checksum mismatch
- control plane unavailable
- agent restart mid-job
- restore of single asset
- restore of date range
- cleanup attempted before verification

## Regression rule
Every data-loss class bug must add a regression test or simulation artifact.
