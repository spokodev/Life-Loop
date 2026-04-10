# ADR-014: Desktop Agent Device Auth and Heartbeat Model

## Status
Accepted for MVP

## Context
Life-Loop already documents:
- Clerk as the user and web auth provider
- one-time desktop device enrollment tokens
- short-lived enrollment tokens as a security rule
- heartbeat and worker health as required observability signals

What was not explicitly closed was the auth model **after** the enrollment token is redeemed. That gap blocks high-quality implementation of:
- desktop-agent registration handshake
- authenticated heartbeat reporting
- device revocation and credential rotation
- trustworthy worker-health status in the control plane

This is a material security and architecture choice, so it must not be improvised in implementation code.

## Decision
For MVP:

1. A desktop device is enrolled through a **short-lived one-time enrollment token** created by the control plane.
2. Redeeming that token creates or returns a **device-scoped credential** for that specific device record.
3. Subsequent agent calls to the control plane use the **device credential**, not a Clerk user session.
4. The control plane stores only a **hashed representation** of the device secret, never the raw secret.
5. Device credentials must support:
   - explicit revocation
   - explicit rotation
   - independent invalidation from user web sessions
6. Heartbeat updates must be authenticated with the device credential and must update:
   - device trust / active status
   - `last_seen_at`
   - worker-health signals and related audit / job metadata as applicable
7. Other agent control-plane reads may use the same device credential when scoped back to that credential's library and must not treat device auth as user auth.

## Why
- Keeps user auth and machine auth cleanly separated.
- Fits the documented control-plane vs data-plane boundary.
- Avoids coupling a long-running local agent to Clerk browser/session mechanics.
- Makes revocation and credential rotation operationally clear.
- Supports explicit, trustworthy worker-health reporting instead of inferred liveness.
- Keeps the MVP simple enough for a single VPS while remaining security-conscious.

## Guardrails
- Enrollment tokens remain short-lived and one-time use.
- Raw device secrets must not be logged.
- Device auth must not be reused as user auth.
- Revoked devices must stop being treated as trusted heartbeat sources.
- Cleanup or archival safety must not depend on unauthenticated agent reports.

## Consequences
### Positive
- Clear path to implement authenticated agent registration and heartbeat.
- Better revocation story than tying the agent to user sessions.
- Cleaner observability for worker heartbeat and device trust state.

### Trade-offs
- Adds a distinct machine-auth path to the control plane.
- Requires secure local credential storage on the agent host.
- Rotation and revocation flows must be implemented deliberately, not as an afterthought.

## Revisit Trigger
Revisit when:
- multi-device organizations need richer machine identity policy,
- mutual TLS or signed-request models become operationally justified, or
- hosted / enterprise requirements demand stronger device-attestation guarantees.
