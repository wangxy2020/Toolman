import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '../theme'
import { AgentRightPane } from './AgentPanes'
import { ClassroomRecordsPane } from './ClassroomRecordsPane'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import {
  useClassroomLeftPane,
  useOptionalClassroomUi,
} from './useClassroomPanes'

export { ClassroomUiProvider, useOptionalClassroomUi } from './useClassroomPanes'

export function ClassroomLeftPane() {
  const {
    classroomUi,
    entries,
    expanded,
    activeSessionId,
    toggleExpanded,
    selectCourse,
    selectChapter,
    selectedChapterId,
  } = useClassroomLeftPane()

  return (
    <SidebarShell>
      <SidebarAddButton
        label="添加课程"
        onPress={() => classroomUi?.openCreateCourse()}
      />
      <SidebarList>
        {entries.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无学习会话。点击添加课程开始。</Text>
        ) : (
          entries.map((entry) => {
            const isOpen = expanded.has(entry.id)
            const isActive = entry.id === activeSessionId
            const chapterId = selectedChapterId(entry.id, entry.course)
            return (
              <View key={entry.id} style={styles.group}>
                <View style={[styles.courseRow, isActive ? styles.courseRowActive : null]}>
                  <Pressable
                    accessibilityLabel={isOpen ? '折叠' : '展开'}
                    onPress={() => toggleExpanded(entry.id)}
                    style={({ pressed }) => [
                      styles.expandHit,
                      pressed ? styles.expandHitPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.chevron, isOpen ? styles.chevronOpen : null]}
                      accessibilityElementsHidden
                    >
                      ›
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => selectCourse(entry.id)}
                    onLongPress={() => classroomUi?.openCourseSettings(entry.id)}
                    delayLongPress={400}
                    style={styles.courseNameHit}
                  >
                    <Text
                      style={[styles.courseName, isActive ? styles.courseNameActive : null]}
                      numberOfLines={1}
                    >
                      {entry.label}
                    </Text>
                  </Pressable>
                </View>
                {isOpen ? (
                  entry.chapters.length === 0 ? (
                    <Text style={styles.emptyChapters}>暂无目录</Text>
                  ) : (
                    entry.chapters.map((chapter) => {
                      const chapterActive = isActive && chapterId === chapter.id
                      return (
                        <Pressable
                          key={chapter.id}
                          disabled={chapter.locked}
                          onPress={() => selectChapter(entry.id, chapter.id, chapter.locked)}
                          style={({ pressed }) => [
                            styles.chapterItem,
                            chapterActive ? styles.chapterItemActive : null,
                            chapter.locked ? styles.chapterItemLocked : null,
                            pressed && !chapterActive && !chapter.locked
                              ? styles.chapterItemPressed
                              : null,
                          ]}
                        >
                          <View style={styles.chapterIcon}>
                            <IconTopic
                              size={14}
                              color={chapterActive ? colors.text : colors.textSecondary}
                            />
                          </View>
                          <Text
                            style={[
                              styles.chapterLabel,
                              chapterActive ? styles.chapterLabelActive : null,
                              chapter.status === 'passed' ? styles.chapterLabelPassed : null,
                            ]}
                            numberOfLines={1}
                          >
                            {chapter.title}
                          </Text>
                        </Pressable>
                      )
                    })
                  )
                ) : null}
              </View>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}

export function ClassroomRightPane() {
  const classroomUi = useOptionalClassroomUi()
  if (classroomUi?.recordsOpen) {
    return <ClassroomRecordsPane onOpenClassroom={() => classroomUi.closeRecords()} />
  }
  return <AgentRightPane key="classroom" />
}

function IconTopic({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7 4h10a2 2 0 0 1 2 2v14l-7-3-7 3V6a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: 8,
    marginBottom: 6,
    gap: 6,
  },
  courseRow: {
    minHeight: 36,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  courseRowActive: {
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 16,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHitPressed: {
    opacity: 0.7,
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
  courseNameHit: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  courseName: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  courseNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  emptyChapters: {
    marginLeft: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  chapterItem: {
    marginLeft: 32,
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chapterItemActive: {
    backgroundColor: colors.accentSoft,
  },
  chapterItemPressed: {
    backgroundColor: colors.hover,
  },
  chapterItemLocked: {
    opacity: 0.45,
  },
  chapterIcon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  chapterLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
  chapterLabelPassed: {
    opacity: 0.85,
  },
})
