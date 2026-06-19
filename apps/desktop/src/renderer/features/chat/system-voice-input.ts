export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export function detectDesktopPlatform(): DesktopPlatform {
  if (document.documentElement.classList.contains('platform-darwin')) return 'darwin'
  if (document.documentElement.classList.contains('platform-win32')) return 'win32'
  if (document.documentElement.classList.contains('platform-linux')) return 'linux'

  const platform = navigator.platform.toLowerCase()
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('win')) return 'win32'
  return 'linux'
}

export function getSystemVoiceInputHint(platform = detectDesktopPlatform()): string {
  switch (platform) {
    case 'darwin':
      return '已聚焦输入框。请连按两下 Fn（或地球键）启动听写，也可使用输入法工具栏的语音输入。'
    case 'win32':
      return '已聚焦输入框。请按 Win + H 启动语音输入，或点击输入法工具栏的麦克风。'
    default:
      return '已聚焦输入框。请使用系统输入法或桌面环境中的语音输入功能。'
  }
}

export function getSystemVoiceInputTitle(platform = detectDesktopPlatform()): string {
  switch (platform) {
    case 'darwin':
      return '使用系统听写（连按两下 Fn 或地球键）'
    case 'win32':
      return '使用系统语音输入（Win + H）'
    default:
      return '使用系统语音输入'
  }
}
