import type { IconProps } from './types'

export function IconOutline({ size = 16, className }: IconProps) {
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
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="12" y1="12" x2="21" y2="12" />
      <line x1="16" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="7" y1="12" x2="7.01" y2="12" />
      <line x1="11" y1="18" x2="11.01" y2="18" />
    </svg>
  )
}

export function IconListBullet({ size = 16, className }: IconProps) {
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
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconListOrdered({ size = 16, className }: IconProps) {
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
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1.5" />
      <path d="M4.75 4.5v3" />
      <path d="M4 12h2.5" />
      <path d="M4 15.5h2" />
      <path d="M4 18h2.5" />
    </svg>
  )
}

export function IconImage({ size = 16, className }: IconProps) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5.5-5.5L5 19" />
    </svg>
  )
}

export function IconQuote({ size = 16, className }: IconProps) {
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
      <path d="M4 11h3a2 2 0 0 1 2 2v5H4V11z" />
      <path d="M13 11h3a2 2 0 0 1 2 2v5h-5v-7z" />
    </svg>
  )
}

export function IconTaskList({ size = 16, className }: IconProps) {
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
      <rect x="3" y="5" width="5" height="5" rx="1" />
      <path d="M5 7.5 4 8.5l1 1" />
      <line x1="11" y1="7.5" x2="20" y2="7.5" />
      <rect x="3" y="14" width="5" height="5" rx="1" />
      <line x1="11" y1="16.5" x2="20" y2="16.5" />
    </svg>
  )
}

export function IconFormula({ size = 16, className }: IconProps) {
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
      <path d="M4 19h5" />
      <path d="M4 19 8 5" />
      <path d="M8 5h12" />
    </svg>
  )
}

export function IconTable({ size = 16, className }: IconProps) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </svg>
  )
}

export function IconLink({ size = 16, className }: IconProps) {
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
      <path d="M10 13a4.5 4.5 0 0 0 6.36 0l1.42-1.42a4.5 4.5 0 0 0-6.36-6.36L10 6" />
      <path d="M14 11a4.5 4.5 0 0 0-6.36 0L6.22 12.4a4.5 4.5 0 0 0 6.36 6.36L14 18" />
    </svg>
  )
}

export function IconUndo({ size = 16, className }: IconProps) {
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
      <path d="M9 7H5v4" />
      <path d="M5 11c1.5-3 4.5-5 8-5a7 7 0 0 1 7 7" />
    </svg>
  )
}

export function IconRedo({ size = 16, className }: IconProps) {
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
      <path d="M15 7h4v4" />
      <path d="M19 11c-1.5-3-4.5-5-8-5a7 7 0 0 0-7 7" />
    </svg>
  )
}
