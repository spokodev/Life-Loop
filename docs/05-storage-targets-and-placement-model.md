# 05. Storage Targets and Placement Model

## Why this matters
Storage support must scale without turning each new backend into a bespoke exception path.

## Abstraction
All storage backends implement a common provider contract:
- put
- get
- verify
- list
- delete
- health
- capabilities

## Planned providers
- LocalDiskProvider
- ExternalDriveProvider
- S3Provider
- SMBProvider
- WebDAVProvider
- VPSManagedPreviewProvider

## Roles
Storage targets are not equal peers.
There is a canonical primary archive and one or more replicas.

## Explicit anti-pattern
Do not model two external disks as fully symmetric peers that resolve conflicts between themselves.

## Placement model
A Placement is the fact that a Blob exists on a specific StorageTarget with a checksum and health state.
