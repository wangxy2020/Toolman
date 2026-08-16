import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const communityPublishModalStyles = StyleSheet.create({
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
    flex: 1,
    minWidth: 0,
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
  optional: {
    fontWeight: '400',
    color: colors.textSecondary,
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
    minHeight: 88,
    textAlignVertical: 'top',
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  listHeader: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sourceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    gap: 4,
    backgroundColor: colors.surface,
  },
  sourceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sourceUrl: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  sourceActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  sourceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.hover,
  },
  sourceBtnText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
  sourceBtnDanger: {
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
    minWidth: 72,
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
