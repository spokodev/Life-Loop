import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const requiredFiles = [
  'README.md',
  'docs/01-product-vision.md',
  'docs/02-system-context.md',
  'docs/03-domain-model.md',
  'docs/09-security-model.md',
  'docs/10-qa-and-review-strategy.md',
  'docs/11-mcp-strategy.md',
  'docs/12-vps-infrastructure-baseline.md',
  'docs/16-decision-baseline-phase-1.md',
  'docs/17-master-codex-execution-prompt.md',
  'docs/18-product-backlog-v1.md',
  'docs/19-implementation-readiness-check.md',
  'docs/20-final-audit-and-gap-closure.md',
  'docs/24-production-deployment-runbook.md',
  'docs/design/01-design-system-foundation.md',
  'docs/design/06-motion-system.md',
  'docs/design/09-transition-states-and-feedback.md',
  'docs/design/10-ui-implementation-guide.md',
  'docs/qa/01-architecture-review-checklist.md',
  'docs/qa/02-code-review-checklist.md',
  'docs/qa/03-release-readiness-checklist.md',
  'docs/qa/04-ui-and-transition-checklist.md',
]

const markdownFiles = await collectMarkdownFiles(path.join(repoRoot, 'docs'))
markdownFiles.push(path.join(repoRoot, 'README.md'))

for (const requiredFile of requiredFiles) {
  await access(path.join(repoRoot, requiredFile))
}

for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8')
  const matches = source.matchAll(/\[[^\]]+\]\((?!https?:\/\/|mailto:|#)([^)]+)\)/g)

  for (const match of matches) {
    const target = match[1]

    if (!target) {
      continue
    }

    const resolved = path.resolve(path.dirname(file), target)
    await access(resolved)
  }
}

console.log(`Documentation baseline present. Checked ${markdownFiles.length} markdown files.`)

async function collectMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(absolutePath)))
      continue
    }

    if (entry.isFile() && absolutePath.endsWith('.md')) {
      files.push(absolutePath)
    }
  }

  return files
}
