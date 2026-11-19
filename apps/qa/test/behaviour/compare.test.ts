import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cause, compare } from '../../src/behaviour/compare.ts'

const run = (scores: { id: string; alarm: boolean }[][]) => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-cmp-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'scores.json'), JSON.stringify(scores.map((s, k) => ({ label: `seed-${k}`, scores: s.map((x) => ({ ...x, title: x.id, value: x.alarm ? 'bad' : 'fine' })) }))))
  return dir
}

describe('where an alarm comes from', () => {
  it('on both kinds of web is Merge; only on the snapshot is the fake web; only on the real web is the real web', () => {
    expect(cause([{ web: 'snapshot', alarm: true }, { web: 'real', alarm: true }])).toBe("Merge's choices (or the engine's prompts)")
    expect(cause([{ web: 'snapshot', alarm: true }, { web: 'real', alarm: false }])).toBe('the fake web (only on the snapshot)')
    expect(cause([{ web: 'snapshot', alarm: false }, { web: 'real', alarm: true }])).toBe('the real web (not on the snapshot)')
    expect(cause([{ web: 'snapshot', alarm: false }, { web: 'real', alarm: false }])).toBe('')
    expect(cause([{ web: 'real', alarm: true }])).toContain('unknown')
  })

  it('puts the runs side by side, counting alarms over seeds', () => {
    const text = compare([
      { name: 'day-0', web: 'snapshot', dir: run([[{ id: 'rest', alarm: true }, { id: 'memes', alarm: true }], [{ id: 'rest', alarm: false }, { id: 'memes', alarm: true }]]) },
      { name: 'r2', web: 'real', dir: run([[{ id: 'rest', alarm: true }, { id: 'memes', alarm: false }]]) },
    ])
    expect(text).toContain('| rest | **alarm 1 of 2**: bad / fine | **alarm**: bad | Merge\'s choices (or the engine\'s prompts) |')
    expect(text).toContain('| memes | **alarm 2 of 2**: bad / bad | fine | the fake web (only on the snapshot) |')
  })
})
