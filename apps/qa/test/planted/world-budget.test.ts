import { describe, expect, it } from 'vitest'
import { BUDGET, budgetFindings } from '../../src/world/budget.ts'

describe('the drawing budget (audit spec 7.5)', () => {
  it('is quiet under the budget', () => {
    expect(budgetFindings([{ view: 'aerial', drawCalls: 60, triangles: 50_000 }], 'day-30')).toEqual([])
  })
  it('planted: too many draw calls and too many triangles, each named with the worst view', () => {
    const found = budgetFindings(
      [
        { view: 'aerial', drawCalls: BUDGET.drawCalls + 40, triangles: 100_000 },
        { view: 'start', drawCalls: 80, triangles: BUDGET.triangles + 1 },
      ],
      'day-30',
    )
    expect(found.map((f) => f.fingerprint)).toEqual(['world.budget|day-30|draw-calls', 'world.budget|day-30|triangles'])
    expect(found[0]!.what).toContain('aerial')
    expect(found[1]!.what).toContain('start')
  })
})
