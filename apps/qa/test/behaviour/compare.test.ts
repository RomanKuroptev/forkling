import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cause, compare, compareCommand, webOfRun } from '../../src/behaviour/compare.ts'

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

describe('which web a run read', () => {
  const withWeb = (webs: (string | null)[]) => {
    const dir = run(webs.map(() => [{ id: 'rest', alarm: false }]))
    webs.forEach((snapshot, k) => {
      const out = join(dir, `seed-${k}`, 'out')
      mkdirSync(out, { recursive: true })
      if (snapshot !== null) writeFileSync(join(out, 'web.json'), JSON.stringify({ snapshot }))
    })
    return dir
  }

  it("comes from each seed folder's web.json", () => {
    expect(webOfRun(withWeb(['/qa/web-snapshot', '/qa/web-snapshot']))).toBe('snapshot')
    expect(webOfRun(withWeb([null]))).toBe('real')
    // A folder with no seed folders (a live score) read the real web.
    expect(webOfRun(run([[{ id: 'rest', alarm: false }]]))).toBe('real')
    expect(() => webOfRun(withWeb(['/qa/web-snapshot', null]))).toThrow(/mixed/)
  })

  it('labels a --real run that read the snapshot as the web snapshot; a flag only overrides when given', () => {
    const r3 = withWeb(['/qa/web-snapshot'])
    const day0 = withWeb(['/qa/web-snapshot'])
    const out = mkdtempSync(join(tmpdir(), 'qa-cmp-out-'))
    const logged: string[] = []
    const orig = console.log
    console.log = (s: string) => void logged.push(s)
    try {
      expect(compareCommand([`r3=${r3}`, `day0=${day0}`], { cwd: '/', out })).toBe(0)
      expect(logged.join('\n')).toContain('**r3** (web snapshot, 1 seed)')
      logged.length = 0
      expect(compareCommand(['--real', `r3=${r3}`, `day0=${day0}`], { cwd: '/', out })).toBe(0)
      expect(logged.join('\n')).toContain('**r3** (real web, 1 seed)')
      expect(logged.join('\n')).toContain('**day0** (web snapshot, 1 seed)')
    } finally {
      console.log = orig
    }
  })
})
