import { spawnSync } from 'node:child_process'
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

const probe = spawnSync('go', ['version'], { stdio: 'ignore' })

if (probe.status !== 0) {
  console.warn(`Skipping Go task "${task}" because Go is not installed in this environment.`)
  process.exit(0)
}

const result = spawnSync('go', command, { stdio: 'inherit' })
process.exit(result.status ?? 1)
