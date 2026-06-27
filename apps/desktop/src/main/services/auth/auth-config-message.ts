import { app } from 'electron'

export type AuthConfigHintKind = 'firebase' | 'cn' | 'intl'

export function formatAuthProviderNotConfiguredMessage(kind: AuthConfigHintKind): string {
  if (app.isPackaged) {
    switch (kind) {
      case 'firebase':
      case 'intl':
        return '国际登录暂不可用，请更新到最新版本或联系支持。'
      case 'cn':
        return '国内登录暂不可用，请更新到最新版本或联系支持。'
    }
  }

  switch (kind) {
    case 'firebase':
      return 'Firebase 未配置，请设置 TOOLMAN_FIREBASE_* 环境变量'
    case 'cn':
      return '国内登录未配置，请设置 TOOLMAN_AUTHING_* 或 TOOLMAN_TENCENT_* 环境变量'
    case 'intl':
      return '国际登录未配置，请设置 TOOLMAN_FIREBASE_* 环境变量'
  }
}
