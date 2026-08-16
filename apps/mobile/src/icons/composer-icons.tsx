import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'

type IconProps = {
  size?: number
  color?: string
}

const stroke = (color: string, width = 1.8) => ({
  stroke: color,
  strokeWidth: width,
  fill: 'none' as const,
})

/** Mirrors desktop `IconPlus` (sidebar add / new topic). */
export function IconPlus({ size = 16, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="5" x2="12" y2="19" {...stroke(color, 2)} strokeLinecap="round" />
      <Line x1="5" y1="12" x2="19" y2="12" {...stroke(color, 2)} strokeLinecap="round" />
    </Svg>
  )
}

/** Mirrors desktop chat / navigation / action icons used by MessageInput. */
/** Mirrors desktop Lucide `GraduationCap` (start / stop class). */
export function IconGraduationCap({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"
        {...stroke(color)}
        strokeLinejoin="round"
      />
      <Path d="M22 10v6" {...stroke(color)} strokeLinecap="round" />
      <Path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" {...stroke(color)} strokeLinecap="round" />
    </Svg>
  )
}

export function IconNewTopic({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v5" {...stroke(color)} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9.5 5.5h5" {...stroke(color)} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M5 10v8a2 2 0 0 0 2 2h8l4 3v-3h1a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"
        {...stroke(color)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconPaperclip({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
        {...stroke(color)}
      />
    </Svg>
  )
}

/** Mirrors desktop `IconEmoji` (group chat toolbar). */
export function IconEmoji({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" {...stroke(color)} />
      <Path d="M8 14s1.5 2 4 2 4-2 4-2" {...stroke(color)} strokeLinecap="round" />
      <Line x1="9" y1="9" x2="9.01" y2="9" {...stroke(color, 2.4)} strokeLinecap="round" />
      <Line x1="15" y1="9" x2="15.01" y2="9" {...stroke(color, 2.4)} strokeLinecap="round" />
    </Svg>
  )
}

export function IconGlobe({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" {...stroke(color)} />
      <Line x1="2" y1="12" x2="22" y2="12" {...stroke(color)} />
      <Path
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        {...stroke(color)}
      />
    </Svg>
  )
}

export function IconKnowledgeTool({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" {...stroke(color)} />
      <Path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        {...stroke(color)}
      />
      <Line x1="8" y1="7" x2="16" y2="7" {...stroke(color)} />
      <Line x1="8" y1="11" x2="14" y2="11" {...stroke(color)} />
    </Svg>
  )
}

export function IconTerminalPrompt({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline
        points="5 7 9 12 5 17"
        {...stroke(color, 2)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1="11"
        y1="17"
        x2="19"
        y2="17"
        {...stroke(color, 2)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconShortcut({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" {...stroke(color)} />
    </Svg>
  )
}

export function IconClear({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6h18" {...stroke(color)} />
      <Path d="M8 6V4h8v2" {...stroke(color)} />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" {...stroke(color)} />
      <Line x1="10" y1="11" x2="10" y2="17" {...stroke(color)} />
      <Line x1="14" y1="11" x2="14" y2="17" {...stroke(color)} />
    </Svg>
  )
}

export function IconResizeHandle({ size = 12, color = '#8b8f96' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Path
        d="M4 0L10 6"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M7 0L10 3"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )
}

export function IconTranslate({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m5 8 6 6" {...stroke(color)} />
      <Path d="m4 14 6-6 2-3" {...stroke(color)} />
      <Path d="M2 5h12" {...stroke(color)} />
      <Path d="M7 2h1" {...stroke(color)} />
      <Path d="m22 22-5-10-5 10" {...stroke(color)} />
      <Path d="M14 18h6" {...stroke(color)} />
    </Svg>
  )
}

export function IconMic({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" {...stroke(color)} />
      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" {...stroke(color)} />
      <Line x1="12" y1="19" x2="12" y2="23" {...stroke(color)} />
      <Line x1="8" y1="23" x2="16" y2="23" {...stroke(color)} />
    </Svg>
  )
}

export function IconEye({
  size = 18,
  color = '#1a1a1a',
  hidden = false,
}: IconProps & { hidden?: boolean }) {
  if (hidden) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
          {...stroke(color)}
        />
        <Path
          d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
          {...stroke(color)}
        />
        <Line x1="1" y1="1" x2="23" y2="23" {...stroke(color)} />
      </Svg>
    )
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" {...stroke(color)} />
      <Circle cx="12" cy="12" r="3" {...stroke(color)} />
    </Svg>
  )
}

export function IconSend({ size = 18, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="19" x2="12" y2="5" {...stroke(color, 2)} />
      <Polyline points="5 12 12 5 19 12" {...stroke(color, 2)} />
    </Svg>
  )
}

export function IconCopy({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="9" y="9" width="13" height="13" rx="2" {...stroke(color)} />
      <Path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        {...stroke(color)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconTrashMsg({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="3 6 5 6 21 6" {...stroke(color)} />
      <Path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        {...stroke(color)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconRefresh({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 12a9 9 0 1 1-2.64-6.36" {...stroke(color)} strokeLinecap="round" />
      <Path d="M21 3v6h-6" {...stroke(color)} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function IconSaveNote({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        {...stroke(color)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline points="14 2 14 8 20 8" {...stroke(color)} />
      <Line x1="8" y1="13" x2="16" y2="13" {...stroke(color)} />
      <Line x1="8" y1="17" x2="13" y2="17" {...stroke(color)} />
    </Svg>
  )
}

export function IconSpeaker({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11 5 6 9H2v6h4l5 4V5z"
        {...stroke(color)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" {...stroke(color)} strokeLinecap="round" />
      <Path d="M19.07 4.93a10 10 0 0 1 0 14.14" {...stroke(color)} strokeLinecap="round" />
    </Svg>
  )
}

export function IconPause({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6" y="4" width="4" height="16" rx="1" {...stroke(color)} />
      <Rect x="14" y="4" width="4" height="16" rx="1" {...stroke(color)} />
    </Svg>
  )
}

export function IconPlay({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3v18l15-9L6 3z" {...stroke(color)} strokeLinejoin="round" />
    </Svg>
  )
}

export function IconStop({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="5" y="5" width="14" height="14" rx="1.5" {...stroke(color)} />
    </Svg>
  )
}

export function IconGitFork({ size = 18, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="6" cy="6" r="2.5" {...stroke(color)} />
      <Circle cx="6" cy="18" r="2.5" {...stroke(color)} />
      <Circle cx="18" cy="12" r="2.5" {...stroke(color)} />
      <Path d="M6 8.5v7" {...stroke(color)} />
      <Path d="M8.5 6h5a4.5 4.5 0 0 1 4.5 4.5V12" {...stroke(color)} />
    </Svg>
  )
}
