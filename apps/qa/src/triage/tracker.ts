// The only way triage talks to GitHub. GhTracker (gh-tracker.ts) is the real one; FakeTracker is for tests,
// so no test ever touches GitHub; DryRunTracker reads through a real tracker and only records the writes.

export type Issue = {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: string[]
  createdAt: string
  // Only the fake keeps comments; the real tracker does not read them (triage never needs them).
  comments: string[]
}

export type NewIssue = { title: string; body: string; labels: string[] }

export interface Tracker {
  // Every issue with this label, open and closed.
  listIssues(label: string): Promise<Issue[]>
  createIssue(issue: NewIssue): Promise<number>
  comment(issue: number, body: string): Promise<void>
  editBody(issue: number, body: string): Promise<void>
  // Comments first, then closes or reopens.
  close(issue: number, comment: string): Promise<void>
  reopen(issue: number, comment: string): Promise<void>
  addLabels(issue: number, labels: string[]): Promise<void>
  // Puts a PNG on the qa-evidence branch and returns the address to show it at.
  uploadPicture(png: Uint8Array, remotePath: string): Promise<string>
}

export class FakeTracker implements Tracker {
  issues: Issue[] = []
  calls: string[] = []
  uploads: { remotePath: string; bytes: number }[] = []

  // An issue that was already there before the run (not counted in calls).
  seed(issue: Partial<Issue> & Pick<Issue, 'title' | 'body'>): number {
    const number = this.issues.length + 1
    this.issues.push({ state: 'open', labels: ['qa'], createdAt: '2026-11-19T10:00:00Z', comments: [], ...issue, number })
    return number
  }

  private get(n: number): Issue {
    const issue = this.issues.find((i) => i.number === n)
    if (!issue) throw new Error(`no issue #${n}`)
    return issue
  }

  async listIssues(label: string): Promise<Issue[]> {
    return this.issues.filter((i) => i.labels.includes(label)).map((i) => ({ ...i, labels: [...i.labels], comments: [...i.comments] }))
  }
  async createIssue({ title, body, labels }: NewIssue): Promise<number> {
    this.calls.push(`open ${title}`)
    return this.seed({ title, body, labels: [...labels], createdAt: '2026-11-20T10:00:00Z' })
  }
  async comment(n: number, body: string): Promise<void> {
    this.calls.push(`comment #${n}`)
    this.get(n).comments.push(body)
  }
  async editBody(n: number, body: string): Promise<void> {
    this.calls.push(`edit #${n}`)
    this.get(n).body = body
  }
  async close(n: number, comment: string): Promise<void> {
    await this.comment(n, comment)
    this.calls.push(`close #${n}`)
    this.get(n).state = 'closed'
  }
  async reopen(n: number, comment: string): Promise<void> {
    this.calls.push(`reopen #${n}`)
    this.get(n).state = 'open'
    await this.comment(n, comment)
  }
  async addLabels(n: number, labels: string[]): Promise<void> {
    this.calls.push(`label #${n} ${labels.join(',')}`)
    const issue = this.get(n)
    for (const l of labels) if (!issue.labels.includes(l)) issue.labels.push(l)
  }
  async uploadPicture(png: Uint8Array, remotePath: string): Promise<string> {
    this.calls.push(`upload ${remotePath}`)
    this.uploads.push({ remotePath, bytes: png.length })
    return `https://example.test/${remotePath}`
  }
}

// Reads go to the real tracker; writes are only written down in `log`, so a dry run shows what would happen.
export class DryRunTracker implements Tracker {
  log: string[] = []
  private next = -1
  private readonly real: Tracker
  constructor(real: Tracker) {
    this.real = real
  }

  listIssues(label: string): Promise<Issue[]> {
    return this.real.listIssues(label)
  }
  async createIssue({ title, labels }: NewIssue): Promise<number> {
    const n = this.next--
    this.log.push(`open: "${title}" [${labels.join(', ')}] (would be a new issue, shown as #${n})`)
    return n
  }
  async comment(n: number, body: string): Promise<void> {
    this.log.push(`comment: #${n}: ${body.split('\n')[0]}`)
  }
  async editBody(n: number): Promise<void> {
    this.log.push(`edit: #${n} (the hidden state line)`)
  }
  async close(n: number, comment: string): Promise<void> {
    this.log.push(`close: #${n}: ${comment}`)
  }
  async reopen(n: number, comment: string): Promise<void> {
    this.log.push(`reopen: #${n}: ${comment.split('\n')[0]}`)
  }
  async addLabels(n: number, labels: string[]): Promise<void> {
    this.log.push(`label: #${n} ${labels.join(', ')}`)
  }
  async uploadPicture(_png: Uint8Array, remotePath: string): Promise<string> {
    this.log.push(`upload: ${remotePath}`)
    return `(dry run: ${remotePath})`
  }
}
