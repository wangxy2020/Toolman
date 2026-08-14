import { createElement, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'

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

export function SettingsSectionTitle(props: { children: string }) {
  return <Text style={fieldStyles.sectionTitle}>{props.children}</Text>
}

export function SettingsInfoRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={fieldStyles.infoRow}>
      <Text style={fieldStyles.infoLabel}>{props.label}</Text>
      <Text style={[fieldStyles.infoValue, props.mono ? fieldStyles.mono : null]} selectable>
        {props.value || '—'}
      </Text>
    </View>
  )
}

export function SettingsTextArea(props: {
  label?: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  editable?: boolean
  hint?: string
  minHeight?: number
}) {
  const minHeight = props.minHeight ?? 88
  const editable = props.editable !== false
  return (
    <View style={fieldStyles.block}>
      {props.label ? <Text style={fieldStyles.label}>{props.label}</Text> : null}
      <View
        style={[
          fieldStyles.textareaBox,
          { minHeight, height: minHeight },
          editable ? null : fieldStyles.textareaBoxReadonly,
        ]}
      >
        <TextInput
          style={[fieldStyles.textareaInput, { minHeight: minHeight - 16 }]}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textSecondary}
          editable={editable}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {props.hint ? <Text style={fieldStyles.hint}>{props.hint}</Text> : null}
    </View>
  )
}

/** Desktop `.tm-notes-settings-inline-btn`. */
export function SettingsInlineButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [fieldStyles.inlineBtn, pressed ? fieldStyles.inlineBtnPressed : null]}
    >
      <Text style={fieldStyles.inlineBtnText}>{props.label}</Text>
    </Pressable>
  )
}

export function SettingsChoiceRow(props: {
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
}) {
  return (
    <View style={fieldStyles.choiceList}>
      {props.options.map((option) => {
        const active = option.id === props.value
        return (
          <Pressable
            key={option.id}
            onPress={() => props.onChange(option.id)}
            style={[fieldStyles.choice, active ? fieldStyles.choiceActive : null]}
          >
            <Text style={[fieldStyles.choiceText, active ? fieldStyles.choiceTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
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

export const fieldStyles = StyleSheet.create({
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  infoRow: { gap: 4 },
  infoLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  infoValue: { fontSize: 14, color: colors.text, lineHeight: 20 },
  mono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
  },
  block: { gap: 6, width: '100%' },
  label: { fontSize: 13, fontWeight: '500', color: colors.text },
  hint: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  textareaBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  textareaBoxReadonly: {
    backgroundColor: colors.inputBg,
  },
  textareaInput: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: 'transparent',
    ...Platform.select({ web: { outlineWidth: 0 } as object, default: {} }),
  },
  inlineBtn: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineBtnPressed: {
    backgroundColor: colors.hover,
  },
  inlineBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceList: { gap: 6 },
  choice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  choiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceText: { fontSize: 13, color: colors.text },
  choiceTextActive: { color: colors.accent, fontWeight: '600' },
  sliderBlock: {
    gap: 8,
    paddingTop: 4,
    width: '100%',
  },
  sliderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    color: colors.textSecondary,
  },
  nativeTrackHit: {
    height: 24,
    justifyContent: 'center',
  },
  nativeTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.hover,
    overflow: 'hidden',
  },
  nativeFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  nativeThumb: {
    position: 'absolute',
    top: 5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
})
