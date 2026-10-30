/** Parses `18:30` or `18` into hours since midnight, or null if it isn't a valid time of day. */
export function parseHour(value: string | null): number | null {
  const match = value?.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return null
  const minutes = Number(match[2] ?? 0)
  const hour = Number(match[1]) + minutes / 60
  return hour >= 0 && hour < 24 && minutes < 60 ? hour : null
}
