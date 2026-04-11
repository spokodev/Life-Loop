import { createHash, randomBytes } from 'node:crypto'

export function generateJobLeaseToken() {
  return randomBytes(32).toString('base64url')
}

export function hashJobLeaseToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyJobLeaseToken(token: string, expectedHash: string | null | undefined) {
  if (!expectedHash) {
    return false
  }

  return hashJobLeaseToken(token) === expectedHash
}
