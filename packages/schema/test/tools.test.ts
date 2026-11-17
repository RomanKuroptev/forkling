import { describe, expect, it } from 'vitest'
import { Tool, Tools, actTools } from '../src/tools.ts'

const tool = (over: Record<string, unknown> = {}) => ({ id: 'read-sites', name: 'Read sites', what: 'Read a few web sites.', since: '2026-11-10', class: 'read', ...over })

describe('Tools (spec v4 8)', () => {
  it('an empty file parses to no tools; gift defaults to false', () => {
    expect(Tools.parse({})).toEqual({ tools: [] })
    expect(Tool.parse(tool()).gift).toBe(false)
  })
  it('what is up to 160 characters, a name up to 40, an id is a slug', () => {
    expect(Tool.safeParse(tool({ what: 'x'.repeat(161) })).success).toBe(false)
    expect(Tool.safeParse(tool({ what: 'x'.repeat(160) })).success).toBe(true)
    expect(Tool.safeParse(tool({ name: 'x'.repeat(41) })).success).toBe(false)
    expect(Tool.safeParse(tool({ id: 'Not A Slug' })).success).toBe(false)
  })
  it('an id is used once', () => {
    expect(Tools.safeParse({ tools: [tool(), tool()] }).success).toBe(false)
  })
  it('the class act is accepted by the schema, and actTools finds it', () => {
    const f = Tools.parse({ tools: [tool(), tool({ id: 'post', class: 'act' })] })
    expect(actTools(f).map((t) => t.id)).toEqual(['post'])
    expect(actTools(Tools.parse({ tools: [tool()] }))).toEqual([])
  })
  it('a class other than read or act is turned down', () => {
    expect(Tool.safeParse(tool({ class: 'write' })).success).toBe(false)
  })
})
