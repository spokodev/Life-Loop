# 04. User Onboarding and Device Enrollment

## Registration model
At registration, the user chooses a storage topology:
1. Local-first
2. Hybrid
3. Bring-your-own storage

## Enrollment sequence
1. Create account
2. Create first library
3. Choose storage topology
4. Enroll first device
5. Register first storage target
6. Run first ingest flow
7. Confirm archive health

## Device enrollment
### iPhone
- native app recommended
- browser upload optional
- local network mode optional
- permissions start with system media picker

### Desktop
- install local agent
- link to account via one-time enrollment token
- redeem the token into a device-scoped credential
- use device-scoped auth for subsequent control-plane heartbeat calls
- detect local/external storage targets
- assign roles to targets

## UX principle
The onboarding must ask the user what they want to protect and where originals should live, not just collect credentials.
