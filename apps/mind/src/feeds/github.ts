import { z } from 'zod'
import { isoDate, item, type Feed } from './types.ts'

const Search = z.object({
  items: z.array(z.object({ full_name: z.string(), description: z.string().nullable(), html_url: z.string(), stargazers_count: z.number() })),
})

const TAKE = 8
const WEEK_MS = 7 * 86_400_000

/** What developers are building: GitHub has no trending API, so this is the young repos (a week old at most) with the most stars. */
export const github: Feed = async (get, nowMs) => {
  const q = encodeURIComponent(`created:>${isoDate(nowMs - WEEK_MS)}`)
  const parsed = Search.safeParse(await get(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${TAKE}`))
  if (!parsed.success) return []
  return parsed.data.items.map((r) => item('github', `gh:${r.full_name}`, r.full_name, r.description || `${r.stargazers_count} stars`, r.html_url))
}
