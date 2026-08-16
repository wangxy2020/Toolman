import { Text, View } from 'react-native'
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
} from './projectStats'
import { styles } from './ProjectStatsBodyStyles'

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

export function ProjectOverviewCard(props: {
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

export function InsightGrid({ cards }: { cards: ProjectInsightCard[] }) {
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

