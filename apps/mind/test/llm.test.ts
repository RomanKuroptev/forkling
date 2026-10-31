import { describe, expect, it } from 'vitest'
import { userContent } from '../src/llm.ts'

describe('userContent', () => {
  it('is the plain text when there is no picture', () => {
    expect(userContent('hello')).toBe('hello')
    expect(userContent('hello', [])).toBe('hello')
  })

  it('puts the pictures first and the text last', () => {
    const content = userContent('what is this?', [{ mediaType: 'image/jpeg', base64: 'AAAA' }])
    expect(content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      { type: 'text', text: 'what is this?' },
    ])
  })
})
