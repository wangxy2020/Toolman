export interface P2pWorkspaceSettings {
  /** 全员专业版达标后开启，仅允许专业版成员继续加入 */
  vipPoolEnabled?: boolean
}

export function parseP2pWorkspaceSettings(settingsJson: string | null | undefined): P2pWorkspaceSettings {
  if (!settingsJson?.trim()) return {}
  try {
    const parsed = JSON.parse(settingsJson) as P2pWorkspaceSettings
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function mergeP2pWorkspaceSettings(
  settingsJson: string | null | undefined,
  patch: P2pWorkspaceSettings,
): string {
  return JSON.stringify({
    ...parseP2pWorkspaceSettings(settingsJson),
    ...patch,
  })
}

export function isWorkspaceVipPoolEnabled(settingsJson: string | null | undefined): boolean {
  return parseP2pWorkspaceSettings(settingsJson).vipPoolEnabled === true
}
