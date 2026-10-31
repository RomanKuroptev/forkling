type Env = Record<string, string | undefined>

const set = (env: Env, key: string) => Boolean(env[key])

/**
 * Whether the environment holds anything the SDK can authenticate with: an API key, an auth token, or a complete
 * workload identity federation setup (what a GitHub Actions job gets from `id-token: write`, with no stored secret).
 * Empty strings count as unset, which is what an unconfigured repository secret becomes.
 */
export function hasCredentials(env: Env): boolean {
  if (set(env, 'ANTHROPIC_API_KEY') || set(env, 'ANTHROPIC_AUTH_TOKEN')) return true
  const federated = ['ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID'].every((k) => set(env, k))
  return federated && (set(env, 'ANTHROPIC_IDENTITY_TOKEN_FILE') || set(env, 'ANTHROPIC_IDENTITY_TOKEN'))
}
