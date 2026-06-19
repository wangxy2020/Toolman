export type ModelTypeIconKey = 'vision' | 'web' | 'reasoning' | 'tools' | 'rerank' | 'embedding'

interface Props {
  type: ModelTypeIconKey
  size?: number
  className?: string
}

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }
}

export function ModelTypeIcon({ type, size = 14, className }: Props) {
  switch (type) {
    case 'vision':
      return (
        <svg {...svgProps(size, className)}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'web':
      return (
        <svg {...svgProps(size, className)}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )
    case 'reasoning':
      return (
        <svg {...svgProps(size, className)}>
          <path d="M12 3l1.2 4.2L17 7l-3.8 1.8L12 13l-1.2-4.2L7 7l3.8-1.8L12 3z" />
          <path d="M19 14l.7 2.3L22 17l-2.3 1-.7 2.3-.7-2.3L16 17l2.3-1 .7-2.3z" />
        </svg>
      )
    case 'tools':
      return (
        <svg {...svgProps(size, className)}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      )
    case 'rerank':
      return (
        <svg {...svgProps(size, className)}>
          <path d="M4 6h13" />
          <path d="M4 12h10" />
          <path d="M4 18h7" />
          <path d="M18 8l3 4-3 4" />
          <path d="M21 12H14" />
        </svg>
      )
    case 'embedding':
      return (
        <svg {...svgProps(size, className)}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      )
  }
}
