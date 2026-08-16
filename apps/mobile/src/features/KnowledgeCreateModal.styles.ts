import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const knowledgeCreateModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  dialog: {
    maxHeight: '88%',
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  body: {
    maxHeight: 420,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  required: {
    color: colors.danger,
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  textarea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 2,
  },
  kindOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kindOptionPressed: {
    opacity: 0.78,
  },
  kindRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#b5b7bb',
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindRadioActive: {
    borderColor: colors.accent,
  },
  kindRadioDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  kindLabel: {
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  error: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: {
    backgroundColor: colors.hover,
  },
  footerBtnPrimary: {
    backgroundColor: colors.accent,
  },
  footerBtnPressed: {
    opacity: 0.88,
  },
  footerBtnDisabled: {
    opacity: 0.55,
  },
  footerBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  footerBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
})
