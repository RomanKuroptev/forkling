import { z } from 'zod'
import { item, type Feed } from './types.ts'

const Pages = z.array(z.object({ content_urls: z.object({ desktop: z.object({ page: z.string() }) }).optional() })).optional()
const Events = z.object({ events: z.array(z.object({ text: z.string(), year: z.number().optional(), pages: Pages })) })
const Random = z.object({ pageid: z.number(), title: z.string(), extract: z.string(), content_urls: z.object({ desktop: z.object({ page: z.string() }) }) })

const TAKE = 4
const DAY_MS = 86_400_000

/** History and pure weirdness, part one: a few things that happened on this day. Which few moves with the date. */
export const onThisDay: Feed = async (get, nowMs) => {
  const d = new Date(nowMs)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const parsed = Events.safeParse(await get(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`))
  if (!parsed.success || parsed.data.events.length === 0) return []
  const { events } = parsed.data
  const start = Math.floor(nowMs / DAY_MS) % events.length
  return Array.from({ length: Math.min(TAKE, events.length) }, (_, n) => {
    const index = (start + n) % events.length
    const e = events[index]!
    return item('wikipedia-history', `otd:${mm}-${dd}:${index}`, `${e.year ?? ''}: ${e.text}`.replace(/^: /, ''), e.text, e.pages?.[0]?.content_urls?.desktop.page ?? 'https://en.wikipedia.org/')
  })
}

/** History and pure weirdness, part two: one random article. */
export const randomPage: Feed = async (get) => {
  const r = Random.safeParse(await get('https://en.wikipedia.org/api/rest_v1/page/random/summary'))
  return r.success ? [{ ...item('wikipedia-random', `rand:${r.data.pageid}`, r.data.title, r.data.extract, r.data.content_urls.desktop.page) }] : []
}
