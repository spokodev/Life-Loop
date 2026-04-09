# ADR-011: Observability Baseline

## Status
Accepted

## Context
Life-Loop spans web, API, worker jobs, desktop agent, and storage operations. The platform needs enough observability to debug failures without overengineering too early.

## Decision
Use the following baseline:
- structured application logs everywhere
- request / job correlation IDs
- OpenTelemetry for traces and metrics where practical
- health endpoints / heartbeat checks for long-running services
- dashboards and alerts integrated with the existing VPS monitoring approach

## Why
- Strong debugging value early.
- Helps track archival failures, queue lag, and storage placement health.
- Scales better than ad-hoc logs.

## Required Health Signals
- API availability
- worker heartbeat
- queue lag
- failed job count
- upload success/failure rate
- replica verification failures
- restore drill status

## Guardrails
- never log secrets
- avoid collecting unnecessary personal media metadata in telemetry
