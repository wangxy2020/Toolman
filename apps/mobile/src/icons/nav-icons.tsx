import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'

type IconProps = {
  size?: number
  color?: string
}

const strokeProps = (color: string) => ({
  stroke: color,
  strokeWidth: 1.8,
  fill: 'none' as const,
})

/** Mirrors desktop `components/icons/modules.tsx` + `nav-module-icons.tsx`. */
export function IconAgent({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="5" y="8" width="14" height="12" rx="3" {...strokeProps(color)} />
      <Circle cx="9.5" cy="13" r="1" fill={color} stroke="none" />
      <Circle cx="14.5" cy="13" r="1" fill={color} stroke="none" />
      <Path d="M9 17h6" {...strokeProps(color)} />
      <Path d="M12 8V5" {...strokeProps(color)} />
      <Circle cx="12" cy="4" r="1.5" fill={color} stroke="none" />
    </Svg>
  )
}

export function IconKnowledge({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" {...strokeProps(color)} />
      <Path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        {...strokeProps(color)}
      />
      <Line x1="8" y1="7" x2="16" y2="7" {...strokeProps(color)} />
      <Line x1="8" y1="11" x2="14" y2="11" {...strokeProps(color)} />
    </Svg>
  )
}

export function IconNotes({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...strokeProps(color)} />
      <Polyline points="14 2 14 8 20 8" {...strokeProps(color)} />
      <Line x1="8" y1="13" x2="16" y2="13" {...strokeProps(color)} />
      <Line x1="8" y1="17" x2="13" y2="17" {...strokeProps(color)} />
    </Svg>
  )
}

export function IconGroup({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="3" width="6" height="6" rx="1" {...strokeProps(color)} />
      <Rect x="15" y="3" width="6" height="6" rx="1" {...strokeProps(color)} />
      <Rect x="9" y="15" width="6" height="6" rx="1" {...strokeProps(color)} />
      <Path d="M6 9v3h6v3" {...strokeProps(color)} />
      <Path d="M18 9v3h-6v3" {...strokeProps(color)} />
    </Svg>
  )
}

export function IconCommunity({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" {...strokeProps(color)} />
      <Circle cx="9" cy="7" r="4" {...strokeProps(color)} />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" {...strokeProps(color)} />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...strokeProps(color)} />
    </Svg>
  )
}

export function IconTranslateNav({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m5 8 6 6" {...strokeProps(color)} />
      <Path d="m4 14 6-6 2-3" {...strokeProps(color)} />
      <Path d="M2 5h12" {...strokeProps(color)} />
      <Path d="M7 2h1" {...strokeProps(color)} />
      <Path d="m22 22-5-10-5 10" {...strokeProps(color)} />
      <Path d="M14 18h6" {...strokeProps(color)} />
    </Svg>
  )
}

export function IconClassroom({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 10 12 5 2 10l10 5 10-5Z" {...strokeProps(color)} />
      <Path d="M6 12v5c0 1.8 2.7 3.2 6 3.2s6-1.4 6-3.2v-5" {...strokeProps(color)} />
      <Path d="M22 10v6" {...strokeProps(color)} />
    </Svg>
  )
}

export function IconProjects({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="4" width="18" height="16" rx="2" {...strokeProps(color)} />
      <Line x1="3" y1="10" x2="21" y2="10" {...strokeProps(color)} />
      <Line x1="9" y1="4" x2="9" y2="20" {...strokeProps(color)} />
    </Svg>
  )
}

export function IconPanelLeft({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="4" width="18" height="16" rx="2" {...strokeProps(color)} />
      <Line x1="9" y1="4" x2="9" y2="20" {...strokeProps(color)} />
    </Svg>
  )
}

/** Horizontal three-dot overflow / more menu. */
export function IconMoreHorizontal({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5" cy="12" r="1.6" fill={color} stroke="none" />
      <Circle cx="12" cy="12" r="1.6" fill={color} stroke="none" />
      <Circle cx="19" cy="12" r="1.6" fill={color} stroke="none" />
    </Svg>
  )
}

export function IconUser({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...strokeProps(color)} />
      <Circle cx="12" cy="7" r="4" {...strokeProps(color)} />
    </Svg>
  )
}
