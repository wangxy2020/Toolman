import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg'

type IconProps = {
  size?: number
  color?: string
  filled?: boolean
}

const stroke = (color: string, width = 1.8) => ({
  stroke: color,
  strokeWidth: width,
  fill: 'none' as const,
})

export function IconMessageBoard({ size = 18, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...stroke(color)} />
      <Path d="M8 10h8" {...stroke(color)} />
      <Path d="M8 14h5" {...stroke(color)} />
    </Svg>
  )
}

export function IconNews({ size = 18, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"
        {...stroke(color)}
      />
      <Path d="M18 14h-8" {...stroke(color)} />
      <Path d="M15 18h-5" {...stroke(color)} />
      <Path d="M10 6h8v4h-8V6Z" {...stroke(color)} />
    </Svg>
  )
}

export function IconTaskList({ size = 18, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="5" width="5" height="5" rx="1" {...stroke(color)} />
      <Path d="M5 7.5 4 8.5l1 1" {...stroke(color)} />
      <Line x1="11" y1="7.5" x2="20" y2="7.5" {...stroke(color)} />
      <Rect x="3" y="14" width="5" height="5" rx="1" {...stroke(color)} />
      <Line x1="11" y1="16.5" x2="20" y2="16.5" {...stroke(color)} />
    </Svg>
  )
}

export function IconKnowledge({ size = 18, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" {...stroke(color)} />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" {...stroke(color)} />
      <Line x1="8" y1="7" x2="16" y2="7" {...stroke(color)} />
      <Line x1="8" y1="11" x2="14" y2="11" {...stroke(color)} />
    </Svg>
  )
}

export function IconMcp({ size = 18, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="3" width="7" height="7" rx="1" {...stroke(color)} />
      <Rect x="14" y="3" width="7" height="7" rx="1" {...stroke(color)} />
      <Rect x="3" y="14" width="7" height="7" rx="1" {...stroke(color)} />
      <Rect x="14" y="14" width="7" height="7" rx="1" {...stroke(color)} />
    </Svg>
  )
}

export function IconSkill({ size = 18, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"
        {...stroke(color)}
      />
    </Svg>
  )
}

export function IconWorkflow({ size = 18, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v4" {...stroke(color)} />
      <Path d="M12 17v4" {...stroke(color)} />
      <Path d="M3 12h4" {...stroke(color)} />
      <Path d="M17 12h4" {...stroke(color)} />
      <Circle cx="12" cy="12" r="3.5" {...stroke(color)} />
    </Svg>
  )
}

export function IconThumbUp({ size = 14, color = '#8b8f96', filled = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
        stroke={color}
        strokeWidth="1.8"
        fill={filled ? color : 'none'}
      />
    </Svg>
  )
}

export function IconThumbDown({ size = 14, color = '#8b8f96', filled = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
        stroke={color}
        strokeWidth="1.8"
        fill={filled ? color : 'none'}
      />
    </Svg>
  )
}

export function IconComment({ size = 14, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" {...stroke(color)} />
    </Svg>
  )
}

export function IconStar({ size = 14, color = '#8b8f96', filled = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        stroke={color}
        strokeWidth="1.8"
        fill={filled ? color : 'none'}
      />
    </Svg>
  )
}

export function IconShare({ size = 14, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="18" cy="5" r="3" {...stroke(color)} />
      <Circle cx="6" cy="12" r="3" {...stroke(color)} />
      <Circle cx="18" cy="19" r="3" {...stroke(color)} />
      <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" {...stroke(color)} />
      <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" {...stroke(color)} />
    </Svg>
  )
}

export function IconFlag({ size = 14, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 22V4a1 1 0 0 1 1-1h1v19" {...stroke(color)} />
      <Path d="M5 5h11l-2 4 2 4H5" {...stroke(color)} />
    </Svg>
  )
}

export function IconDownload({ size = 14, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...stroke(color)} />
      <Polyline points="7 10 12 15 17 10" {...stroke(color)} />
      <Line x1="12" y1="15" x2="12" y2="3" {...stroke(color)} />
    </Svg>
  )
}
