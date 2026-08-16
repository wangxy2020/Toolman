import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const groupPagePanelStyles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelHeading: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
    color: colors.text,
  },
  panelSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    color: colors.textSecondary,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  inviteBtnPressed: {
    backgroundColor: colors.hover,
  },
  inviteBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    gap: 8,
    paddingBottom: 12,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  memberMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  memberYou: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  memberDevice: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  memberDeviceOnline: {
    color: '#16a34a',
  },
  memberEnd: {
    alignItems: 'flex-end',
    gap: 4,
  },
  memberRole: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.hover,
    color: colors.textSecondary,
  },
  memberRoleOwner: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  memberStatus: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  memberStatusOnline: {
    color: colors.accent,
  },
  dropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.hover,
  },
  dropzonePressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dropTitle: {
    fontSize: 13,
    color: colors.text,
  },
  dropHint: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sharedCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 4,
  },
  sharedCardPressed: {
    backgroundColor: colors.hover,
  },
  sharedName: {
    fontSize: 14,
    color: colors.text,
  },
  sharedMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})
