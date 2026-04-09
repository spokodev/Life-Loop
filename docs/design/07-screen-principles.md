# Screen Principles

## Purpose
Life-Loop screens must communicate three things clearly:
1. what exists
2. what state it is in
3. what the next safe action is

## Global screen rules
- every screen has one primary question it answers
- every screen has one primary action, not several competing actions
- every screen must handle empty, loading, partial, success, error, and disconnected states
- every screen must preserve trust language and status vocabulary
- every screen must degrade gracefully on small screens and reduced-motion mode

## Screen families

### Overview
Primary question: **Am I safe right now?**

Must show:
- overall archive health
- replica health
- outstanding failures
- items awaiting verification
- safe cleanup count
- one clear next recommended action

Must not:
- bury critical alerts below charts
- overload the screen with technical details before the health summary

### Library
Primary question: **What do I have?**

Must show:
- assets, groups, and filters
- clear per-item status
- placements summary
- recoverable item detail

Must not:
- confuse preview presence with archival safety

### Devices
Primary question: **Which devices are connected and trusted?**

Must show:
- device role
- last seen time
- health
- sync or ingest responsibility
- revoke / repair actions

### Storage
Primary question: **Where does the data live?**

Must show:
- target roles
- availability
- space pressure
- verification health
- stale replica warnings
- connection state

### Activity
Primary question: **What changed, failed, or recovered?**

Must show:
- time-ordered events
- job status
- retry history
- operator-readable explanations

### Restore
Primary question: **What can I get back and how safely?**

Must show:
- restore source
- restore scope
- expected result
- warnings if a placement is degraded

### Settings
Primary question: **What policies are in effect?**

Must show:
- organization and library context
- storage policy
- cleanup policy
- billing and limits separately from archive health

## Transitional-state rule
Each screen must define what it looks like in:
- first load
- loading refresh
- optimistic action acknowledgement
- server-confirmed success
- recoverable failure
- blocking failure
- empty state
- disconnected / unavailable dependency state

## Copy rules
- prefer concrete language over clever language
- success copy should confirm the result, not just emotion
- error copy should state what failed, what still remains safe, and what to do next
- destructive actions must say what remains after the action

## Layout rules
- maintain a stable visual anchor during state changes
- avoid moving primary controls between states
- status summaries should remain visible during retries where possible
- use progressive disclosure for advanced topology and infra detail
