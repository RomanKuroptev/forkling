import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlaceRequest, formatRequest } from '@forkling/schema'
import { readRequests } from '../src/requests.ts'

const request = (over: Record<string, unknown> = {}) =>
  PlaceRequest.parse({
    id: 'lantern-hall',
    kind: 'place',
    name: 'Lantern Hall',
    purpose: 'Where I keep the lidar finds that hold up.',
    tags: ['maya lidar'],
    chunk: [1, 0],
    related: [],
    souvenirs: [],
    written: '2026-11-14T10:00:00Z',
    status: 'open',
    statusAt: null,
    note: null,
    body: 'I keep coming back to the finds that hold up under their own weight.',
    ...over,
  })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'requests-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const put = (name: string, text: string) => {
  mkdirSync(join(dir, 'requests'), { recursive: true })
  writeFileSync(join(dir, 'requests', name), text)
}

describe('readRequests (requests/<id>.md)', () => {
  it('is empty with no folder', () => {
    expect(readRequests(dir)).toEqual([])
  })

  it('reads every request that fits, in id order, whatever its status', () => {
    put('lantern-hall.md', formatRequest(request()))
    put('a-first.md', formatRequest(request({ id: 'a-first', name: 'A First' })))
    put('built-one.md', formatRequest(request({ id: 'built-one', name: 'Built One', status: 'built', statusAt: '2026-11-16T10:00:00Z' })))
    expect(readRequests(dir).map((r) => [r.id, r.status])).toEqual([['a-first', 'open'], ['built-one', 'built'], ['lantern-hall', 'open']])
  })

  it('leaves out a file that does not fit, whose id is not its name, or that is not markdown', () => {
    put('junk.md', 'just words')
    put('wrong-name.md', formatRequest(request({ id: 'other-name' })))
    put('notes.txt', formatRequest(request({ id: 'notes' })))
    put('.gitkeep', '')
    put('lantern-hall.md', formatRequest(request()))
    expect(readRequests(dir).map((r) => r.id)).toEqual(['lantern-hall'])
  })

  it('reads a status Roman wrote by hand', () => {
    const text = formatRequest(request()).replace('status: "open"', 'status: building').replace('statusAt: null', 'statusAt: 2026-11-15T09:00:00Z')
    put('lantern-hall.md', text)
    expect(readRequests(dir)[0]).toMatchObject({ status: 'building', statusAt: '2026-11-15T09:00:00Z' })
  })
})
