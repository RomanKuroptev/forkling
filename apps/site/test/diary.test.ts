import { describe, expect, it } from 'vitest'
import { diaryBody, previewOf } from '../src/diary.ts'

/** Step 7C: the diary page in the look of the diary mockup, from the entries in the world repo only. */

const NOW = Date.parse('2026-11-18T10:00:00Z')
const entry = (date: string, title: string, body: string) => ({ date, text: `# ${title}\n\n*${date}*\n\n${body}\n` })
const base = { tz: 'Europe/Stockholm', nowMs: NOW, made: 4, retired: 1 }

describe('previewOf', () => {
  it('leaves out the heading, the date line and markup, and cuts to 140 characters', () => {
    expect(previewOf('# Title\n\n*2026-11-17*\n\nI **made** a [clock](https://x.y) today.\n')).toBe('I made a clock today.')
    expect(previewOf(`# T\n\n${'word '.repeat(80)}`).length).toBeLessThanOrEqual(140)
    expect(previewOf('# only a title\n')).toBe('')
  })
  it('ends the preview at a sentence end, not in the middle of a word (issue #378, the R2 entry of 2026-11-19)', () => {
    const md = "# Three Foundings and a Hillside\n\n*2026-11-19*\n\nThe Hillside Room took three tries. The first two failed by a handful of words, and the third worked once I wrote it shorter.\n\nI sketched the hillside again and put it in the Five Lamps room.\n"
    expect(previewOf(md)).toBe('The Hillside Room took three tries. The first two failed by a handful of words, and the third worked once I wrote it shorter.')
  })
  it('ends at a whole word with an ellipsis when no sentence ends in time', () => {
    const p = previewOf(`# T\n\n${'lidar '.repeat(40)}`)
    expect(p.length).toBeLessThanOrEqual(140)
    expect(p).toMatch(/ lidar…$/)
  })
})

describe('diaryBody', () => {
  const html = diaryBody({ ...base, journal: [entry('2026-11-17', 'Toast <b>day</b>', 'It answers rudely.'), entry('2026-11-10', 'Older', 'Yeast.')] })

  it('has a card for each entry, newest first as given, with day, title, first lines and a link, all escaped', () => {
    expect(html).toContain('href="2026-11-17.html"')
    expect(html).toContain('Tue 17 Nov')
    expect(html).toContain('Toast &lt;b&gt;day&lt;/b&gt;')
    expect(html).not.toContain('<b>day</b>')
    expect(html).toContain('It answers rudely.')
    expect(html.indexOf('2026-11-17.html')).toBeLessThan(html.indexOf('2026-11-10.html'))
  })

  it('shows the last 14 days as a calendar: entries are links, today is marked, other days are plain', () => {
    expect(html).toContain('<h2>November</h2>')
    expect(html.match(/class="cal-day/g)?.length).toBe(14)
    expect(html).toMatch(/<a href="2026-11-17.html" class="cal-day has">17<\/a>/)
    expect(html).toMatch(/<span class="cal-day today">18<\/span>/)
  })

  it('counts days alive from the first entry, things made and phases retired, from the numbers it is given', () => {
    expect(html).toContain('9 days alive')
    expect(html).toContain('4 things made')
    expect(html).toContain('1 phase retired')
  })

  it('says so when there is no entry yet, and when the night entry is still being written', () => {
    expect(diaryBody({ ...base, journal: [] })).toContain('Nothing yet.')
    expect(diaryBody({ ...base, journal: [], writing: { date: '2026-11-17' } })).toContain('The entry for 2026-11-17 is still being written.')
  })
})
