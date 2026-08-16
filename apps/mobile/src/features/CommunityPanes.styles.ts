import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const communityPaneStyles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    paddingBottom: 28,
    paddingTop: 4,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  readonlyHint: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  identityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  identityBadge: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.hover,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  feedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  feedMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})
