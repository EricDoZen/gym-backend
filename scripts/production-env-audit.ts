import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '../src/env.js'
import {
  PRODUCTION_DATABASE_NAME,
  databaseNameFromSettings,
} from '../src/lib/database-safety.js'

function strongSecret(value?: string, minimum = 32) {
  if (!value || value.length < minimum) return false
  const lower = value.toLowerCase()
  return !['change-me', 'replace-with', 'password', 'example'].some((word) => lower.includes(word))
}

function main() {
  const failures: string[] = []
  const warnings: string[] = []
  const database = databaseNameFromSettings(env.DATABASE_URL, env.DB_NAME)

  if (database !== PRODUCTION_DATABASE_NAME) {
    failures.push(`database target must be ${PRODUCTION_DATABASE_NAME} for a production environment audit`)
  }
  const enforceDeploymentSecret =
    env.NODE_ENV === 'production' || process.env.AUDIT_PRODUCTION_DEPLOY_ENV === '1'
  if (!strongSecret(env.JWT_SECRET, 32)) {
    const message = 'JWT_SECRET is missing, weak, placeholder-like, or shorter than 32 characters'
    if (enforceDeploymentSecret) failures.push(message)
    else warnings.push(`${message}; local development value is not treated as deployed production state`)
  }
  if (env.CORS_ORIGIN.split(',').map((value) => value.trim()).includes('*')) {
    failures.push('CORS_ORIGIN must not contain wildcard * in production')
  }
  if (!env.CORS_ORIGIN.includes('https://gym-frontend-three-psi.vercel.app')) {
    failures.push('production frontend origin is missing from CORS_ORIGIN')
  }

  const backupKeyEnv = process.env.BACKUP_KEY_BASE64?.trim()
  const backupKeyPath = join(process.cwd(), '.backup-key')
  const backupKeyText = backupKeyEnv || (existsSync(backupKeyPath) ? readFileSync(backupKeyPath, 'utf8').trim() : '')
  if (!backupKeyText) {
    failures.push('backup encryption key is not configured')
  } else {
    try {
      if (Buffer.from(backupKeyText, 'base64').length !== 32) {
        failures.push('backup encryption key must decode to exactly 32 bytes')
      }
    } catch {
      failures.push('backup encryption key is invalid base64')
    }
  }

  if (env.SEED_OWNER_PASSWORD || env.SEED_RECEPTION_PASSWORD) {
    warnings.push('seed passwords are configured; keep them outside Git and remove them after bootstrap when operationally possible')
  }
  if (!process.env.BACKUP_OFFSITE_DIR && !process.env.CI) {
    warnings.push('BACKUP_OFFSITE_DIR is not configured locally; scheduled cloud backup can provide the second copy instead')
  }

  if (warnings.length) {
    console.log(`Production environment audit warnings (${warnings.length}):`)
    for (const warning of warnings) console.log(`- ${warning}`)
  }
  if (failures.length) {
    console.error(`Production environment audit FAIL (${failures.length})`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log('Production environment audit PASS')
}

main()
