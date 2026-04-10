# ADR-015: Local Storage Target Path Binding for Desktop Agent

## Status
Accepted

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

## Decision
For MVP, use an **agent-local binding file** to map a control-plane `StorageTarget` id to a concrete filesystem root on a specific desktop agent host.

The control plane remains the authority for storage target identity, role, provider, and control-plane health state. The desktop agent remains the authority for resolving machine-local paths and verifying that those paths exist on the current host.

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

## Rationale
- best matches ADR-001 control-plane vs data-plane separation
- avoids turning the hosted control plane into the authority on machine-local paths
- keeps removable-drive details closer to the machine that can actually verify them

## Consequences
- desktop agent write execution can use a local binding map keyed by storage target id
- onboarding must include an explicit local binding or repair step
- web UI can describe missing or stale bindings without pretending it owns the path
- local path data must not be uploaded to the control plane as part of MVP execution
- multiple machines can bind the same control-plane target id differently only when later docs explicitly allow that workflow

## MVP Binding File Shape
The desktop agent reads an agent-local JSON file:

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
- duplicate `storageTargetId` entries are invalid.
- binding file writes should be local, restrictive-permission, and atomic.
- when the agent has a library-scoped credential, it may compare local binding ids/providers with control-plane storage target metadata and report missing, extra, or mismatched bindings without uploading `rootPath`.
- the agent may health-check local path providers, but it must not use local-disk health checks for future remote providers.

## Revisit Trigger
Revisit when:
- multi-device libraries need coordinated target reuse across machines
- BYO storage introduces richer path or mount identity models
- enterprise support needs centralized mount metadata
