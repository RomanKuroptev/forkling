import { z } from 'zod'
import { isoDate, item, type Feed, type FeedItem } from './types.ts'

const SYNODIC_DAYS = 29.530588853
/** A new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86_400_000

const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'] as const

/** The moon's phase from the mean synodic month: good to within about half a day, which is all a cat needs. */
export function moonPhase(ms: number): { name: (typeof PHASES)[number]; illuminated: number } {
  const age = (((ms - NEW_MOON_EPOCH) / DAY_MS) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS
  const fraction = age / SYNODIC_DAYS
  const name = PHASES[Math.floor(fraction * 8 + 0.5) % 8]!
  return { name, illuminated: Math.round(((1 - Math.cos(2 * Math.PI * fraction)) / 2) * 100) }
}

const Apod = z.object({ title: z.string(), explanation: z.string(), url: z.string(), date: z.string() })

/** The real sky: tonight's moon, worked out here, and NASA's picture of the day when it answers. */
export const sky: Feed = async (get, nowMs) => {
  const moon = moonPhase(nowMs)
  const items: FeedItem[] = [item('sky', `sky:moon:${isoDate(nowMs)}`, `Tonight's moon: ${moon.name}`, `${moon.illuminated}% lit`, 'https://science.nasa.gov/moon/moon-phases/')]
  try {
    const apod = Apod.parse(await get('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY'))
    items.push(item('sky', `sky:apod:${apod.date}`, apod.title, apod.explanation, apod.url))
  } catch {
    // The moon is enough. NASA's key is a shared demo one and runs out.
  }
  return items
}
