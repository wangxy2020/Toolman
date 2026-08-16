import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const groupSharedPaneStyles = StyleSheet.create({
  agentSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  agentChevron: {
    width: 14,
    fontSize: 14,
    color: colors.textSecondary,
  },
  agentHeading: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  agentEmpty: {
    paddingHorizontal: 34,
    paddingBottom: 12,
    fontSize: 12,
    color: colors.textSecondary,
  },
  agentTopic: {
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.hover,
    gap: 2,
  },
  closeText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  readerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  readerDialog: {
    maxHeight: '80%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 16,
    gap: 12,
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  readerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  readerBody: {
    maxHeight: 360,
  },
  readerBodyContent: {
    gap: 10,
    paddingBottom: 8,
  },
  readerLink: {
    fontSize: 13,
    color: colors.accent,
  },
  readerInput: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  readerSave: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
  },
  activityEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 200,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  activityMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  activityMessage: {
    fontSize: 14,
    color: colors.text,
  },
  activityMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  activityTime: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})
