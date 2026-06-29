import type { IconProps } from './types'

export function IconVSCode({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M15.5 3.5 20 8l-9.5 12.5L4 15.5l2-2.5 4.5 3.5L15.5 3.5Z"
        fill="#007ACC"
      />
      <path
        d="m4 15.5 2.5-2 1.5 1.2-1.2 1.3L4 15.5Z"
        fill="#1F9CF0"
      />
      <path
        d="M15.5 3.5 9 12.5l2 1.5 6.5-8.5-2-2Z"
        fill="#0065A9"
      />
    </svg>
  )
}

export function IconCursorEditor({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="#1a1a1a" />
      <path d="M8 16V8l5 4-5 4Z" fill="#fff" />
    </svg>
  )
}

export function IconCodeEditor({
  editorId = 'vscode',
  size = 16,
}: IconProps & { editorId?: string }) {
  if (editorId === 'cursor') return <IconCursorEditor size={size} />
  if (editorId === 'vscode') return <IconVSCode size={size} />

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

export function IconCodeBlock({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <polyline points="9 9 7 12 9 15" />
      <polyline points="15 9 17 12 15 15" />
      <line x1="12" y1="8" x2="12" y2="16" />
    </svg>
  )
}
