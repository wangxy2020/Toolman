import { Text, View } from 'react-native'
import {
  chunkRows,
  type ProjectStatsModel,
} from './projectStats'
import { InsightGrid, ProjectKpiGrid, ProjectOverviewCard } from './ProjectStatsKpi'
import { styles } from './ProjectStatsBodyStyles'

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

