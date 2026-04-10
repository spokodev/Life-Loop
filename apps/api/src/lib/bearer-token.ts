export function parseBearerToken(authorizationHeader: string | undefined | null) {
  const authorization = authorizationHeader ?? ''

  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}
