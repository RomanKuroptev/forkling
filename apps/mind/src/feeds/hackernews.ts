import { z } from 'zod'
import { item, type Feed } from './types.ts'

const Ids = z.array(z.number())
const Story = z.object({ id: z.number(), title: z.string(), url: z.string().optional(), score: z.number().optional() }).nullable()

const TAKE = 8

/** Tech and maker culture: the top stories on Hacker News. */
export const hackerNews: Feed = async (get) => {
  const ids = Ids.parse(await get('https://hacker-news.firebaseio.com/v0/topstories.json')).slice(0, TAKE)
  const stories = await Promise.all(
    ids.map(async (id) => {
      try {
        return Story.parse(await get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`))
      } catch {
        return null
      }
    }),
  )
  return stories.flatMap((s) => (s ? [item('hackernews', `hn:${s.id}`, s.title, `${s.score ?? 0} points`, s.url ?? `https://news.ycombinator.com/item?id=${s.id}`)] : []))
}
