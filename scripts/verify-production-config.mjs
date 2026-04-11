import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const productionComposePath = path.join(repoRoot, 'infra/docker/docker-compose.prod.template.yml')
const productionEnvExamplePath = path.join(repoRoot, 'infra/docker/.env.production.example')
const productionRunbookPath = path.join(repoRoot, 'docs/24-production-deployment-runbook.md')

const composeConfig = runDockerComposeConfig()
const productionCompose = await readFile(productionComposePath, 'utf8')
const productionEnvExample = await readFile(productionEnvExamplePath, 'utf8')
const productionRunbook = await readFile(productionRunbookPath, 'utf8')

assertIncludes(
  composeConfig,
  '/opt/life-loop/data/postgres',
  'Postgres volume must use /opt/life-loop.',
)
assertIncludes(
  composeConfig,
  '/opt/life-loop/data/staging',
  'Staging volume must use /opt/life-loop.',
)
assertIncludes(composeConfig, 'traefik:', 'Production compose must attach to shared Traefik.')
assertIncludes(
  productionCompose,
  'restart: unless-stopped',
  'Services must restart unless stopped.',
)
assertIncludes(productionCompose, 'healthcheck:', 'Production services must define healthchecks.')
assertIncludes(productionRunbook, 'pg_dump', 'Runbook must document logical backup creation.')
assertIncludes(productionRunbook, 'pnpm db:migrate', 'Runbook must document migration execution.')

for (const requiredKey of [
  'DATABASE_URL=',
  'CORS_ORIGIN=',
  'HOSTED_STAGING_ROOT=',
  'POSTGRES_DATA_ROOT=',
  'NEXT_PUBLIC_APP_URL=',
  'NEXT_PUBLIC_API_URL=',
  'CLERK_SECRET_KEY=',
  'STRIPE_WEBHOOK_SECRET=',
]) {
  assertIncludes(
    productionEnvExample,
    requiredKey,
    `Missing ${requiredKey} in production env example.`,
  )
}

for (const [label, source] of [
  ['production compose', productionCompose],
  ['production env example', productionEnvExample],
  ['production runbook', productionRunbook],
]) {
  assertForbidden(source, /\/home\/deploy/i, `${label} must not use /home/deploy production paths.`)
  assertForbidden(source, /\bkubernetes\b|\bk8s\b/i, `${label} must not introduce Kubernetes.`)
  assertForbidden(
    source,
    /\bnginx\b|\bcaddy\b/i,
    `${label} must not introduce extra reverse proxies.`,
  )
}

console.log('Production config baseline validated.')

function runDockerComposeConfig() {
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'infra/docker/docker-compose.prod.template.yml', 'config'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  )

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'docker compose config failed.')
  }

  return result.stdout
}

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(message)
  }
}

function assertForbidden(source, forbiddenPattern, message) {
  if (forbiddenPattern.test(source)) {
    throw new Error(message)
  }
}
