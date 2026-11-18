import type { MergeAbout } from './self.ts'
import type { SiteProject } from './projects.ts'
import type { SiteWork } from './workshop.ts'

/**
 * `today.json` (spec v4 9, step 7 slice A): what the front page leads with, built from files the world repo already has. Nothing here
 * comes from the mind: it only reads what Merge has made. Every card has a picture; text alone is never a card.
 */
export interface TodayCard {
  kind: 'project' | 'work'
  title: string
  caption: string
  /** Path from the site root to the picture. */
  image: string
  /** Path from the site root to the page the card opens. */
  href: string
  at: string
  /** The day (in Merge's time zone) of a card that is not from today; absent for today's. */
  day?: string
}

export interface TodayProject {
  id: string
  name: string
  aim: string
  /** The newest screenshot, or null while there is none. */
  image: string | null
  /** The newest session's caption, or the aim while there is no session. */
  caption: string
  sessions: number
  href: string
  at: string
}

export interface Today {
  /** One line on who Merge is: the first sentence of `self/about.md`, up to 120 characters; empty when there is none. */
  who: string
  /** Up to 3 cards, today's first (newest first), then the newest from earlier days to make up the number. */
  cards: TodayCard[]
  /** The project that is `building` and was worked on most recently, or null. */
  project: TodayProject | null
  updatedAt: string
}

export const MAX_CARDS = 3
export const WHO_MAX = 120

const dayOf = (tz: string, iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

interface Candidate extends TodayCard {
  /** 0 for a project session's screenshot, 1 for a work's thumbnail: the order of preference. */
  rank: number
}

/** Every thing that can be a card: a project session with a screenshot on disk, and a shown work with a thumbnail. */
export function cardCandidates(projects: readonly SiteProject[], works: readonly SiteWork[]): Candidate[] {
  const out: Candidate[] = []
  for (const { project, shots } of projects) {
    project.sessions.forEach((s, n) => {
      const shot = shots[n]
      if (!shot) return
      out.push({ kind: 'project', rank: 0, title: project.name, caption: cut(s.caption, 140), image: `projects/${project.id}/${shot}`, href: `projects/${project.id}/`, at: s.at })
    })
  }
  for (const { meta, hasThumb } of works) {
    if (!hasThumb || meta.status === 'scrap') continue
    out.push({ kind: 'work', rank: 1, title: meta.title, caption: cut(meta.caption ?? meta.about, 140), image: `works/${meta.id}/thumb.png`, href: `works/${meta.id}/index.html`, at: meta.made })
  }
  return out
}

/**
 * The cards: up to 3 from today (in Merge's time zone), the ones of the best kind first (a project's screenshot, then a work), shown newest
 * first; with fewer than 3, the newest from earlier days make up the number, each marked with its day.
 */
export function pickCards(candidates: readonly Candidate[], nowMs: number, tz: string): TodayCard[] {
  const today = dayOf(tz, new Date(nowMs).toISOString())
  const strip = ({ rank: _rank, ...card }: Candidate): TodayCard => card
  const mine = candidates.filter((c) => dayOf(tz, c.at) === today)
  const chosen = [...mine].sort((a, b) => a.rank - b.rank || b.at.localeCompare(a.at)).slice(0, MAX_CARDS).sort((a, b) => b.at.localeCompare(a.at)).map(strip)
  const earlier = candidates
    .filter((c) => dayOf(tz, c.at) !== today)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_CARDS - chosen.length)
    .map((c) => ({ ...strip(c), day: dayOf(tz, c.at) }))
  return [...chosen, ...earlier]
}

/** The first sentence of `about.md`, with headings and markup left out, cut to 120 characters. */
export function whoLine(about: MergeAbout): string {
  const text = (about.current ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .join(' ')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const first = /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text
  return cut(first, WHO_MAX)
}

/** The project being built that was worked on most recently, with its newest screenshot and caption. */
export function currentProject(projects: readonly SiteProject[]): TodayProject | null {
  const stamp = ({ project }: SiteProject) => project.sessions.at(-1)?.at ?? project.started
  const building = projects.filter((p) => p.project.status === 'building').sort((a, b) => stamp(b).localeCompare(stamp(a)))[0]
  if (!building) return null
  const { project, shots } = building
  const last = project.sessions.at(-1)
  const newestShot = [...shots].reverse().find((s): s is string => Boolean(s)) ?? null
  return { id: project.id, name: project.name, aim: project.aim, image: newestShot ? `projects/${project.id}/${newestShot}` : null, caption: last ? cut(last.caption, 140) : project.aim, sessions: project.sessions.length, href: `projects/${project.id}/`, at: stamp(building) }
}

export function buildToday(i: { projects: readonly SiteProject[]; works: readonly SiteWork[]; about: MergeAbout; nowMs: number; tz: string }): Today {
  return { who: whoLine(i.about), cards: pickCards(cardCandidates(i.projects, i.works), i.nowMs, i.tz), project: currentProject(i.projects), updatedAt: new Date(i.nowMs).toISOString() }
}
