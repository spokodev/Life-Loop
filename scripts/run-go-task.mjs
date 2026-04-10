import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

const [task = 'version'] = process.argv.slice(2)

const commands = {
  build: ['build', './cmd/life-loop-agent'],
  fmt: ['fmt', './...'],
  test: ['test', './...'],
  typecheck: ['test', '-run', '^$', './...'],
  version: ['version'],
}

const command = commands[task]

if (!command) {
  console.error(`Unknown Go task: ${task}`)
  process.exit(1)
}

const goBinary = resolveGoBinary()
const probe = spawnSync(goBinary, ['version'], { stdio: 'ignore' })

if (probe.status !== 0) {
  console.warn(`Skipping Go task "${task}" because Go is not installed in this environment.`)
  process.exit(0)
}

const result = spawnSync(goBinary, command, { stdio: 'inherit' })
process.exit(result.status ?? 1)

function resolveGoBinary() {
  const envGoBinary = process.env.GO_BINARY?.trim()

  if (envGoBinary) {
    return envGoBinary
  }

  for (const candidate of ['/usr/local/go/bin/go', '/opt/homebrew/bin/go']) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return 'go'
}
