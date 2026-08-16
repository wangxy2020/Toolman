import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const settingsUiControlStyles = StyleSheet.create({
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
