import { StyleSheet } from 'react-native'
import { colors } from '../theme'
import { STREAM_PAD_SIDE } from './groupPaneUtils'

export const groupPaneStyles = StyleSheet.create({
  groupBlock: {
    marginBottom: 2,
  },
  groupRow: {
    marginHorizontal: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupRowActive: {
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 22,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHitPressed: {
    opacity: 0.7,
  },
  chevron: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.textSecondary,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  groupNameHit: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  groupNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  subItem: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
  },
  subItemActive: {
    backgroundColor: colors.accentSoft,
  },
  subItemPressed: {
    backgroundColor: colors.hover,
  },
  subItemLabel: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  subItemLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
  emptyPane: {
    flex: 1,
    padding: 24,
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  streamScroll: {
    flex: 1,
  },
  popupDismiss: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  streamContent: {
    paddingHorizontal: STREAM_PAD_SIDE,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 14,
  },
  bubbleWrap: {
    maxWidth: '88%',
    gap: 4,
  },
  bubbleWrapOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleWrapPeer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleMeta: {
    gap: 2,
  },
  bubbleMetaOwn: {
    alignItems: 'flex-end',
  },
  bubbleRole: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  bubbleTime: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  bubbleBody: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleBodyOwn: {
    backgroundColor: colors.accentSoft,
  },
  bubbleBodyPeer: {
    backgroundColor: colors.hover,
  },
  attachmentLabel: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  actionsOwn: {
    justifyContent: 'flex-end',
  },
  actionBtn: {
    paddingVertical: 2,
  },
  actionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionLabelActive: {
    color: colors.accent,
  },
})
