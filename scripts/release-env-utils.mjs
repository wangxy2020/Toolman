/** Shared helpers for baking / validating desktop release.env */

export const ALLOWED_PREFIXES = [
  'TOOLMAN_FIREBASE_',
  'TOOLMAN_AUTHING_',
  'TOOLMAN_TENCENT_',
  'TOOLMAN_WECHAT_',
  'TOOLMAN_AUTH_BUILD_',
  'TOOLMAN_BUILD_REGION',
  'TOOLMAN_COMMUNITY_JWT_SECRET',
  'TOOLMAN_P2P_XIRSYS_',
  'TOOLMAN_P2P_TURN_',
  'TOOLMAN_P2P_ICE_SERVERS',
  'TOOLMAN_P2P_STUN_SERVERS',
]

export function isAllowedKey(key) {
  if (/^(TOOLMAN_.*_DEV_MODE|TOOLMAN_BILLING_MOCK|TENCENT_SMS_DEV_MODE|WECHAT_DEV_MODE)$/.test(key)) {
    return false
  }
  return ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith('_') ? key.startsWith(prefix) : key === prefix,
  )
}

export function parseEnvFile(content) {
  const values = new Map()
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (isAllowedKey(key) && value) {
      values.set(key, value)
    }
  }
  return values
}

function hasAuthingAuth(values) {
  return (
    Boolean(values.get('TOOLMAN_AUTHING_APP_ID')?.trim()) &&
    Boolean(values.get('TOOLMAN_AUTHING_APP_SECRET')?.trim()) &&
    Boolean(values.get('TOOLMAN_AUTHING_APP_HOST')?.trim())
  )
}

function hasFirebaseAuth(values) {
  return (
    Boolean(values.get('TOOLMAN_FIREBASE_API_KEY')?.trim()) &&
    Boolean(values.get('TOOLMAN_FIREBASE_AUTH_DOMAIN')?.trim()) &&
    Boolean(values.get('TOOLMAN_FIREBASE_PROJECT_ID')?.trim())
  )
}

function hasXirsysP2p(values) {
  return (
    Boolean(values.get('TOOLMAN_P2P_XIRSYS_IDENT')?.trim()) &&
    Boolean(values.get('TOOLMAN_P2P_XIRSYS_SECRET')?.trim()) &&
    Boolean(values.get('TOOLMAN_P2P_XIRSYS_CHANNEL')?.trim())
  )
}

function hasStaticTurnP2p(values) {
  return (
    Boolean(values.get('TOOLMAN_P2P_TURN_URL')?.trim()) &&
    Boolean(values.get('TOOLMAN_P2P_TURN_USERNAME')?.trim()) &&
    Boolean(values.get('TOOLMAN_P2P_TURN_CREDENTIAL')?.trim())
  )
}

function hasIceServersJson(values) {
  const json = values.get('TOOLMAN_P2P_ICE_SERVERS')?.trim()
  if (!json) return false
  try {
    const parsed = JSON.parse(json)
    return (
      Array.isArray(parsed) &&
      parsed.some(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          String(entry.urls ?? '')
            .toLowerCase()
            .includes('turn') &&
          entry.username &&
          entry.credential,
      )
    )
  } catch {
    return false
  }
}

/**
 * @param {Map<string, string>} values
 * @returns {{ ok: boolean; errors: string[]; warnings: string[] }}
 */
export function validateReleaseEnv(values) {
  const errors = []
  const warnings = []

  if (values.size === 0) {
    errors.push('release env 为空：未找到任何可烘焙的 TOOLMAN_* 变量')
    return { ok: false, errors, warnings }
  }

  const buildRegion = values.get('TOOLMAN_AUTH_BUILD_REGION') ?? values.get('TOOLMAN_BUILD_REGION')
  const authing = hasAuthingAuth(values)
  const firebase = hasFirebaseAuth(values)

  if (buildRegion === 'cn' && !authing) {
    errors.push(
      '国内发行包缺少 Authing：需要 TOOLMAN_AUTHING_APP_ID、TOOLMAN_AUTHING_APP_SECRET、TOOLMAN_AUTHING_APP_HOST',
    )
  } else if (buildRegion === 'global' && !firebase) {
    errors.push(
      '国际发行包缺少 Firebase：需要 TOOLMAN_FIREBASE_API_KEY、TOOLMAN_FIREBASE_AUTH_DOMAIN、TOOLMAN_FIREBASE_PROJECT_ID',
    )
  } else if (!authing && !firebase) {
    errors.push(
      '缺少登录配置：至少配置 Authing（国内）或 Firebase（国际）；global 包建议两者都配',
    )
  } else if (!buildRegion && authing && !firebase) {
    warnings.push('未设置 TOOLMAN_AUTH_BUILD_REGION；已检测到 Authing，建议设为 cn 或 global')
  } else if (!buildRegion && firebase && !authing) {
    warnings.push('未设置 TOOLMAN_AUTH_BUILD_REGION；已检测到 Firebase，建议设为 global')
  }

  const p2pReady = hasXirsysP2p(values) || hasStaticTurnP2p(values) || hasIceServersJson(values)
  if (!p2pReady) {
    errors.push(
      '缺少 P2P/WAN 配置：推荐 TOOLMAN_P2P_XIRSYS_IDENT + SECRET + CHANNEL，或完整的 TOOLMAN_P2P_TURN_URL/USERNAME/CREDENTIAL',
    )
  } else if (hasXirsysP2p(values)) {
    if (!values.get('TOOLMAN_P2P_XIRSYS_PATH')?.trim()) {
      warnings.push('未设置 TOOLMAN_P2P_XIRSYS_PATH，将使用默认 https://global.xirsys.net')
    }
  }

  if (!values.get('TOOLMAN_COMMUNITY_JWT_SECRET')?.trim()) {
    warnings.push('未设置 TOOLMAN_COMMUNITY_JWT_SECRET（嵌入式 Hub / JWT 缓存可能受限）')
  }

  if (authing && !values.get('TOOLMAN_AUTHING_USER_POOL_SECRET')?.trim()) {
    warnings.push(
      '未设置 TOOLMAN_AUTHING_USER_POOL_SECRET：发行包将依赖登录 token 同步 Authing 角色；建议在 GitHub TOOLMAN_RELEASE_ENV 中配置用户池密钥以确保管理员等角色可靠识别',
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function formatReleaseEnvLines(values) {
  return [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
}
