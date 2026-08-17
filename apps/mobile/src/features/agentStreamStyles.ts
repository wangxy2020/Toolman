import { StyleSheet } from 'react-native'
import { colors } from '../theme'
import { STREAM_AVATAR_INDENT, STREAM_PAD_SIDE } from './agentPaneUtils'

export const agentStreamStyles = StyleSheet.create({
  streamScroll: {
    flex: 1,
  },
  streamContent: {
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 22,
    flexGrow: 1,
  },
  msgBlock: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  msgHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
    minWidth: 0,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarUser: {
    backgroundColor: '#e8f0fe',
  },
  avatarAssistant: {
    backgroundColor: colors.accentSoft,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  avatarTextUser: {
    color: '#1a73e8',
  },
  avatarTextAssistant: {
    color: colors.accent,
  },
  msgMeta: {
    minWidth: 0,
    flex: 1,
  },
  msgName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  msgTime: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    alignSelf: 'stretch',
    paddingLeft: STREAM_AVATAR_INDENT,
    minWidth: 0,
  },
  msgRowUser: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
  },
  msgRowAssistant: {
    alignSelf: 'stretch',
  },
  selectHit: {
    width: 28,
    height: 28,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBoxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    maxWidth: '100%',
  },
  bubbleUser: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: colors.accentSoft,
  },
  bubbleUserSelected: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  bubbleAssistant: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleAssistantSelected: {
    borderColor: colors.accent,
    backgroundColor: '#f3fbf7',
  },
  streamBody: {
    gap: 0,
  },
  streamBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  streamCursorSlot: {
    marginLeft: 2,
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: 8,
    paddingTop: 4,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: colors.accentSoft,
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  translationBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  translationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  actionsPlaceholder: {
    height: 34,
    marginTop: 8,
  },
  error: {
    color: colors.danger,
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingBottom: 6,
    fontSize: 12,
  },
  hint: {
    color: colors.accent,
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingBottom: 6,
    fontSize: 12,
  },
})
