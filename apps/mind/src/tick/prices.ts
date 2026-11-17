import { livePrices, pricesDue, pricesFromLedger, PRICES } from '@forkling/sim'
import type { Tick } from './context.ts'

/**
 * Each Sunday the prices of the daily allowance are set again from what the calls really cost (audit 17 Nov): the average of each
 * kind of call in the ledger's last 7 days, in points, rounded up (`pricesFromLedger`). Code only, once a Sunday, never asleep. What
 * changed goes to the tick log. The daily 150 points are not touched.
 */
export function pricesStep(t: Tick): void {
  const { mind } = t
  if (!pricesDue({ timezone: t.tz, nowMs: t.nowMs, asleep: t.asleep, today: t.today, pricesSetOn: mind.pricesSetOn })) return
  const before = livePrices(mind.prices)
  const after = pricesFromLedger(t.budget.calls, t.nowMs, before)
  const changed = (Object.keys(PRICES) as (keyof typeof PRICES)[]).filter((k) => before[k] !== after[k])
  mind.prices = after
  mind.pricesSetOn = t.today
  t.notes.push(changed.length > 0 ? `prices reset from the ledger: ${changed.map((k) => `${k} ${before[k]} to ${after[k]}`).join(', ')}` : 'prices reset from the ledger: no change')
}
