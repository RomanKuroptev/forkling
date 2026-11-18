import { addDays, localDate } from '@forkling/sim'
import { esc } from './md.ts'

/**
 * The diary page `/journal/` in the look of the Merge 95 diary mockup (docs/spec/v4/look/site/diary.png): one card for each entry with a face,
 * the day, the entry's title and its first lines, and a side panel with the last two weeks and three counts. Only what the world repo has:
 * there is no picture slot because entries carry no picture.
 */
export interface DiaryInput {
  journal: readonly { date: string; text: string }[]
  tz: string
  nowMs: number
  /** Things Merge made: works shown and project sessions. */
  made: number
  /** Works that were put away. */
  retired: number
  /** The line for an entry still being written, or empty. */
  writing?: { date: string } | null
}

const MAX_PREVIEW = 140
export const titleOf = (md: string) => /^# (.+)$/m.exec(md)?.[1] ?? ''

/** The first lines of an entry without its heading, its date line or markup, cut to 140 characters. */
export function previewOf(md: string): string {
  const text = md
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && !/^\*\d{4}-\d{2}-\d{2}\*$/.test(l.trim()))
    .join(' ')
    .replace(/[*_`>]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW - 1).trimEnd()}…` : text
}

const dayWords = (date: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`)).replace(',', '')

export function diaryBody(i: DiaryInput): string {
  const have = new Set(i.journal.map((j) => j.date))
  const today = localDate(i.tz, i.nowMs)
  const days = Array.from({ length: 14 }, (_, n) => addDays(today, n - 13))
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long' }).format(new Date(`${today}T12:00:00Z`))
  const calendar = days
    .map((d) => `<${have.has(d) ? `a href="${esc(d)}.html"` : 'span'} class="cal-day${d === today ? ' today' : ''}${have.has(d) ? ' has' : ''}">${Number(d.slice(8))}</${have.has(d) ? 'a' : 'span'}>`)
    .join('')
  const first = i.journal.at(-1)?.date
  const alive = first ? Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1) : 0
  const cards = i.journal.map((j) => {
    const title = titleOf(j.text)
    const preview = previewOf(j.text)
    return `<li><a class="dcard" href="${esc(j.date)}.html"><span class="dface" aria-hidden="true"></span><span class="dtext"><time class="dday" datetime="${esc(j.date)}">${esc(dayWords(j.date))}</time>${title ? `<strong class="dtitle">${esc(title)}</strong>` : ''}${preview ? `<span class="dpre">${esc(preview)}</span>` : ''}</span></a></li>`
  })
  const side = [
    `<div class="dside-box"><h2>${esc(month)}</h2><div class="cal">${calendar}</div></div>`,
    `<div class="dside-box counts"><p>${alive} ${alive === 1 ? 'day' : 'days'} alive</p><p>${i.made} ${i.made === 1 ? 'thing' : 'things'} made</p><p>${i.retired} ${i.retired === 1 ? 'phase' : 'phases'} retired</p></div>`,
  ].join('')
  return [
    '<h1>Journal</h1>',
    i.writing ? `<p class="quiet">The entry for ${esc(i.writing.date)} is still being written.</p>` : '',
    '<div class="diary">',
    cards.length > 0 ? `<ul class="dlist">${cards.join('')}</ul>` : `<p class="quiet dlist">Nothing yet. It writes a diary entry each night, while it sleeps.</p>`,
    `<aside class="dside" aria-label="The last two weeks">${side}<p class="quiet">${esc('One entry a night, written while it sleeps.')}</p></aside>`,
    '</div>',
  ].join('\n')
}
