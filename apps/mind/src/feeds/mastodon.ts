import { z } from 'zod'
import { item, type Feed } from './types.ts'

const Tags = z.array(z.object({ name: z.string(), url: z.string(), history: z.array(z.object({ uses: z.string() })).default([]) }))

/** Hashtags with these in them are about politics or the news cycle, which it does not read. */
const KEEP_OUT = [
  'politic', 'election', 'vote', 'voting', 'ballot', 'trump', 'biden', 'harris', 'putin', 'maga', 'gop', 'democrat', 'republican', 'congress', 'senate', 'parliament', 'brexit',
  'war', 'gaza', 'ukraine', 'israel', 'palestin', 'nazi', 'fascis', 'genocide', 'terror', 'shooting', 'news', 'breaking', 'covid',
]

const TAKE = 8

/** A pulse of what people talk about: trending hashtags on mastodon.social, with politics and news filtered out. Hashtags only. */
export const mastodon: Feed = async (get) => {
  const tags = Tags.safeParse(await get('https://mastodon.social/api/v1/trends/tags'))
  if (!tags.success) return []
  return tags.data
    .filter((t) => !KEEP_OUT.some((word) => t.name.toLowerCase().includes(word)))
    .slice(0, TAKE)
    .map((t) => {
      const uses = t.history.reduce((sum, h) => sum + (Number(h.uses) || 0), 0)
      return item('mastodon', `masto:${t.name.toLowerCase()}`, `#${t.name}`, `${uses} posts in recent days`, t.url)
    })
}
