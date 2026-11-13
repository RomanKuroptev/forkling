/**
 * A short fingerprint of a world's places (8 hex digits, FNV-1a over their JSON), so the mind can say in `now.json` that they
 * changed and the viewer can tell whether what it has is current. Both sides parse the files with the same schema, so the same
 * places give the same text. Pure; nothing here reads a clock.
 */
export function placesRev(places: readonly unknown[]): string {
  const text = JSON.stringify(places)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
