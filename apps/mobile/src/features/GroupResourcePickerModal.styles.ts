import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const groupResourcePickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dialog: {
    maxHeight: '86%',
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
    borderBottomColor: colors.borderLight,
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
    maxHeight: 380,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
  },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.hover,
  },
  checkHit: {
    padding: 2,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#b5b7bb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  checkOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkPartial: {
    borderColor: colors.accent,
  },
  checkMark: {
    fontSize: 12,
    lineHeight: 14,
    color: '#fff',
    fontWeight: '700',
  },
  checkDash: {
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  groupNameHit: {
    flex: 1,
    minWidth: 0,
  },
  groupName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  groupMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 18,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  noItems: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  footerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnGhost: {
    backgroundColor: colors.hover,
  },
  footerBtnPrimary: {
    backgroundColor: colors.accent,
  },
  footerBtnPressed: {
    opacity: 0.88,
  },
  footerBtnDisabled: {
    opacity: 0.45,
  },
  footerBtnGhostText: {
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
