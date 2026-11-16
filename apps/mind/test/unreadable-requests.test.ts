import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlaceRequest, formatRequest } from '@forkling/schema'
import { readRequests, unreadableRequests } from '../src/requests.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unreadable-requests-'))
  mkdirSync(join(dir, 'requests'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const request = (over: Record<string, unknown> = {}) =>
  PlaceRequest.parse({ id: 'lantern-hall', kind: 'place', name: 'Lantern Hall', purpose: 'Where I keep the lidar finds.', tags: ['maya lidar'], chunk: [1, 0], related: [], souvenirs: [], written: '2026-11-02T10:00:00Z', status: 'open', statusAt: null, note: null, body: 'A lamp over each find.', ...over })
const put = (name: string, text: string) => writeFileSync(join(dir, 'requests', name), text)

describe('request files that do not fit (a hand edit that makes a request vanish must not be silent)', () => {
  it('names nothing when every file fits, or when there is no folder', () => {
    put('lantern-hall.md', formatRequest(request()))
    expect(unreadableRequests(dir)).toEqual([])
    expect(unreadableRequests(join(dir, 'nowhere'))).toEqual([])
  })

  it('names a file with CRLF line endings, a file whose id is not its name, and a decline with no note', () => {
    put('crlf.md', formatRequest(request({ id: 'crlf' })).replaceAll('\n', '\r\n'))
    put('wrong-name.md', formatRequest(request({ id: 'some-other-id' })))
    put('declined.md', formatRequest(request({ id: 'declined' })).replace('status: "open"', 'status: "declined"'))
    expect(unreadableRequests(dir)).toEqual(['crlf.md', 'declined.md', 'wrong-name.md'])
  })

  it('agrees with what readRequests leaves out', () => {
    put('lantern-hall.md', formatRequest(request()))
    put('broken.md', 'not a request at all')
    expect(readRequests(dir).map((r) => r.id)).toEqual(['lantern-hall'])
    expect(unreadableRequests(dir)).toEqual(['broken.md'])
  })

  it('ignores files that are not requests', () => {
    put('notes.txt', 'hello')
    expect(unreadableRequests(dir)).toEqual([])
  })
})
