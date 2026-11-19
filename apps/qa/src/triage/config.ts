import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

// qa/triage.json: the pinned digest issue and how many fixes one run may start (spec 10: up to 5).
// A file under qa/, so a change goes in a PR labelled qa-rules that only Roman merges.
export const TriageConfig = z.object({
  digestIssue: z.number().int().positive(),
  maxFixes: z.number().int().min(0).max(5),
})
export type TriageConfig = z.infer<typeof TriageConfig>

export const DEFAULT_CONFIG: TriageConfig = { digestIssue: 269, maxFixes: 5 }

export function loadConfig(root: string): TriageConfig {
  const file = join(root, 'qa', 'triage.json')
  return existsSync(file) ? TriageConfig.parse(JSON.parse(readFileSync(file, 'utf8'))) : DEFAULT_CONFIG
}
