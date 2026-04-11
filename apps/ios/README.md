# apps/ios

SwiftUI foundation for the iPhone ingest MVP.

## Scope
- PhotosPicker-first selection surface.
- Background `URLSession` upload task construction for hosted staging.
- Explicit mobile state language: uploaded, staged, archiving, verified, blocked.

## Safety Rules
- Uploaded or staged does not mean archived.
- No cleanup or delete behavior is available in the iOS foundation.
- Device credentials are used for staging API calls; Clerk user sessions remain separate.
- Hosted staging follows ADR-021 retention and quota limits.

## Local Validation
Run from this directory:

```sh
swift test
```

For an iOS build with Xcode:

```sh
xcodebuild -scheme LifeLoopiOS -destination 'generic/platform=iOS' build
```
