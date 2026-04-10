# ADR-015: Local Storage Target Path Binding for Desktop Agent

## Status
Proposed

## Context
Life-Loop now has:
- a storage target registry in the control plane
- authenticated desktop devices
- a data-plane rule that local disk writes must remain on the user machine
- a provider abstraction for storage execution

What is still not explicitly closed is how a registered local storage target becomes a concrete filesystem destination on a specific desktop agent host.

That decision is material because it affects:
- how a desktop agent discovers or claims archive-primary and archive-replica destinations
- whether local path metadata is stored in the control plane, only on the agent, or split across both
- how mount changes and removable drives are matched safely
- whether a control-plane storage record can be reused across multiple machines

This should not be improvised inside implementation code.

## Decision Needed
Define the MVP rule for mapping a control-plane `StorageTarget` to an agent-local filesystem path.

## Candidate Directions
1. **Agent-local binding file**
   - The control plane stores role/provider/health identity only.
   - Each desktop agent stores the actual local path binding in a device-local config file.
   - Pros:
     - keeps raw local paths out of hosted control-plane state
     - fits control-plane vs data-plane separation well
   - Cons:
     - onboarding and repair flows need an extra local step

2. **Control-plane stores path metadata for local targets**
   - The control plane persists a machine-specific path or mount hint for the target.
   - Pros:
     - easier remote visibility in the web UI
   - Cons:
     - risks smuggling machine-local execution details into the control plane
     - more brittle across OS differences and removable media

3. **Hybrid mount identity**
   - The control plane stores an abstract target identity while the agent keeps the final resolved path.
   - Pros:
     - allows repair and visibility without full path centralization
   - Cons:
     - more moving parts for MVP

## Current Recommendation
Prefer **agent-local binding file** for MVP unless a stronger documented need appears.

Why:
- best matches ADR-001 control-plane vs data-plane separation
- avoids turning the hosted control plane into the authority on machine-local paths
- keeps removable-drive details closer to the machine that can actually verify them

## Consequences
If accepted:
- desktop agent write execution can use a local binding map keyed by storage target id
- onboarding must include an explicit local binding or repair step
- web UI can describe missing or stale bindings without pretending it owns the path

## Revisit Trigger
Revisit when:
- multi-device libraries need coordinated target reuse across machines
- BYO storage introduces richer path or mount identity models
- enterprise support needs centralized mount metadata
