# 07. Local Agent Architecture

## Preferred language
Go

## Why
- stable long-running process model
- strong filesystem and networking primitives
- easy distribution for macOS / Windows / Linux
- low memory footprint

## Responsibilities
- detect mounts
- stage imports
- checksum calculation
- write + verify placements
- resume interrupted jobs
- restore jobs
- publish health and telemetry to control plane

## Write discipline
- write temp path
- fsync / flush if applicable
- checksum verify
- atomic rename
- durable state transition

## Failure classes
- disk unavailable
- insufficient space
- partial write
- checksum mismatch
- interrupted job
- stale target
