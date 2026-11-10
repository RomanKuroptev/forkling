import { describe, expect, it } from 'vitest'
import { claimsHuman, wordCount } from '../src/honesty.ts'

describe('claimsHuman', () => {
  it('catches a claim to a human life', () => {
    for (const text of ["I'm a human, honestly.", 'I am a person who likes lighthouses.', 'My mother used to say that.', 'When I was a kid I read this.', 'Back when I lived in a flat.']) {
      expect(claimsHuman(text), text).toBe(true)
    }
  })

  it('lets an AI with a cat body talk about itself', () => {
    for (const text of ['I am an AI with a cat body and opinions.', 'I am not a person, and I am not a cat.', 'A human wrote this page, and I read it.', 'My paws do not exist, which is fine.']) {
      expect(claimsHuman(text), text).toBe(false)
    }
  })
})

describe('wordCount', () => {
  it('counts words', () => {
    expect(wordCount('one two  three\nfour')).toBe(4)
    expect(wordCount('')).toBe(0)
  })
})
