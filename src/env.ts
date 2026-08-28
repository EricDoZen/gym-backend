import { randomBytes } from 'node:crypto'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(4000),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().default('elite_gym'),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('8h'),
  MEMBER_JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z
    .string()
    .default(
      'http://localhost:5173,http://127.0.0.1:5173,https://gym-frontend-three-psi.vercel.app',
    ),
  SEED_OWNER_PASSWORD: z.string().optional(),
  SEED_RECEPTION_PASSWORD: z.string().optional(),
})

const parsedEnv = envSchema.parse(process.env)
if (
  parsedEnv.NODE_ENV === 'production' &&
  (!parsedEnv.JWT_SECRET ||
    parsedEnv.JWT_SECRET.length < 32 ||
    parsedEnv.JWT_SECRET.toLowerCase().includes('replace-with') ||
    parsedEnv.JWT_SECRET.toLowerCase().includes('change-me'))
) {
  throw new Error('JWT_SECRET must be a unique production secret of at least 32 characters')
}

export const env = {
  ...parsedEnv,
  JWT_SECRET: parsedEnv.JWT_SECRET ?? randomBytes(32).toString('hex'),
}

export function corsOrigins() {
  return env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
}
