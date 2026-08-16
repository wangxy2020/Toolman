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
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailBackBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  detailBackBtnPressed: {
    backgroundColor: colors.borderLight,
  },
  detailBackText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  detailScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 12,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 30,
    color: colors.text,
  },
  detailMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  detailStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailStat: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  detailError: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  detailCover: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: colors.hover,
  },
  detailBody: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  detailLoadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLinkBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
  },
  detailLinkBtnPressed: {
    opacity: 0.85,
  },
  detailLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  detailFootnote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 8,
  },
  detailActionsWrap: {
    marginHorizontal: -20,
    marginTop: 8,
  },
})
