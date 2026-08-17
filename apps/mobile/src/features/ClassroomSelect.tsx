import { createElement, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import { colors } from '../theme'

const SELECT_STYLE_ID = 'toolman-mobile-classroom-select'

export type ClassroomSelectOption = { id: string; label: string }

function ensureSelectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SELECT_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SELECT_STYLE_ID
  style.textContent = `
.tm-mobile-classroom-select {
  display: block;
  width: 100%;
  min-height: 38px;
  border: 1px solid ${colors.border};
  border-radius: 6px;
  background-color: ${colors.bg};
  color: ${colors.text};
  font-size: 14px;
  font-family: inherit;
  line-height: 20px;
  padding: 6px 32px 6px 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b8f96' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: calc(100% - 10px) center;
  cursor: pointer;
}
.tm-mobile-classroom-select:focus {
  border-color: ${colors.accent};
  box-shadow: 0 0 0 1px ${colors.accent};
}
.tm-mobile-classroom-select:disabled {
  background-color: ${colors.hover};
  color: ${colors.textSecondary};
  cursor: default;
}
`
  document.head.appendChild(style)
}

function matchSelectValue(value: string, options: ClassroomSelectOption[]): string {
  if (options.some((option) => option.id === value)) return value
  if (!value.trim()) return ''
  return options.find((option) => option.id.endsWith(`:${value}`))?.id ?? value
}

function optionLabel(value: string, options: ClassroomSelectOption[]): string {
  const id = matchSelectValue(value, options)
  return options.find((option) => option.id === id)?.label ?? options[0]?.label ?? ''
}

export function ClassroomSelect(props: {
  value: string
  options: ClassroomSelectOption[]
  disabled?: boolean
  accessibilityLabel?: string
  onChange: (id: string) => void
}) {
  const value = matchSelectValue(props.value, props.options)
  if (Platform.OS === 'web') {
    ensureSelectStyles()
    return createElement(
      'select',
      {
        className: 'tm-mobile-classroom-select',
        value,
        disabled: props.disabled,
        'aria-label': props.accessibilityLabel,
        onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
      },
      props.options.map((option) =>
        createElement(
          'option',
          { key: option.id || '__default__', value: option.id },
          option.label,
        ),
      ),
    )
  }

  return (
    <ClassroomSelectNative
      value={value}
      options={props.options}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
      onChange={props.onChange}
    />
  )
}

function ClassroomSelectNative(props: {
  value: string
  options: ClassroomSelectOption[]
  disabled?: boolean
  accessibilityLabel?: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const label = optionLabel(props.value, props.options)
  return (
    <>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={props.accessibilityLabel}
        accessibilityState={{ disabled: Boolean(props.disabled), expanded: open }}
        disabled={props.disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, props.disabled ? styles.fieldDisabled : null]}
      >
        <Text style={[styles.value, props.disabled ? styles.valueDisabled : null]} numberOfLines={1}>
          {label}
        </Text>
        <Svg width={12} height={12} viewBox="0 0 24 24">
          <Polyline
            points="6 9 12 15 18 9"
            fill="none"
            stroke={colors.textSecondary}
            strokeWidth={2}
          />
        </Svg>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {props.options.map((option) => {
                const active = option.id === props.value
                return (
                  <Pressable
                    key={option.id || '__default__'}
                    onPress={() => {
                      props.onChange(option.id)
                      setOpen(false)
                    }}
                    style={[styles.option, active ? styles.optionActive : null]}
                  >
                    <Text
                      style={[styles.optionText, active ? styles.optionTextActive : null]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  field: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 6,
    backgroundColor: colors.bg,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  fieldDisabled: { backgroundColor: colors.hover },
  value: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  valueDisabled: { color: colors.textSecondary },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  menu: {
    maxHeight: '70%',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionActive: { backgroundColor: colors.accentSoft },
  optionText: { fontSize: 14, color: colors.text },
  optionTextActive: { color: colors.accent, fontWeight: '600' },
})
