import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { ZodError } from 'zod'
import { fail } from '../lib/response.js'

import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function httpError(status: number, message: string, code?: string): never {
  throw new HTTPException(status as ContentfulStatusCode, { message })
}

export function registerErrorHandler(app: {
  onError: (
    handler: (error: Error, c: Context) => Response | Promise<Response>,
  ) => void
}) {
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json(fail(error.message), error.status)
    }
    if (error instanceof ZodError) {
      return c.json(fail(error.errors[0]?.message ?? 'Validation failed'), 400)
    }
    if (error.message === 'DATABASE_URL is not configured') {
      return c.json(fail('Database is not configured'), 503)
    }
    console.error(error)
    return c.json(fail('Internal server error'), 500)
  })
}
