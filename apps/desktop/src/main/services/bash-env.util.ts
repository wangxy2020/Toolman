const INHERITED_BASH_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'PWD',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
] as const

const BLOCKED_ENV_PREFIXES = [
  'TOOLMAN_',
  'COMMUNITY_HUB_',
  'AUTHING_',
  'FIREBASE_',
  'TENCENT_',
  'WECHAT_',
] as const

const BLOCKED_ENV_SUFFIXES = ['_SECRET', '_TOKEN', '_PASSWORD', '_API_KEY'] as const

export function isBlockedInheritedEnvKey(key: string): boolean {
  const upper = key.toUpperCase()
  if (BLOCKED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
    return true
  }
  if (BLOCKED_ENV_SUFFIXES.some((suffix) => upper.endsWith(suffix))) {
    return true
  }
  if (upper === 'GITHUB_TOKEN' || upper === 'GH_TOKEN' || upper === 'OPENAI_API_KEY') {
    return true
  }
  return false
}

export function buildSandboxedBashEnv(userEnv: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}

  for (const key of INHERITED_BASH_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) {
      env[key] = value
    }
  }

  for (const [key, value] of Object.entries(userEnv)) {
    if (!key.trim() || isBlockedInheritedEnvKey(key)) continue
    env[key] = value
  }

  return env
}

/** Safe subset of process env for MCP stdio child processes. */
export function buildSandboxedInheritedEnv(
  source: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of INHERITED_BASH_ENV_KEYS) {
    const value = source[key]
    if (value !== undefined) env[key] = value
  }
  return env
}
