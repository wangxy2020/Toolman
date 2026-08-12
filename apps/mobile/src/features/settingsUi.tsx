import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'

export function SettingsScroll(props: { children: ReactNode }) {
  return (
    <ScrollView
      style={settingsUiStyles.rightRoot}
      contentContainerStyle={settingsUiStyles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {props.children}
    </ScrollView>
  )
}

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <View style={settingsUiStyles.card}>
      <Text style={settingsUiStyles.sectionTitle}>{props.title}</Text>
      <View style={settingsUiStyles.sectionBody}>{props.children}</View>
    </View>
  )
}

export function Field(props: {
  label?: string
  value: string
  onChangeText: (value: string) => void
  secureTextEntry?: boolean
  placeholder?: string
}) {
  return (
    <View style={settingsUiStyles.field}>
      {props.label ? <Text style={settingsUiStyles.label}>{props.label}</Text> : null}
      <TextInput
        style={settingsUiStyles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secureTextEntry}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        underlineColorAndroid="transparent"
      />
    </View>
  )
}

export function Toggle(props: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Pressable
      style={[settingsUiStyles.toggle, props.value ? settingsUiStyles.toggleOn : null]}
      onPress={() => props.onChange(!props.value)}
    >
      <Text
        style={[
          settingsUiStyles.toggleLabel,
          props.value ? settingsUiStyles.toggleLabelOn : null,
        ]}
      >
        {props.label}
      </Text>
      <View
        style={[settingsUiStyles.switchTrack, props.value ? settingsUiStyles.switchTrackOn : null]}
      >
        <View
          style={[
            settingsUiStyles.switchThumb,
            props.value ? settingsUiStyles.switchThumbOn : null,
          ]}
        />
      </View>
    </Pressable>
  )
}

export function PrimaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable style={settingsUiStyles.btn} onPress={props.onPress}>
      <Text style={settingsUiStyles.btnText}>{props.label}</Text>
    </Pressable>
  )
}

export function SecondaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable style={settingsUiStyles.btnSecondary} onPress={props.onPress}>
      <Text style={settingsUiStyles.btnSecondaryText}>{props.label}</Text>
    </Pressable>
  )
}

export const settingsUiStyles = StyleSheet.create({
  rightRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
    maxWidth: 640,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  sectionBody: {
    gap: 12,
  },
  field: {
    gap: 6,
  },
  /** Desktop auth-panel aligned input (placeholder only, 42px height). */
  authInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 42,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 14,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  authSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  authCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    width: '100%',
  },
  authForm: {
    gap: 10,
    width: '100%',
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  otpInputGrow: {
    flex: 1,
    minWidth: 0,
  },
  otpSendBtn: {
    minHeight: 42,
    minWidth: 108,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  otpSendBtnDisabled: {
    opacity: 0.5,
  },
  otpSendBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  authSubmit: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  authSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  authFooterRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  authFooterMuted: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  authFooterLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  authInlineHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  socialBlock: {
    width: '100%',
    gap: 4,
    marginTop: 4,
  },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 6,
  },
  socialDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
  socialDividerText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  socialGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  socialBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialBtnDisabled: {
    opacity: 0.32,
    backgroundColor: colors.inputBg,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 42,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 14,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnSecondaryText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  toggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.inputBg,
  },
  toggleOn: {
    backgroundColor: colors.accentSoft,
    borderColor: '#b7e5d1',
  },
  toggleLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  toggleLabelOn: {
    color: colors.text,
  },
  switchTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d7dbe0',
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  hintOk: {
    color: colors.accent,
  },
  hintError: {
    color: colors.danger,
  },
  footerLinks: {
    gap: 8,
    marginTop: 4,
  },
  linkText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '500',
  },
  keyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  providerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  providerChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  providerChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  providerChipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  modelSuggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: '100%',
  },
  modelChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  modelChipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  modelChipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  dangerBtn: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  actionRowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inputBg,
  },
  actionRowTitle: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
})
