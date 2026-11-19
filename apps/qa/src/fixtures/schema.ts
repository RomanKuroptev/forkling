import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Beliefs, BudgetLedger, Forkling, Goals, MindState, Note, Place, PlaceRequest, Project, Souvenir, Trail, Visitors, WorkMeta } from '@forkling/schema'
import type { z } from 'zod'
import { worldFileList } from './fixtures.ts'

/** Which schema each world file must fit, by its path. Files not named here (pictures, pages, logs) are not checked. */
const RULES: { test: RegExp; schema: z.ZodType }[] = [
  { test: /^forkling\.json$/, schema: Forkling },
  { test: /^places\/[^/]+\.json$/, schema: Place },
  { test: /^works\/[^/]+\/meta\.json$/, schema: WorkMeta },
  { test: /^projects\/[^/]+\/project\.json$/, schema: Project },
  { test: /^souvenirs\/[^/]+\.json$/, schema: Souvenir },
  { test: /^trails\/[^/]+\.json$/, schema: Trail },
  { test: /^notes\/[^/]+\.json$/, schema: Note },
  { test: /^requests\/[^/]+\.json$/, schema: PlaceRequest },
  { test: /^mind\/goals\.json$/, schema: Goals },
  { test: /^mind\/state\.json$/, schema: MindState },
  { test: /^brain\/budget\.json$/, schema: BudgetLedger },
  { test: /^memory\/beliefs\.json$/, schema: Beliefs },
  { test: /^memory\/visitors\.json$/, schema: Visitors },
]

/**
 * What in a world folder does not fit the schemas, one line per file ("places/home.json: id: lowercase words with dashes").
 * Empty when it all fits. A fixture that stops fitting after a schema change is updated in the same PR (audit spec 4).
 */
export function worldSchemaIssues(dir: string): string[] {
  const issues: string[] = []
  if (!existsSync(join(dir, 'forkling.json'))) issues.push('forkling.json: missing')
  for (const rel of worldFileList(dir)) {
    const rule = RULES.find((r) => r.test.test(rel))
    if (!rule) continue
    let data: unknown
    try {
      data = JSON.parse(readFileSync(join(dir, rel), 'utf8'))
    } catch (e) {
      issues.push(`${rel}: not JSON (${e instanceof Error ? e.message : String(e)})`)
      continue
    }
    const parsed = rule.schema.safeParse(data)
    if (!parsed.success) issues.push(`${rel}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(top)'}: ${i.message}`).join('; ')}`)
  }
  return issues
}
