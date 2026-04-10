import { createHash, randomBytes } from 'node:crypto'

export function generateDeviceSecret() {
  return randomBytes(32).toString('base64url')
}

export function hashDeviceSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

export function composeDeviceCredential(credentialId: string, secret: string) {
  return `${credentialId}.${secret}`
}

export function parseDeviceCredential(token: string) {
  const trimmed = token.trim()
  const separatorIndex = trimmed.indexOf('.')

  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new Error('Device credential must include a credential id and secret.')
  }

  return {
    credentialId: trimmed.slice(0, separatorIndex),
    secret: trimmed.slice(separatorIndex + 1),
  }
}
