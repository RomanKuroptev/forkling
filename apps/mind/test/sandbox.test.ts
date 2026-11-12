import { describe, expect, it } from 'vitest'
import { hasPolicy, POLICY, policyMeta, withPolicy, workFrame } from '../src/builds/sandbox.ts'

describe('the policy (spec 7.4)', () => {
  it('is the one in the spec, word for word', () => {
    expect(POLICY).toBe(
      "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; form-action 'none'",
    )
    expect(policyMeta()).toBe(`<meta http-equiv="Content-Security-Policy" content="${POLICY}">`)
  })
})

describe('withPolicy: GitHub Pages cannot send headers, so the build puts the policy in the page', () => {
  it('inserts the meta tag as the first element of the head', () => {
    const out = withPolicy('<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body>hi</body></html>')
    expect(out).toContain(`<head>${policyMeta()}<meta charset="utf-8">`)
    expect(hasPolicy(out)).toBe(true)
  })

  it('keeps attributes on the head tag, and whatever case it is written in', () => {
    expect(withPolicy('<HTML><HEAD lang="en"><title>t</title></HEAD></HTML>')).toContain(`<HEAD lang="en">${policyMeta()}<title>`)
  })

  it('makes a head when the page has none, before anything that loads', () => {
    const out = withPolicy('<script src="../../lib/p5.min.js"></script><body>hi</body>')
    expect(out.indexOf(policyMeta())).toBeGreaterThanOrEqual(0)
    expect(out.indexOf(policyMeta())).toBeLessThan(out.indexOf('<script'))
    expect(hasPolicy(out)).toBe(true)
  })

  it('does it once: a second run leaves one meta tag', () => {
    const once = withPolicy('<html><head></head><body></body></html>')
    expect(withPolicy(once)).toBe(once)
    expect(once.split('Content-Security-Policy').length - 1).toBe(1)
  })

  it('takes out a policy of the work\'s own, so a weaker one cannot sit beside ours', () => {
    const out = withPolicy(`<html><head><meta http-equiv="content-security-policy" content="default-src *"><title>t</title></head></html>`)
    expect(out).not.toContain('default-src *')
    expect(out.split(/content-security-policy/i).length - 1).toBe(1)
    expect(hasPolicy(out)).toBe(true)
  })
})

describe('hasPolicy: the check verifies the tag is there', () => {
  const good = withPolicy('<html><head><title>t</title></head><body></body></html>')

  it('is true for the page the build makes', () => {
    expect(hasPolicy(good)).toBe(true)
  })

  it('is false when there is no tag, or the policy was weakened', () => {
    expect(hasPolicy('<html><head><title>t</title></head></html>')).toBe(false)
    expect(hasPolicy(good.replace("connect-src 'none'", "connect-src *"))).toBe(false)
    expect(hasPolicy(good.replace("default-src 'none'; ", ''))).toBe(false)
  })

  it('is false when the tag is not the first thing in the head, since it only covers what comes after it', () => {
    const late = `<html><head><script>1</script>${policyMeta()}</head></html>`
    expect(hasPolicy(late)).toBe(false)
    expect(hasPolicy(`<html><head><title>t</title>${policyMeta()}</head></html>`)).toBe(false)
  })

  it('is false when the tag is in the body', () => {
    expect(hasPolicy(`<html><head></head><body>${policyMeta()}</body></html>`)).toBe(false)
  })
})

describe('workFrame: how the site shows a work (spec 7.4)', () => {
  it('is an iframe that may run scripts and nothing else', () => {
    const frame = workFrame('works/a-lamp/index.html', 'A lamp')
    expect(frame).toMatch(/^<iframe /)
    expect(frame).toContain('sandbox="allow-scripts"')
    expect(frame).not.toContain('allow-same-origin')
    expect(frame).toContain('src="works/a-lamp/index.html"')
    expect(frame).toContain('referrerpolicy="no-referrer"')
  })

  it('escapes the title and the address, so neither can break out of the tag', () => {
    const frame = workFrame('works/"><script>x</script>/index.html', '"><img src=x onerror=alert(1)>')
    expect(frame).not.toMatch(/<script|<img/)
    expect(frame.match(/</g)).toHaveLength(2) // the opening tag and the closing one, nothing more
  })
})
