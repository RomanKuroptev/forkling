import { z } from 'zod'
import { item, type Feed } from './types.ts'

/** The only communities it ever reads: fun posts. Nothing else on lemmy.world is asked for. */
export const LEMMY_COMMUNITIES = ['pics', 'photography', 'science', 'space', 'todayilearned', 'mildlyinteresting', 'diy', 'retrogaming', 'cat'] as const

const Posts = z.object({ posts: z.array(z.object({ post: z.object({ id: z.number(), name: z.string(), ap_id: z.string() }) })) })

const PER_COMMUNITY = 2

/** Fun posts from allowlisted communities on lemmy.world. A community that fails is skipped. */
export const lemmy: Feed = async (get) => {
  const lists = await Promise.all(
    LEMMY_COMMUNITIES.map(async (name) => {
      try {
        const parsed = Posts.parse(await get(`https://lemmy.world/api/v3/post/list?community_name=${name}&sort=Hot&limit=${PER_COMMUNITY}`))
        return parsed.posts.slice(0, PER_COMMUNITY).map(({ post }) => item('lemmy', `lemmy:${post.id}`, post.name, `from c/${name}`, post.ap_id))
      } catch {
        return []
      }
    }),
  )
  return lists.flat()
}
