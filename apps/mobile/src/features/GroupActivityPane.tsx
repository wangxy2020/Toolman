import { ScrollView, Text, View } from 'react-native'
import { shortDeviceId, type GroupActivity } from '../storage/groupChat'
import { formatActivityRelativeTime } from './groupActivity'
import { GroupPanelHeader } from './GroupPanelHeader'
import { groupPagePanelStyles as styles } from './groupPagePanelStyles'
import { groupSharedPaneStyles as sharedStyles } from './groupSharedPaneStyles'
import { useGroupActivityPane } from './useGroupPagePanels'

export function GroupActivityPane(props: {
  groupName: string
  events: GroupActivity[]
}) {
  const { now, sorted } = useGroupActivityPane(props.events)

  return (
    <View style={styles.panelRoot}>
      <GroupPanelHeader
        title="群组活动记录"
        subtitle={`${props.groupName} · ${sorted.length} 条记录`}
      />
      {sorted.length === 0 ? (
        <View style={sharedStyles.activityEmpty}>
          <Text style={styles.emptyTitle}>暂无活动记录</Text>
          <Text style={styles.emptyHint}>创建群组、加入成员等操作会显示在这里</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelScrollContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {sorted.map((event) => (
            <View key={event.id} style={sharedStyles.activityCard}>
              <View style={sharedStyles.activityMain}>
                <Text style={sharedStyles.activityMessage}>{event.message}</Text>
                <Text style={sharedStyles.activityMeta}>
                  #{event.seq} · {event.resourceLabel}
                  {event.sourceDeviceId
                    ? ` · 来自 ${shortDeviceId(event.sourceDeviceId)}`
                    : ''}
                </Text>
              </View>
              <Text style={sharedStyles.activityTime}>
                {formatActivityRelativeTime(event.timestamp, now)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
