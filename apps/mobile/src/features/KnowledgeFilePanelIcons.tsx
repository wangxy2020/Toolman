import Svg, { Line, Path, Polyline, Rect } from 'react-native-svg'
import { colors } from '../theme'

type IconProps = { size?: number; color?: string }

export function IconFile({ size = 18, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
      />
      <Path d="M14 2v6h6" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  )
}

export function IconGlobe({ size = 18, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="3" width="18" height="18" rx="9" stroke={color} strokeWidth={1.8} fill="none" />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
      />
    </Svg>
  )
}

export function IconTrash({ size = 16, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconRefresh({ size = 16, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 12a9 9 0 1 1-2.64-6.36" stroke={color} strokeWidth={1.8} fill="none" />
      <Path d="M21 3v6h-6" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  )
}

export function IconCheck({ size = 14, color = '#16a34a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline
        points="20 6 9 17 4 12"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
