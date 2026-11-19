import { describe, expect, it } from 'vitest'
import { DryRunTracker } from '../src/triage/tracker.ts'
import { EVIDENCE_BRANCH, GhTracker, type Exec } from '../src/triage/gh-tracker.ts'

type Call = { args: string[]; input?: string }

function fakeExec(answers: Record<string, string | Error> = {}): { exec: Exec; calls: Call[] } {
  const calls: Call[] = []
  const exec: Exec = async (args, input) => {
    calls.push(input === undefined ? { args } : { args, input })
    const key = Object.keys(answers).find((k) => args.join(' ').includes(k))
    const a = key === undefined ? '' : answers[key]!
    if (a instanceof Error) throw a
    return a
  }
  return { exec, calls }
}

const repo = 'RomanKuroptev/forkling'

describe('gh tracker', () => {
  it('lists qa issues in every state and reads labels and state', async () => {
    const list = JSON.stringify([
      { number: 7, title: 'T', body: 'B', state: 'CLOSED', labels: [{ name: 'qa' }, { name: 'fix-failed' }], createdAt: '2026-11-19T10:00:00Z' },
    ])
    const { exec, calls } = fakeExec({ 'issue list': list })
    const issues = await new GhTracker(repo, exec).listIssues('qa')
    expect(calls[0]!.args).toEqual(['issue', 'list', '--repo', repo, '--label', 'qa', '--state', 'all', '--limit', '1000', '--json', 'number,title,body,state,labels,createdAt'])
    expect(issues).toEqual([{ number: 7, title: 'T', body: 'B', state: 'closed', labels: ['qa', 'fix-failed'], createdAt: '2026-11-19T10:00:00Z', comments: [] }])
  })

  it('creates an issue with the body on stdin and reads the number from the URL', async () => {
    const { exec, calls } = fakeExec({ 'issue create': 'https://github.com/RomanKuroptev/forkling/issues/301\n' })
    const n = await new GhTracker(repo, exec).createIssue({ title: 'A title', body: 'Body', labels: ['qa', 'needs-roman'] })
    expect(n).toBe(301)
    expect(calls[0]).toEqual({ args: ['issue', 'create', '--repo', repo, '--title', 'A title', '--label', 'qa', '--label', 'needs-roman', '--body-file', '-'], input: 'Body' })
  })

  it('comments, edits, closes and reopens with the right commands', async () => {
    const { exec, calls } = fakeExec()
    const t = new GhTracker(repo, exec)
    await t.comment(5, 'c')
    await t.editBody(5, 'b')
    await t.close(5, 'gone')
    await t.reopen(5, 'back')
    await t.addLabels(5, ['fix-failed'])
    expect(calls.map((c) => c.args.slice(0, 3).join(' '))).toEqual([
      'issue comment 5', 'issue edit 5', 'issue comment 5', 'issue close 5', 'issue reopen 5', 'issue comment 5', 'issue edit 5',
    ])
    expect(calls.at(-1)!.args).toContain('--add-label')
  })

  it('uploads a PNG to the qa-evidence branch only, with the content on stdin', async () => {
    const { exec, calls } = fakeExec({ [`branches/${EVIDENCE_BRANCH}`]: '{}', 'contents/abc/2026-11-20/a.png?ref': new Error('HTTP 404') })
    const url = await new GhTracker(repo, exec).uploadPicture(new Uint8Array([137, 80, 78, 71]), 'abc/2026-11-20/a.png')
    expect(url).toBe(`https://raw.githubusercontent.com/${repo}/${EVIDENCE_BRANCH}/abc/2026-11-20/a.png`)
    const put = calls.find((c) => c.args.includes('PUT'))!
    expect(put.args).toEqual(['api', '-X', 'PUT', `repos/${repo}/contents/abc/2026-11-20/a.png`, '--input', '-'])
    expect(JSON.parse(put.input!)).toMatchObject({ branch: 'qa-evidence', content: Buffer.from([137, 80, 78, 71]).toString('base64') })
  })

  it('does not upload a picture that is already there', async () => {
    const { exec, calls } = fakeExec({ [`branches/${EVIDENCE_BRANCH}`]: '{}', 'contents/abc/x.png?ref': '{"sha":"1"}' })
    await new GhTracker(repo, exec).uploadPicture(new Uint8Array([1]), 'abc/x.png')
    expect(calls.some((c) => c.args.includes('PUT'))).toBe(false)
  })

  it('makes the orphan evidence branch when it is missing (no parents, never from main)', async () => {
    const { exec, calls } = fakeExec({
      [`branches/${EVIDENCE_BRANCH}`]: new Error('HTTP 404'),
      'git/trees': '{"sha":"tree1"}',
      'git/commits': '{"sha":"commit1"}',
      'contents/abc/x.png?ref': new Error('HTTP 404'),
    })
    await new GhTracker(repo, exec).uploadPicture(new Uint8Array([1]), 'abc/x.png')
    const commit = calls.find((c) => c.args.some((a) => a.endsWith('git/commits')))!
    expect(JSON.parse(commit.input!)).toMatchObject({ tree: 'tree1', parents: [] })
    const ref = calls.find((c) => c.args.some((a) => a.endsWith('git/refs')))!
    expect(JSON.parse(ref.input!)).toEqual({ ref: 'refs/heads/qa-evidence', sha: 'commit1' })
  })

  it('refuses anything but a PNG path inside the evidence branch', async () => {
    const t = new GhTracker(repo, fakeExec().exec)
    await expect(t.uploadPicture(new Uint8Array([1]), 'abc/x.svg')).rejects.toThrow(/PNG/)
    await expect(t.uploadPicture(new Uint8Array([1]), '../main/x.png')).rejects.toThrow(/path/)
    await expect(t.uploadPicture(new Uint8Array([1]), '/x.png')).rejects.toThrow(/path/)
  })
})

describe('dry-run tracker', () => {
  it('reads through, but only records writes', async () => {
    const list = JSON.stringify([{ number: 1, title: 'T', body: 'B', state: 'OPEN', labels: [], createdAt: '2026-11-19T10:00:00Z' }])
    const { exec, calls } = fakeExec({ 'issue list': list })
    const t = new DryRunTracker(new GhTracker(repo, exec))
    expect(await t.listIssues('qa')).toHaveLength(1)
    const n = await t.createIssue({ title: 'New', body: 'B', labels: ['qa'] })
    await t.comment(1, 'c')
    await t.close(1, 'gone')
    await t.uploadPicture(new Uint8Array([1]), 'abc/x.png')
    expect(calls).toHaveLength(1)
    expect(n).toBeLessThan(0)
    expect(t.log.map((l) => l.split(':')[0])).toEqual(['open', 'comment', 'close', 'upload'])
  })
})
