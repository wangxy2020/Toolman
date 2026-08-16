import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  demoBanner: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  kpiGrid: {
    gap: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: 0,
    height: 88,
    maxHeight: 88,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  kpiSpacer: {
    flex: 1,
    minWidth: 0,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.hover,
    flexShrink: 0,
  },
  kpiContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kpiLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 24,
  },
  kpiSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  kpiSub: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: colors.textSecondary,
  },
  kpiTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  kpiTrendText: {
    fontSize: 11,
    fontWeight: '500',
  },
  kpiTrendUp: {
    color: '#16a34a',
  },
  kpiTrendDown: {
    color: '#dc2626',
  },
  section: {
    gap: 10,
  },
  sectionHead: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sectionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  projectGrid: {
    gap: 12,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  projectCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 168,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 10,
  },
  projectSpacer: {
    flex: 1,
    minWidth: 0,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  projectTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  projectCode: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeNormal: {
    backgroundColor: colors.accentSoft,
  },
  badgeWarning: {
    backgroundColor: 'rgba(217,119,6,0.14)',
  },
  badgeCritical: {
    backgroundColor: 'rgba(220,38,38,0.12)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeTextNormal: {
    color: colors.accent,
  },
  badgeTextWarning: {
    color: '#b45309',
  },
  badgeTextCritical: {
    color: '#b91c1c',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricItem: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  metricValueWarn: {
    color: '#b45309',
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.hover,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  projectMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  projectMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  insightGrid: {
    gap: 12,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  insightCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.hover,
    gap: 4,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  insightValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  insightDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
})
