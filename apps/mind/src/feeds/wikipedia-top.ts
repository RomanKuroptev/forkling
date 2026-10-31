import { z } from 'zod'
import { item, type Feed } from './types.ts'

const Top = z.object({ items: z.array(z.object({ articles: z.array(z.object({ article: z.string(), views: z.number() })) })).min(1) })

const TAKE = 8
const DAY_MS = 86_400_000

/** What the world looked up yesterday: the most-read English Wikipedia articles, without the front page or the project's own pages. */
export const wikipediaTop: Feed = async (get, nowMs) => {
  const [y, m, d] = new Date(nowMs - DAY_MS).toISOString().slice(0, 10).split('-')
  const parsed = Top.safeParse(await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${d}`))
  if (!parsed.success) return []
  return parsed.data.items[0]!.articles
    .filter((a) => a.article !== 'Main_Page' && !a.article.includes(':'))
    .slice(0, TAKE)
    .map((a) => item('wikipedia-top', `wikitop:${a.article}`, a.article.replaceAll('_', ' '), `${a.views.toLocaleString('en-US')} views yesterday`, `https://en.wikipedia.org/wiki/${a.article}`))
}
