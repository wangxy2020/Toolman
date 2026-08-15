import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ClassroomStudyRecord } from '@toolman/shared'
import { colors } from '../theme'
import { GroupPanelHeader } from './GroupPagePanels'
import {
  chapterStatusLabel,
  formatClassroomRecordDate,
  formatClassroomRecordDuration,
  studyRecordTags,
  type ClassroomRecordTag,
} from './classroomRecordsUtils'
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

function StudyRecordCard(props: {
  record: ClassroomStudyRecord
  index: number
  fallbackTags: ClassroomRecordTag[]
}) {
  const { record, index, fallbackTags } = props
  const end = record.endedAt ?? Date.now()
  const tags = studyRecordTags(record, fallbackTags)

  return (
    <View style={styles.feedCard}>
      <View style={styles.feedTop}>
        <View style={styles.lessonTag}>
          <View style={styles.lessonDot} />
          <Text style={styles.lessonTagText}>第 {index} 次上课</Text>
        </View>
        <Text style={styles.feedDate}>{formatClassroomRecordDate(record.startedAt)}</Text>
      </View>
      <Text style={styles.feedTitle}>{record.chapterTitle?.trim() || '未指定章节'}</Text>
      <View style={styles.metaList}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>学习日期</Text>
          <Text style={styles.metaValue}>{formatClassroomRecordDate(record.startedAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>时长</Text>
          <Text style={styles.metaValue}>{formatClassroomRecordDuration(record.startedAt, end)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>问答</Text>
          <Text style={styles.metaValue}>{record.qaCount} 轮</Text>
        </View>
      </View>
      {tags.length === 0 ? (
        <Text style={styles.emptyHint}>本次尚未形成理解摘要</Text>
      ) : (
        <View style={styles.tagList}>
          {tags.map((tag) => (
            <Text key={tag.key} style={[styles.tag, tagToneStyle(tag.tone)]}>
              {tag.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

function tagToneStyle(tone: string) {
  if (tone === 'mastered') return styles.tagMastered
  if (tone === 'confirmed') return styles.tagConfirmed
  if (tone === 'assumption') return styles.tagAssumption
  return styles.tagStuck
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 12,
  },
  textBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  textBtnPressed: {
    backgroundColor: colors.accentSoft,
  },
  textBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 8,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  section: {
    marginTop: 12,
    gap: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sectionMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  chapterIndex: {
    width: 18,
    fontSize: 13,
    color: colors.textSecondary,
  },
  chapterTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  chapterStatus: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chapterStatusPassed: {
    color: '#15803d',
  },
  chapterStatusCurrent: {
    color: '#2563eb',
  },
  feedCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  feedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  lessonTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lessonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  lessonTagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  feedDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  metaList: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  metaLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaValue: {
    fontSize: 13,
    color: colors.text,
  },
  tagList: {
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    overflow: 'hidden',
  },
  tagMastered: {
    backgroundColor: 'rgba(22,163,74,0.14)',
    color: '#166534',
  },
  tagConfirmed: {
    backgroundColor: 'rgba(37,99,235,0.14)',
    color: '#1d4ed8',
  },
  tagAssumption: {
    backgroundColor: 'rgba(217,119,6,0.14)',
    color: '#b45309',
  },
  tagStuck: {
    backgroundColor: 'rgba(220,38,38,0.12)',
    color: '#b91c1c',
  },
})
