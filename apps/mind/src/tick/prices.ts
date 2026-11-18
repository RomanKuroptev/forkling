import { DAILY_POINTS, dailyPointsFor, livePrices, localDate, pricesDue, pricesFromLedger, PRICES, recordOverheadDays } from '@forkling/sim'
import { daysInMonth, effectiveCapUsd } from '../budget.ts'
import type { Tick } from './context.ts'

/**
 * Every tick, the overhead of each past day is read from the ledger while its calls are still there (it keeps only its last 500) and kept
 * in the mind state, because the daily points formula needs 7 full days (spec v4 5.2). On Sunday from 20:00, after the weekly review,
 * code sets two things again, once, never asleep: the prices from what the calls really cost over the last 14 days (`pricesFromLedger`:
 * a factor, at most 25% a week, never under 1, at least 5 calls), and the daily points from the formula (`dailyPointsFor`: the cap, less
 * the overhead the allowance does not pay for, times 0.9). The daily points stay at 300 until 7 full days are on record. What changed
 * goes to the tick log and `mind/health.json`.
 */
export function pricesStep(t: Tick): void {
  const { mind } = t
  const known = mind.overheadDays ?? []
  const days = recordOverheadDays(known, t.budget.calls, t.today, (iso) => localDate(t.tz, Date.parse(iso)))
  if (days.length !== known.length) mind.overheadDays = days
  if (!pricesDue({ timezone: t.tz, nowMs: t.nowMs, asleep: t.asleep, today: t.today, pricesSetOn: mind.pricesSetOn })) return
  const before = livePrices(mind.prices)
  const after = pricesFromLedger(t.budget.calls, t.nowMs, before)
  const changed = (Object.keys(PRICES) as (keyof typeof PRICES)[]).filter((k) => before[k] !== after[k])
  mind.prices = after
  mind.pricesSetOn = t.today
  const daily = dailyPointsFor({ capUsd: effectiveCapUsd(t.budget, t.credits), daysInMonth: daysInMonth(t.today), overheadDays: mind.overheadDays ?? [] })
  const dailyBefore = mind.dailyPoints?.value ?? DAILY_POINTS
  mind.dailyPoints = { value: daily, setOn: t.today }
  const parts = [
    changed.length > 0 ? `prices reset from the ledger: ${changed.map((k) => `${k} ${before[k]} to ${after[k]}`).join(', ')}` : 'prices reset from the ledger: no change',
    daily === dailyBefore ? `daily points stay at ${daily}` : `daily points ${dailyBefore} to ${daily}`,
  ]
  t.notes.push(parts.join('; '))
}
