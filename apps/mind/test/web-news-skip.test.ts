import { describe, expect, it } from 'vitest'
import { isSkippedNews, NEWS_SKIP_WORDS, newsSkipWord } from '../src/web/news-skip.ts'

describe('the news skip rule (Roman, 20 November): deaths, violence, war and politics', () => {
  it('catches whole words in any case', () => {
    for (const text of ['A war in the north', 'Three people killed in a flood', 'The election is on Sunday', 'WAR!', 'killed.', '"Election"', 'Death of Fiona the hippo', 'Recent deaths: A, B', 'A drone  strike hits a port', 'The Prime Minister resigns'])
      expect(isSkippedNews(text), text).toBe(true)
  })

  it('does not catch a word inside another word, or Star Wars', () => {
    for (const text of ['Star Wars: a new trailer', 'The award goes to a moth', 'A warm day', 'Software and hardware', 'The Warsaw zoo', 'Skillet recipes', 'Electionary is not a word', 'Deathloop speedrun', 'The Presidents Cup sailing race', 'A new comet'])
      expect(isSkippedNews(text), text).toBe(false)
  })

  it('names the word it caught', () => {
    expect(newsSkipWord('They were killed')).toBe('killed')
    expect(newsSkipWord('A drone   strike')).toBe('drone strike')
    expect(newsSkipWord('Moths at dusk')).toBeNull()
  })

  it('is a short rail in code, words only, each once and in lower case', () => {
    expect(new Set(NEWS_SKIP_WORDS).size).toBe(NEWS_SKIP_WORDS.length)
    for (const w of NEWS_SKIP_WORDS) expect(w).toMatch(/^[a-z]+( [a-z]+)?$/)
    expect(NEWS_SKIP_WORDS).not.toContain('wars')
  })
})
