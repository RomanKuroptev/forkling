import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { Area } from '../report/finding.ts'

// qa-out/run.json: which areas a run looked at. Triage counts a missing finding as clean only in these areas,
// so a run that skipped the world explorer cannot close a world issue.
export const RunInfo = z.object({ title: z.string(), areas: z.array(Area) })
export type RunInfo = z.infer<typeof RunInfo>

export function readRunInfo(outDir: string): RunInfo | null {
  const file = join(outDir, 'run.json')
  if (!existsSync(file)) return null
  return RunInfo.parse(JSON.parse(readFileSync(file, 'utf8')))
}

export function writeRunInfo(outDir: string, info: RunInfo): void {
  writeFileSync(join(outDir, 'run.json'), `${JSON.stringify(RunInfo.parse({ ...info, areas: [...new Set(info.areas)] }), null, 2)}\n`)
}
