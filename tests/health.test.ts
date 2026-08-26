import { describe, expect, it } from 'vitest'
import app from '../src/index.js'

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('ok')
    expect(['connected', 'not_configured']).toContain(body.data.database)
    expect(body.message).toBe('success')
  })
})
