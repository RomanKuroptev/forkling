import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { Issue, NewIssue, Tracker } from './tracker.ts'

// Runs `gh` with an argument list (no shell, so it works the same in PowerShell and bash) and returns stdout.
export type Exec = (args: string[], input?: string) => Promise<string>

export const ghExec: Exec = (args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${err.trim()}`))))
    child.stdin.end(input ?? '')
  })

// Pictures go to this orphan branch of the forkling repo and nowhere else: never main, never Merge's repo.
export const EVIDENCE_BRANCH = 'qa-evidence'
const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.png$/

const GhIssue = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string(),
  state: z.string(),
  labels: z.array(z.object({ name: z.string() })),
  createdAt: z.string(),
})

const FIELDS = 'number,title,body,state,labels,createdAt'
const toIssue = (i: z.infer<typeof GhIssue>): Issue => ({
  ...i,
  state: i.state.toLowerCase() === 'closed' ? 'closed' : 'open',
  labels: i.labels.map((l) => l.name),
  comments: [],
})

export class GhTracker implements Tracker {
  private branchReady = false
  private readonly repo: string
  private readonly exec: Exec
  // Plain fields, not parameter properties: node runs these files with type stripping only.
  constructor(repo: string, exec: Exec = ghExec) {
    this.repo = repo
    this.exec = exec
  }

  async listIssues(label: string): Promise<Issue[]> {
    const out = await this.exec(['issue', 'list', '--repo', this.repo, '--label', label, '--state', 'all', '--limit', '1000', '--json', FIELDS])
    return z.array(GhIssue).parse(JSON.parse(out)).map(toIssue)
  }

  async getIssue(n: number): Promise<Issue> {
    return toIssue(GhIssue.parse(JSON.parse(await this.exec(['issue', 'view', String(n), '--repo', this.repo, '--json', FIELDS]))))
  }

  async createIssue({ title, body, labels }: NewIssue): Promise<number> {
    const out = await this.exec(['issue', 'create', '--repo', this.repo, '--title', title, ...labels.flatMap((l) => ['--label', l]), '--body-file', '-'], body)
    const m = /\/issues\/(\d+)/.exec(out)
    if (!m) throw new Error(`gh issue create gave no issue address: ${out.trim()}`)
    return Number(m[1])
  }

  async comment(n: number, body: string): Promise<void> {
    await this.exec(['issue', 'comment', String(n), '--repo', this.repo, '--body-file', '-'], body)
  }

  async editBody(n: number, body: string): Promise<void> {
    await this.exec(['issue', 'edit', String(n), '--repo', this.repo, '--body-file', '-'], body)
  }

  async close(n: number, comment: string): Promise<void> {
    await this.comment(n, comment)
    await this.exec(['issue', 'close', String(n), '--repo', this.repo])
  }

  async reopen(n: number, comment: string): Promise<void> {
    await this.exec(['issue', 'reopen', String(n), '--repo', this.repo])
    await this.comment(n, comment)
  }

  async addLabels(n: number, labels: string[]): Promise<void> {
    await this.exec(['issue', 'edit', String(n), '--repo', this.repo, '--add-label', labels.join(',')])
  }

  async uploadPicture(png: Uint8Array, remotePath: string): Promise<string> {
    if (!remotePath.toLowerCase().endsWith('.png')) throw new Error(`only PNG pictures go to ${EVIDENCE_BRANCH}: ${remotePath}`)
    if (!SAFE_PATH.test(remotePath) || remotePath.split('/').some((p) => p === '..' || p === '.')) throw new Error(`not a safe evidence path: ${remotePath}`)
    await this.ensureBranch()
    const url = `https://raw.githubusercontent.com/${this.repo}/${EVIDENCE_BRANCH}/${remotePath}`
    try {
      await this.exec(['api', `repos/${this.repo}/contents/${remotePath}?ref=${EVIDENCE_BRANCH}`])
      return url // already there (same issue, same day)
    } catch {
      // not there yet
    }
    const body = { message: `qa evidence: ${remotePath}`, branch: EVIDENCE_BRANCH, content: Buffer.from(png).toString('base64') }
    await this.exec(['api', '-X', 'PUT', `repos/${this.repo}/contents/${remotePath}`, '--input', '-'], JSON.stringify(body))
    return url
  }

  // The branch is made once, as an orphan (a commit with no parents), so it never carries code.
  private async ensureBranch(): Promise<void> {
    if (this.branchReady) return
    try {
      await this.exec(['api', `repos/${this.repo}/branches/${EVIDENCE_BRANCH}`])
    } catch {
      const readme = 'Pictures for the QA issues, written only by `pnpm qa triage`. No code lives here.\n'
      const post = async (path: string, input: unknown): Promise<string> =>
        z.object({ sha: z.string() }).parse(JSON.parse(await this.exec(['api', '-X', 'POST', `repos/${this.repo}/${path}`, '--input', '-'], JSON.stringify(input)))).sha
      const tree = await post('git/trees', { tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: readme }] })
      const commit = await post('git/commits', { message: 'qa evidence branch', tree, parents: [] })
      await this.exec(['api', '-X', 'POST', `repos/${this.repo}/git/refs`, '--input', '-'], JSON.stringify({ ref: `refs/heads/${EVIDENCE_BRANCH}`, sha: commit }))
    }
    this.branchReady = true
  }
}
