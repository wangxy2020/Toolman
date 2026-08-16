import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const communityInteractionStyles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetCard: {
    height: '72%',
    maxHeight: '78%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sheetClose: {
    fontSize: 24,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  sheetBody: {
    flex: 1,
    minHeight: 220,
  },
  sheetBodyContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  sheetError: {
    fontSize: 13,
    color: colors.danger,
  },
  sheetEmpty: {
    flexGrow: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  sheetEmptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  commentItem: {
    gap: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  commentHeadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commentTime: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  commentDelete: {
    fontSize: 12,
    color: colors.danger,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 14,
  },
  composerSubmit: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
  },
  composerSubmitPressed: {
    opacity: 0.85,
  },
  composerSubmitDisabled: {
    opacity: 0.45,
  },
  composerSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
})
