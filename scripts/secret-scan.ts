import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'

const forbiddenTracked = [
  /(^|\/)\.env$/i,
  /(^|\/)\.env\.(local|production|staging|test)$/i,
  /(^|\/)\.backup-key$/i,
  /(^|\/)backups\//i,
]

const textExtensions = new Set([
  '.ts', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.sql', '.txt', '.toml', '.ini', '.example',
])

const highRiskPatterns = [
  { name: 'private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/ },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'JWT literal', regex: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/ },
  { name: 'TiDB/MySQL credential URL', regex: /mysql:\/\/[^\s:@]+:[^\s@]+@[^\s/]+\/[A-Za-z0-9_]+/ },
]

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

function main() {
  const files = trackedFiles()
  const failures: string[] = []

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/')
    if (forbiddenTracked.some((pattern) => pattern.test(normalized))) {
      failures.push(`${file}: forbidden secret/backup path is tracked`)
      continue
    }

    if (normalized.endsWith('.env.example')) continue
    const ext = extname(file).toLowerCase()
    if (!textExtensions.has(ext) && !normalized.endsWith('Dockerfile')) continue

    try {
      if (statSync(file).size > 1_000_000) continue
      const text = readFileSync(file, 'utf8')
      for (const pattern of highRiskPatterns) {
        if (pattern.regex.test(text)) {
          failures.push(`${file}: possible ${pattern.name}`)
        }
      }
    } catch {
      // Git can contain entries that disappear during a concurrent checkout; CI will catch the diff separately.
    }
  }

  if (failures.length) {
    console.error(`Secret scan FAIL (${failures.length})`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(`Secret scan PASS: ${files.length} tracked files checked; no high-risk secret material detected`)
}

main()
