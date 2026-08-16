import { createElement, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { colors } from '../theme'
import { fieldStyles } from './settingsModalFields.styles'

const SLIDER_STYLE_ID = 'toolman-mobile-settings-slider'

function ensureSliderStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SLIDER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SLIDER_STYLE_ID
  style.textContent = `
.tm-mobile-settings-slider {
  width: 100%;
  height: 6px;
  margin: 8px 0;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: color-mix(in srgb, ${colors.hover} 80%, ${colors.border});
  cursor: pointer;
  accent-color: ${colors.accent};
}
.tm-mobile-settings-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: ${colors.accent};
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.tm-mobile-settings-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: ${colors.accent};
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
`
  document.head.appendChild(style)
}

function NativeRangeSlider(props: {
  label: string
  value: number
  unit?: string
  min: number
  max: number
  ratio: number
  onChange: (value: number) => void
}) {
  const [trackWidth, setTrackWidth] = useState(0)
  const setFromX = (x: number) => {
    if (trackWidth <= 0) return
    const ratio = Math.min(1, Math.max(0, x / trackWidth))
    props.onChange(props.min + ratio * (props.max - props.min))
  }

  return (
    <View style={fieldStyles.sliderBlock}>
      <View style={fieldStyles.sliderHead}>
        <Text style={fieldStyles.label}>{props.label}</Text>
        <Text style={fieldStyles.sliderValue}>
          {props.value}
          {props.unit ?? ''}
        </Text>
      </View>
      <Pressable
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        onPress={(event) => setFromX(event.nativeEvent.locationX)}
        style={fieldStyles.nativeTrackHit}
      >
        <View style={fieldStyles.nativeTrack}>
          <View style={[fieldStyles.nativeFill, { width: `${Math.round(props.ratio * 100)}%` }]} />
        </View>
        <View
          style={[
            fieldStyles.nativeThumb,
            { left: Math.max(0, props.ratio * trackWidth - 7) },
          ]}
        />
      </Pressable>
    </View>
  )
}

/** Desktop `.tm-notes-settings-slider` (10–30px font size, etc.). */
export function SettingsRangeSlider(props: {
  label: string
  value: number
  unit?: string
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const clamp = (next: number) => Math.min(props.max, Math.max(props.min, Math.round(next)))
  const ratio = (props.value - props.min) / (props.max - props.min || 1)

  if (Platform.OS === 'web') {
    ensureSliderStyles()
    return (
      <View style={fieldStyles.sliderBlock}>
        <View style={fieldStyles.sliderHead}>
          <Text style={fieldStyles.label}>{props.label}</Text>
          <Text style={fieldStyles.sliderValue}>
            {props.value}
            {props.unit ?? ''}
          </Text>
        </View>
        {createElement('input', {
          type: 'range',
          className: 'tm-mobile-settings-slider',
          min: props.min,
          max: props.max,
          value: props.value,
          onInput: (event: { target: { value: string } }) => {
            props.onChange(clamp(Number(event.target.value)))
          },
          onChange: (event: { target: { value: string } }) => {
            props.onChange(clamp(Number(event.target.value)))
          },
        })}
      </View>
    )
  }

  return (
    <NativeRangeSlider
      label={props.label}
      value={props.value}
      unit={props.unit}
      min={props.min}
      max={props.max}
      ratio={ratio}
      onChange={(next) => props.onChange(clamp(next))}
    />
  )
}
