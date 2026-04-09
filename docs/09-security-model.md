# 09. Security Model

## Core posture
Local-first originals, least privilege, explicit trust boundaries.

## Trust zones
- iPhone
- desktop agent host
- external drives
- VPS control plane
- object storage

## High-level rules
- no hardcoded secrets
- separate control plane auth from storage secrets
- device enrollment tokens must be short-lived
- support secret rotation
- log without secrets
- treat delete flows as privileged operations

## Data protection
- encourage encrypted archive targets where practical
- support stored credentials only with explicit user choice
- separate preview/selected-online storage from primary archive semantics

## Deletion rules
Delete is never coupled implicitly to upload.
Cleanup is a separate policy engine with its own review surface.
