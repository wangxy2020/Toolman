import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import {
  IconKpiTrendDown,
  IconKpiTrendUp,
  ProjectKpiIcon,
} from '../icons/project-kpi-icons'
import {
  chunkRows,
  clampProgressPercent,
  formatProjectMoney,
  projectOverviewFlags,
  projectOverviewProgressCopy,
  projectSettlementRate,
  projectStatusLabel,
  type EpcProjectRecord,
  type ProjectInsightCard,
  type ProjectKpiCard,
  type ProjectStatsModel,
} from './projectStats'

export function ProjectKpiGrid({ cards }: { cards: ProjectKpiCard[] }) {
  return (
    <View style={styles.kpiGrid}>
      {chunkRows(cards, 3).map((row, rowIndex) => (
        <View key={`kpi-row-${rowIndex}`} style={styles.kpiRow}>
          {row.map((card) => (
            <View key={card.key} style={styles.kpiCard}>
              <View style={styles.kpiIcon}>
                <ProjectKpiIcon name={card.icon} size={18} color={colors.accent} />
              </View>
              <View style={styles.kpiContent}>
                <Text style={styles.kpiLabel} numberOfLines={1}>
                  {card.label}
                </Text>
                <Text style={styles.kpiValue} numberOfLines={1}>
                  {card.value}
                </Text>
                <View style={styles.kpiSubRow}>
                  <Text style={styles.kpiSub} numberOfLines={1}>
                    {card.sub}
                  </Text>
                  {card.trend ? (
                    <View style={styles.kpiTrend}>
                      {card.trend === 'up' ? (
                        <IconKpiTrendUp size={12} color="#16a34a" />
                      ) : (
                        <IconKpiTrendDown size={12} color="#dc2626" />
                      )}
                      {card.delta ? (
                        <Text
                          style={[
                            styles.kpiTrendText,
                            card.trend === 'up' ? styles.kpiTrendUp : styles.kpiTrendDown,
                          ]}
                          numberOfLines={1}
                        >
                          {card.delta}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
          {row.length < 3
            ? Array.from({ length: 3 - row.length }, (_, index) => (
                <View key={`kpi-spacer-${rowIndex}-${index}`} style={styles.kpiSpacer} />
              ))
            : null}
        </View>
      ))}
    </View>
  )
}

function ProjectOverviewCard(props: {
  project: EpcProjectRecord
  variant: 'cost' | 'progress'
}) {
  const { project, variant } = props
  const isCost = variant === 'cost'
  const settlementRate = projectSettlementRate(project)
  const { warnPending, warnStatus } = projectOverviewFlags(project)
  const progressCopy = projectOverviewProgressCopy(variant, project.progressPercent, settlementRate)
  const badgeTone =
    project.status === 'critical'
      ? styles.badgeCritical
      : project.status === 'warning'
        ? styles.badgeWarning
        : styles.badgeNormal
  const badgeTextTone =
    project.status === 'critical'
      ? styles.badgeTextCritical
      : project.status === 'warning'
        ? styles.badgeTextWarning
        : styles.badgeTextNormal

  return (
    <View style={styles.projectCard}>
      <View style={styles.projectHeader}>
        <View style={styles.projectTitleBlock}>
          <Text style={styles.projectCode}>{project.code}</Text>
          <Text style={styles.projectName} numberOfLines={1}>
            {project.name}
          </Text>
        </View>
        <View style={[styles.badge, badgeTone]}>
          <Text style={[styles.badgeText, badgeTextTone]}>{projectStatusLabel(project.status)}</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        {isCost ? (
          <>
            <Metric label="合同额" value={formatProjectMoney(project.contractValue)} />
            <Metric label="已结算" value={formatProjectMoney(project.settledAmount)} />
            <Metric
              label="待支付"
              value={formatProjectMoney(project.pendingAmount)}
              warn={warnPending}
            />
          </>
        ) : (
          <>
            <Metric label="计划进度" value={`${project.progressPercent}%`} />
            <Metric label="实际完成" value={`${settlementRate.toFixed(0)}%`} />
            <Metric label="里程碑" value={project.planPhase} warn={warnStatus} />
          </>
        )}
      </View>

      <View style={styles.progressMeta}>
        <Text style={styles.progressMetaText}>{progressCopy.left}</Text>
        <Text style={styles.progressMetaText}>{progressCopy.right}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${clampProgressPercent(project.progressPercent)}%` },
          ]}
        />
      </View>

      <View style={styles.projectMeta}>
        <Text style={styles.projectMetaText}>{project.region}</Text>
        <Text style={styles.projectMetaText}>{project.planPhase}</Text>
        <Text style={styles.projectMetaText}>{project.period}</Text>
      </View>
    </View>
  )
}

function Metric(props: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text
        style={[styles.metricValue, props.warn ? styles.metricValueWarn : null]}
        numberOfLines={1}
      >
        {props.value}
      </Text>
    </View>
  )
}

function InsightGrid({ cards }: { cards: ProjectInsightCard[] }) {
  if (cards.length === 0) return null
  return (
    <View style={styles.insightGrid}>
      {chunkRows(cards, 2).map((row, rowIndex) => (
        <View key={`insight-row-${rowIndex}`} style={styles.insightRow}>
          {row.map((card) => (
            <View key={card.key} style={styles.insightCard}>
              <Text style={styles.insightTitle}>{card.title}</Text>
              <Text style={styles.insightValue}>{card.value}</Text>
              <Text style={styles.insightDesc}>{card.desc}</Text>
            </View>
          ))}
          {row.length === 1 ? <View style={styles.projectSpacer} /> : null}
        </View>
      ))}
    </View>
  )
}

export function ProjectStatsBody({ stats }: { stats: ProjectStatsModel }) {
  if (stats.records.length === 0 && stats.kpis.length === 0) {
    return <Text style={styles.emptyHint}>{stats.emptyHint}</Text>
  }

  return (
    <View style={styles.body}>
      <Text style={styles.demoBanner}>演示数据，非真实工程进度。</Text>
      <ProjectKpiGrid cards={stats.kpis} />
      {stats.section ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{stats.section.title}</Text>
            <Text style={styles.sectionDesc}>{stats.section.desc}</Text>
          </View>
          {stats.records.length === 0 ? (
            <Text style={styles.emptyHint}>{stats.emptyHint}</Text>
          ) : (
            <View style={styles.projectGrid}>
              {chunkRows(stats.records.slice(0, 6), 2).map((row, rowIndex) => (
                <View key={`project-row-${rowIndex}`} style={styles.projectRow}>
                  {row.map((project) => (
                    <ProjectOverviewCard
                      key={project.id}
                      project={project}
                      variant={stats.variant}
                    />
                  ))}
                  {row.length === 1 ? <View style={styles.projectSpacer} /> : null}
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}
      <InsightGrid cards={stats.insights} />
    </View>
  )
}

const styles = StyleSheet.create({
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
