import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PORT } from '../src/server.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (rel: string) => readFileSync(`${root}${rel}`, 'utf8')

describe('deploy/forkling-mind.service (spec 14.3)', () => {
  const unit = read('deploy/forkling-mind.service')

  it('restarts on failure and takes its keys from an environment file, never from the unit', () => {
    expect(unit).toMatch(/^Restart=always$/m)
    expect(unit).toMatch(/^EnvironmentFile=\/etc\/forkling\/mind\.env$/m)
    expect(unit).not.toMatch(/sk-ant|ghp_|github_pat_|ANTHROPIC_API_KEY=/)
  })

  it('runs as its own user, without root, and may write only its own data', () => {
    expect(unit).toMatch(/^User=forkling$/m)
    expect(unit).toMatch(/^NoNewPrivileges=true$/m)
    expect(unit).toMatch(/^ProtectSystem=strict$/m)
    expect(unit).toMatch(/^ReadWritePaths=\/var\/lib\/forkling$/m)
  })

  it('serves on the port Caddy forwards to, and gives a tick time to finish when it is stopped', () => {
    expect(unit).toContain(`--port ${DEFAULT_PORT}`)
    expect(unit).toMatch(/^TimeoutStopSec=(9\d|1\d\d)$/m)
    expect(unit).toMatch(/src\/serve\.ts/)
  })
})

describe('deploy/Caddyfile (spec 11.2: HTTPS from a free certificate)', () => {
  const caddy = read('deploy/Caddyfile')

  it('forwards the host to the loopback port the server listens on, and names the host in one place', () => {
    expect(caddy).toContain(`reverse_proxy 127.0.0.1:${DEFAULT_PORT}`)
    expect(caddy.match(/__HOST__/g)).toHaveLength(1)
  })
})

describe('deploy scripts', () => {
  const setup = read('deploy/setup.sh')
  const deploy = read('deploy/deploy.sh')

  it('parse as bash', () => {
    for (const file of ['deploy/setup.sh', 'deploy/deploy.sh', 'deploy/forkling-restart']) {
      expect(() => execFileSync('bash', ['-n', `${root}${file}`]), file).not.toThrow()
    }
  })

  it('setup: key-only SSH, a firewall that opens 22, 80 and 443 only, and automatic updates (spec 11.2)', () => {
    expect(setup).toMatch(/PasswordAuthentication no/)
    expect(setup).toMatch(/PermitRootLogin prohibit-password/)
    expect(setup).toMatch(/ufw allow 22\/tcp/)
    expect(setup).toMatch(/ufw allow 80\/tcp/)
    expect(setup).toMatch(/ufw allow 443\/tcp/)
    expect(setup).not.toMatch(/ufw allow (?!22|80|443)\d+/)
    expect(setup).toMatch(/unattended-upgrades/)
  })

  it('setup: writes an env file nobody but root and the service can read, with no real keys in it', () => {
    expect(setup).toMatch(/chmod 640 \/etc\/forkling\/mind\.env/)
    expect(setup).not.toMatch(/sk-ant|ghp_|github_pat_/)
  })

  it('a deploy key never means root: the deploy user may run one root-owned helper, which takes only a tag and runs nothing from the checkout', () => {
    const restart = read('deploy/forkling-restart')
    expect(setup).toMatch(/deploy ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/forkling-restart'/)
    expect(setup).toMatch(/install -m 755 -o root -g root "\$HERE\/forkling-restart" \/usr\/local\/sbin\/forkling-restart/)
    expect(setup).toMatch(/install -m 644 -o root -g root "\$HERE\/forkling-mind\.service"/)
    expect(restart).toMatch(/\^v\[0-9\]\+\\.\[0-9\]\+\\.\[0-9\]\+\$/)
    expect(restart).toMatch(/systemctl restart forkling-mind/)
    expect(restart).not.toMatch(/\/opt\/forkling\/engine|pnpm|node |git /)
    expect(deploy).toMatch(/sudo \/usr\/local\/sbin\/forkling-restart "\$TAG"/)
    expect(deploy).not.toMatch(/sudo (?!\/usr\/local\/sbin\/forkling-restart)/)
  })

  it('deploy: takes only a release tag, installs from the lockfile, and checks /health before it says it worked', () => {
    expect(deploy).toMatch(/\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/)
    expect(deploy).toMatch(/pnpm install --frozen-lockfile/)
    expect(deploy).toContain(`127.0.0.1:${DEFAULT_PORT}/health`)
    expect(deploy).toMatch(/previous-tag/)
  })
})

describe('.github/workflows/deploy.yml (Roman runs it by hand)', () => {
  const yml = read('.github/workflows/deploy.yml')

  it('runs only by hand, with a tag, and checks the tag looks like a release', () => {
    expect(yml).toMatch(/on:\s+workflow_dispatch:/)
    expect(yml).not.toMatch(/\n\s+(push|pull_request|schedule):/)
    expect(yml).toMatch(/\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/)
  })

  it('reaches the server over SSH with a pinned host key and secrets, never a key in the file', () => {
    for (const name of ['DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_SSH_KEY', 'DEPLOY_KNOWN_HOSTS']) expect(yml).toContain(`secrets.${name}`)
    expect(yml).toMatch(/StrictHostKeyChecking=yes/)
    expect(yml).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
  })

  it('does not deploy two at once', () => {
    expect(yml).toMatch(/concurrency:\s+group: deploy\s+cancel-in-progress: false/)
  })
})

describe('docs/spec/w3-runbook.md', () => {
  it('exists, since creating the server and the DNS name is Roman\'s to do', () => {
    expect(existsSync(`${root}docs/spec/w3-runbook.md`)).toBe(true)
  })
})
