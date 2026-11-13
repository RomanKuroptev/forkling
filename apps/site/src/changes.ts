import { execFileSync } from 'node:child_process'

/** One line of `changes.json` (spec 8): what happened, when, and where to look. */
export interface Change {
  at: string
  text: string
  href?: string
}

const MAX_CHANGES = 50
const LOG_COMMITS = 300

/** The world's history as `@@<commit time>` lines, each followed by `A`, `M` or `D` and the path of every file the commit touched. */
export function defaultGitLog(world: string): string {
  return execFileSync('git', ['log', '--name-status', '--no-renames', '--format=@@%cI', '-n', String(LOG_COMMITS)], { cwd: world, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 })
}

/**
 * What visitors would notice in the commits (spec 8): "kept a souvenir", "shelved a work", "wrote a diary entry". Read from what a
 * commit adds under the folders that hold what Merge makes; the files that change on every tick (the mind's state, health,
 * the stream) are not changes. A work counts as shelved by its thumbnail, which only a work that passed its check has, so a scrap
 * and a change of status are not. Newest first, at most 50.
 */
export function parseChanges(log: string, o: { titleOf: (workId: string) => string | undefined; placeAt?: (placeId: string, commitIso: string) => { name: string; text: string } | undefined }): Change[] {
  const changes: Change[] = []
  let at = ''
  let souvenirs = 0
  // Commits come newest first, and the changes of one commit keep the order of the log; the souvenirs of a commit are one line, put first.
  let batch: Change[] = []
  const closeCommit = () => {
    if (at && souvenirs > 0) batch.unshift({ at, text: souvenirs === 1 ? 'kept a souvenir' : `kept ${souvenirs} souvenirs` })
    changes.push(...batch)
    batch = []
    souvenirs = 0
  }
  for (const line of log.split('\n')) {
    if (line.startsWith('@@')) {
      closeCommit()
      const parsed = new Date(line.slice(2).trim())
      at = Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
      continue
    }
    const [status, path] = line.split('\t')
    if (at && path && (status === 'A' || status === 'M')) {
      const place = /^places\/([^/]+)\.json$/.exec(path)
      if (place) {
        const done = o.placeAt?.(place[1]!, at)
        if (done) batch.push({ at, text: done.text, href: `places/${place[1]}/` })
        continue
      }
    }
    if (!at || status !== 'A' || !path) continue
    if (/^souvenirs\/[^/]+\.json$/.test(path)) souvenirs++
    else if (/^trails\/[^/]+\.json$/.test(path)) batch.push({ at, text: 'went on a trip' })
    else {
      const work = /^works\/([^/]+)\/thumb\.png$/.exec(path)
      if (work) {
        const title = o.titleOf(work[1]!)
        batch.push({ at, text: title ? `shelved a work: ${title}` : 'shelved a work', href: `workshop/${work[1]}.html` })
        continue
      }
      const diary = /^journal\/([^/]+)\.md$/.exec(path)
      if (diary) batch.push({ at, text: 'wrote a diary entry', ...(/^\d{4}-\d{2}-\d{2}$/.test(diary[1]!) ? { href: `journal/${diary[1]}.html` } : {}) })
      else if (/^notebook\/writing\/[^/]+\.md$/.test(path)) batch.push({ at, text: 'wrote something' })
    }
  }
  closeCommit()
  return changes.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_CHANGES)
}
