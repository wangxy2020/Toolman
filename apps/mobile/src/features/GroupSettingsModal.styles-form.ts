import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const groupSettingsFormStyles = StyleSheet.create({  dangerCard: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.04)',
  },
  dangerBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 6,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dangerBtnPressed: {
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  dangerBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    flexShrink: 0,
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
    opacity: 0.45,
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
  emptyBody: {
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  confirmDialog: {
    borderRadius: 12,
    backgroundColor: colors.bg,
    padding: 18,
    gap: 10,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  confirmMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  confirmDangerBtn: {
    backgroundColor: colors.danger,
  },
  confirmDangerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
})
