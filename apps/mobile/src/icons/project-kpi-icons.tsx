import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg'

/** Lucide-style names used by desktop `DashboardKpiCards` / domain KPI grids. */
export type ProjectKpiIconName =
  | 'building'
  | 'dollar'
  | 'wallet'
  | 'trending'
  | 'layers'
  | 'alert'
  | 'shield'
  | 'target'
  | 'clipboard'
  | 'calendar'
  | 'check'
  | 'ban'
  | 'list'
  | 'handshake'
  | 'file'
  | 'folder'
  | 'archive'

type IconProps = {
  size?: number
  color?: string
}

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 2,
  fill: 'none' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconKpiBuilding({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" {...stroke(color)} />
      <Path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" {...stroke(color)} />
      <Path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" {...stroke(color)} />
      <Path d="M10 6h4" {...stroke(color)} />
      <Path d="M10 10h4" {...stroke(color)} />
      <Path d="M10 14h4" {...stroke(color)} />
      <Path d="M10 18h4" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiDollar({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" {...stroke(color)} />
      <Path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" {...stroke(color)} />
      <Path d="M12 18V6" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiWallet({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"
        {...stroke(color)}
      />
      <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiTrending({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" {...stroke(color)} />
      <Polyline points="16 7 22 7 22 13" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiLayers({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
        {...stroke(color)}
      />
      <Path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" {...stroke(color)} />
      <Path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiAlert({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
        {...stroke(color)}
      />
      <Path d="M12 9v4" {...stroke(color)} />
      <Path d="M12 17h.01" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiShield({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" {...stroke(color)} />
      <Path d="M12 8v4" {...stroke(color)} />
      <Path d="M12 16h.01" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiTarget({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" {...stroke(color)} />
      <Circle cx="12" cy="12" r="6" {...stroke(color)} />
      <Circle cx="12" cy="12" r="2" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiClipboard({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="8" y="2" width="8" height="4" rx="1" {...stroke(color)} />
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" {...stroke(color)} />
      <Path d="M12 11h4" {...stroke(color)} />
      <Path d="M12 16h4" {...stroke(color)} />
      <Path d="M8 11h.01" {...stroke(color)} />
      <Path d="M8 16h.01" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiCalendar({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 2v4" {...stroke(color)} />
      <Path d="M16 2v4" {...stroke(color)} />
      <Rect x="3" y="4" width="18" height="18" rx="2" {...stroke(color)} />
      <Path d="M3 10h18" {...stroke(color)} />
      <Path d="m9 16 2 2 4-4" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiCheck({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="5" width="6" height="6" rx="1" {...stroke(color)} />
      <Path d="m3 17 2 2 4-4" {...stroke(color)} />
      <Path d="M13 6h8" {...stroke(color)} />
      <Path d="M13 12h8" {...stroke(color)} />
      <Path d="M13 18h8" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiBan({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" {...stroke(color)} />
      <Path d="m4.9 4.9 14.2 14.2" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiList({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 5h8" {...stroke(color)} />
      <Path d="M13 12h8" {...stroke(color)} />
      <Path d="M13 19h8" {...stroke(color)} />
      <Path d="m3 17 2 2 4-4" {...stroke(color)} />
      <Rect x="3" y="4" width="6" height="6" rx="1" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiHandshake({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m11 17 2 2a1 1 0 1 0 3-3" {...stroke(color)} />
      <Path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" {...stroke(color)} />
      <Path d="m21 3 1 11h-2" {...stroke(color)} />
      <Path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" {...stroke(color)} />
      <Path d="M3 4h8" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiFile({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" {...stroke(color)} />
      <Path d="M14 2v4a2 2 0 0 0 2 2h4" {...stroke(color)} />
      <Path d="M10 9H8" {...stroke(color)} />
      <Path d="M16 13H8" {...stroke(color)} />
      <Path d="M16 17H8" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiFolder({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2A2 2 0 0 0 12.07 6H20a2 2 0 0 1 2 2v2" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiArchive({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="2" y="3" width="20" height="5" rx="1" {...stroke(color)} />
      <Path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" {...stroke(color)} />
      <Path d="M10 12h4" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiTrendUp({ size = 12, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 7h10v10" {...stroke(color)} />
      <Path d="M7 17 17 7" {...stroke(color)} />
    </Svg>
  )
}

export function IconKpiTrendDown({ size = 12, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 7v10h10" {...stroke(color)} />
      <Path d="m17 7-10 10" {...stroke(color)} />
    </Svg>
  )
}

const KPI_ICONS: Record<
  ProjectKpiIconName,
  (props: IconProps) => ReturnType<typeof IconKpiBuilding>
> = {
  building: IconKpiBuilding,
  dollar: IconKpiDollar,
  wallet: IconKpiWallet,
  trending: IconKpiTrending,
  layers: IconKpiLayers,
  alert: IconKpiAlert,
  shield: IconKpiShield,
  target: IconKpiTarget,
  clipboard: IconKpiClipboard,
  calendar: IconKpiCalendar,
  check: IconKpiCheck,
  ban: IconKpiBan,
  list: IconKpiList,
  handshake: IconKpiHandshake,
  file: IconKpiFile,
  folder: IconKpiFolder,
  archive: IconKpiArchive,
}

export function ProjectKpiIcon(props: { name: ProjectKpiIconName } & IconProps) {
  const Icon = KPI_ICONS[props.name]
  return <Icon size={props.size} color={props.color} />
}
