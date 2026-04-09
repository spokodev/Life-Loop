# ADR-001: Control Plane vs Data Plane

## Decision
The VPS-hosted backend acts as a control plane, not the universal executor of file placement on user-controlled storage.

## Rationale
User disks, local mounts, and phone-originated media flows are physically and operationally closest to the desktop agent. Keeping execution local reduces coupling and avoids false assumptions about remote control over local storage.

## Consequences
- desktop agent is a first-class subsystem
- control plane stores metadata, manifests, health, and policy
- future storage adapters still fit the same model
