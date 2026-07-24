const USER_POOL_NOT_FOUND_PATTERN = /用户池不存在|找不到用户池|user\s*pool.*(not\s+found|does\s+not\s+exist|不存在)/i
const SERVICE_SUSPENDED_PATTERN =
  /服务已暂停|及时升级套餐|upgrade\s*(your\s*)?(plan|package)|service\s*(has\s*been\s*)?(paused|suspended)/i

export function formatAuthingConfigurationError(message: string): string | null {
  if (!USER_POOL_NOT_FOUND_PATTERN.test(message)) {
    return null
  }

  return [
    'Authing 配置有误：请检查 `.env.local` 中的 TOOLMAN_AUTHING_APP_ID（应用 ID）、',
    'TOOLMAN_AUTHING_USER_POOL_ID（用户池 ID，若与应用 ID 不同需单独填写）、',
    'TOOLMAN_AUTHING_APP_HOST（应用认证域名，如 https://xxx.authing.cn）。',
    '修改用户池「显示名称」不影响登录；若修改了用户池「域名/标识符」，需同步更新 APP_HOST。',
  ].join('')
}

/** Authing cloud billing / plan pause — not a dual-instance or local auth bug. */
export function formatAuthingBillingError(message: string): string | null {
  if (!SERVICE_SUSPENDED_PATTERN.test(message)) {
    return null
  }

  return [
    'Authing 用户池服务已暂停（体验到期或套餐欠费），与双开无关。',
    '请到 Authing 控制台 → 费用管理 / 版本信息 升级或续费后重试。',
    '已登录的本地会话可能仍可用，但新登录（如用户 B）会失败。',
  ].join('')
}

export function formatAuthingServiceError(message: string | null | undefined, fallback: string): string {
  const trimmed = message?.trim()
  if (!trimmed) {
    return fallback
  }

  return formatAuthingBillingError(trimmed) ?? formatAuthingConfigurationError(trimmed) ?? trimmed
}
