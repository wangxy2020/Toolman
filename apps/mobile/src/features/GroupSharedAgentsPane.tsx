import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { GroupSharedItem } from '../storage/groupChat'
import {
  GroupResourcePickerModal,
  type GroupPickerGroup,
  type GroupPickerSelection,
} from './GroupResourcePickerModal'
import { GroupPanelHeader } from './GroupPanelHeader'
import { groupPagePanelStyles as styles } from './groupPagePanelStyles'
import { groupSharedPaneStyles as sharedStyles } from './groupSharedPaneStyles'
import { useGroupSharedResourcePane } from './useGroupPagePanels'
import {
  formatAgentSessionPermissionLabel,
  groupSharedAgentSections,
  type GroupAgentSection,
  type GroupAgentTopic,
} from './groupAgentUtils'

export function GroupSharedAgentsPane(props: {
  title: string
  typeNoun: string
  groupName: string
  items: GroupSharedItem[]
  pickerGroups: GroupPickerGroup[]
  canAdd?: boolean
  onAdd: (selection: GroupPickerSelection[]) => void
  onOpenTopic: (section: GroupAgentSection, topic: GroupAgentTopic) => void
}) {
  const { pickerOpen, setPickerOpen, hint, handleConfirm } = useGroupSharedResourcePane({
    kind: 'agents',
    onAdd: props.onAdd,
  })
  const sections = groupSharedAgentSections(props.items)
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(sections.map((section) => section.id)),
  )
  const canAdd = props.canAdd !== false

  const sectionIds = sections.map((section) => section.id).join('|')
  useEffect(() => {
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of sectionIds.split('|')) {
        if (id && !next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [sectionIds])

  return (
    <View style={styles.panelRoot}>
      <GroupPanelHeader
        title={props.title}
        subtitle={`${props.groupName} · ${sections.length} 个${props.typeNoun}`}
      />
      {canAdd ? (
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.dropzone, pressed ? styles.dropzonePressed : null]}
        >
          <Text style={styles.dropTitle}>点击添加{props.typeNoun}到群组</Text>
          <Text style={styles.dropHint}>从已有{props.typeNoun}中选择，共享给群组成员</Text>
        </Pressable>
      ) : (
        <Text style={styles.dropHint}>只读成员可查看群组已共享的{props.typeNoun}</Text>
      )}
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {sections.length === 0 ? (
          <Text style={styles.emptyText}>
            {canAdd ? `暂无群组${props.typeNoun}，点击上方区域添加` : `暂无群组${props.typeNoun}`}
          </Text>
        ) : (
          sections.map((section) => {
            const open = expanded.has(section.id)
            return (
              <View key={section.id} style={sharedStyles.agentSection}>
                <Pressable
                  onPress={() => {
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (next.has(section.id)) next.delete(section.id)
                      else next.add(section.id)
                      return next
                    })
                  }}
                  style={({ pressed }) => [
                    sharedStyles.agentHeader,
                    pressed ? styles.sharedCardPressed : null,
                  ]}
                >
                  <Text style={sharedStyles.agentChevron}>{open ? '▾' : '›'}</Text>
                  <View style={sharedStyles.agentHeading}>
                    <Text style={styles.sharedName} numberOfLines={1}>
                      {section.name}
                    </Text>
                    <Text style={styles.sharedMeta}>
                      {section.topics.length} 个话题
                    </Text>
                  </View>
                </Pressable>
                {open ? (
                  section.topics.length === 0 ? (
                    <Text style={sharedStyles.agentEmpty}>暂无共享话题</Text>
                  ) : (
                    section.topics.map((topic) => (
                      <Pressable
                        key={topic.id}
                        onPress={() => props.onOpenTopic(section, topic)}
                        style={({ pressed }) => [
                          sharedStyles.agentTopic,
                          pressed ? styles.sharedCardPressed : null,
                        ]}
                      >
                        <Text style={styles.sharedName} numberOfLines={1}>
                          {topic.name}
                        </Text>
                        <Text style={styles.sharedMeta}>
                          {formatAgentSessionPermissionLabel(topic.permission)}
                        </Text>
                      </Pressable>
                    ))
                  )
                ) : null}
              </View>
            )
          })
        )}
      </ScrollView>
      <GroupResourcePickerModal
        visible={pickerOpen}
        title={`选择${props.typeNoun}`}
        hint={hint}
        emptyLabel="暂无可添加的内容"
        groups={props.pickerGroups}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleConfirm}
      />
    </View>
  )
}
