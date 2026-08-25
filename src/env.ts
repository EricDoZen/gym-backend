import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
})

export const env = envSchema.parse(process.env)
