import { describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { openApiDoc } from '../src/openapi.js'

describe('API docs', () => {
  it('redirects / to Swagger UI', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/docs')
  })

  it('serves OpenAPI JSON at /doc', async () => {
    const res = await app.request('/doc')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openapi).toBe(openApiDoc.openapi)
    expect(body.paths['/api/auth/login']).toBeDefined()
  })

  it('serves Swagger UI at /docs', async () => {
    const res = await app.request('/docs')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('swagger')
  })
})
