# 08. iOS App Architecture

## Primary goal
Provide safe media ingest and clear backup state without over-requesting permissions.

## Recommended foundations
- SwiftUI
- PhotosPicker
- background URLSession uploads
- explicit status model

## Channels
- primary: native upload to control/staging endpoint
- secondary: browser upload on local network
- manual shortcut: AirDrop to desktop intake folder

## Permission strategy
Start with system media picker.
Request broader photo library access only if a later feature strictly requires it.

## Important constraints
- background behavior is OS-managed
- force-quit can interrupt expected upload continuity
- local network features require correct permission strings and discovery setup
