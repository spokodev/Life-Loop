# 02. System Context

## Planes
### User plane
- registration
- onboarding
- subscription / plan
- libraries
- devices
- storage targets

### Control plane
- auth
- manifests
- jobs metadata
- policies
- audit logs
- health status
- notifications

### Data plane
- iPhone uploads
- desktop agent ingest
- local HDD / SSD copies
- S3 / cloud placements
- previews and derivatives

## Core principle
The control plane does not directly orchestrate bytes on user disks. The desktop agent performs execution and reports durable state transitions back to the control plane.

## Canonical flow
iPhone / browser / AirDrop / watch folder
-> staging
-> normalization
-> archive primary
-> verify
-> archive replica
-> verify
-> optional selected-online publish
-> eligible phone cleanup
