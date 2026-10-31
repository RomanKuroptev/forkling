import { describe, expect, it } from 'vitest'
import { hasCredentials } from '../src/credentials.ts'

const federation = {
  ANTHROPIC_FEDERATION_RULE_ID: 'fdrl_1',
  ANTHROPIC_ORGANIZATION_ID: '00000000-0000-0000-0000-000000000000',
  ANTHROPIC_SERVICE_ACCOUNT_ID: 'svac_1',
  ANTHROPIC_IDENTITY_TOKEN_FILE: '/tmp/gha-jwt',
}

describe('hasCredentials', () => {
  it('is false with nothing set', () => {
    expect(hasCredentials({})).toBe(false)
  })

  it('accepts an API key or an auth token', () => {
    expect(hasCredentials({ ANTHROPIC_API_KEY: 'sk-ant-x' })).toBe(true)
    expect(hasCredentials({ ANTHROPIC_AUTH_TOKEN: 'tok' })).toBe(true)
  })

  it('ignores empty values, as an unset repository secret leaves behind', () => {
    expect(hasCredentials({ ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' })).toBe(false)
  })

  it('accepts a complete workload identity setup, from a token file or a token', () => {
    expect(hasCredentials(federation)).toBe(true)
    const { ANTHROPIC_IDENTITY_TOKEN_FILE: _, ...rest } = federation
    expect(hasCredentials({ ...rest, ANTHROPIC_IDENTITY_TOKEN: 'jwt' })).toBe(true)
  })

  it('rejects a partial one', () => {
    for (const key of Object.keys(federation)) {
      const { [key]: _, ...partial } = federation as Record<string, string>
      expect(hasCredentials(partial), `without ${key}`).toBe(false)
    }
  })
})
