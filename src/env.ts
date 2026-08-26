import 'dotenv/config'
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
  JWT_SECRET: z.string().default('dev-only-change-me-in-production'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z
    .string()
    .default(
      'http://localhost:5173,https://gym-frontend-three-psi.vercel.app',
    ),
  SEED_OWNER_PASSWORD: z.string().default('owner123'),
  SEED_RECEPTION_PASSWORD: z.string().default('reception123'),
})

export const env = envSchema.parse(process.env)

export function corsOrigins() {
  return env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
}
