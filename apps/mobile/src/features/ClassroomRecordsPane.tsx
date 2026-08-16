import { Pressable, ScrollView, Text, View } from 'react-native'
import { GroupPanelHeader } from './GroupPagePanels'
import { chapterStatusLabel } from './classroomRecordsUtils'
import { classroomRecordsStyles as styles } from './ClassroomRecordsPane.styles'
import { StudyRecordCard } from './ClassroomRecordsPaneCard'
import { useClassroomRecordsPane } from './useClassroomRecordsPane'

export function ClassroomRecordsPane(props: { onOpenClassroom: () => void }) {
  const { course, chapters, studyRecords, courseTitle, liveTags, statCards } =
    useClassroomRecordsPane()

  return (
    <View style={styles.root}>
      <GroupPanelHeader
        title="课堂记录"
        subtitle={`仅显示「${courseTitle}」的学习情况，每次上课生成一条记录`}
        actions={
          course ? (
            <Pressable
              onPress={props.onOpenClassroom}
              style={({ pressed }) => [styles.textBtn, pressed ? styles.textBtnPressed : null]}
            >
              <Text style={styles.textBtnLabel}>进入课堂</Text>
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {!course ? (
          <Text style={styles.emptyHint}>请先在左侧选择一门课程。</Text>
        ) : (
          <>
            <View style={styles.statGrid}>
              {statCards.map((item) => (
                <View key={item.key} style={styles.statCard}>
                  <Text style={styles.statLabel}>{item.label}</Text>
                  <Text style={styles.statValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>章节进度</Text>
              {chapters.length === 0 ? (
                <Text style={styles.emptyHint}>教学大纲尚未生成，章节列表会在生成后出现。</Text>
              ) : (
                chapters.map((chapter, index) => (
                  <View key={chapter.id} style={styles.chapterRow}>
                    <Text style={styles.chapterIndex}>{index + 1}</Text>
                    <Text style={styles.chapterTitle}>{chapter.title}</Text>
                    <Text
                      style={[
                        styles.chapterStatus,
                        chapter.status === 'passed' ? styles.chapterStatusPassed : null,
                        chapter.status === 'in_progress' ? styles.chapterStatusCurrent : null,
                      ]}
                    >
                      {chapterStatusLabel(chapter.status)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>上课记录</Text>
                <Text style={styles.sectionMeta}>共 {studyRecords.length} 条记录</Text>
              </View>
              {studyRecords.length === 0 ? (
                <Text style={styles.emptyHint}>还没有上过课。在课堂中提问后会生成记录。</Text>
              ) : (
                studyRecords.map((record, index) => (
                  <StudyRecordCard
                    key={record.id}
                    record={record}
                    index={studyRecords.length - index}
                    fallbackTags={index === 0 ? liveTags : []}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}
