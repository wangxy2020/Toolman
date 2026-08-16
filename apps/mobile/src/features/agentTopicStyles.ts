import { StyleSheet } from 'react-native'
import { colors } from '../theme'

/** Align layout with notes sidebar (`ModulePanesNotesStyles`). */
export const agentTopicStyles = StyleSheet.create({
  title: {
    fontWeight: '400',
  },
  group: {
    marginBottom: 2,
  },
  agentTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /** Match desktop `.tm-assistant-action-btn` / notes trailing +. */
  actionBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  actionBtnPressed: {
    borderColor: colors.accent,
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
  sectionName: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  sectionNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  sectionBody: {
    paddingBottom: 2,
  },
  sectionEmpty: {
    marginLeft: 34,
    marginRight: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
  },
  topicSwipe: {
    marginLeft: 28,
  },
  agentRenameWrap: {
    marginHorizontal: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.hover,
  },
  renameWrap: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  renameWrapActive: {
    backgroundColor: colors.accentSoft,
  },
  renameInput: {
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    color: colors.text,
  },
})
