import { Text, View } from 'react-native'
import type { ClassroomStudyRecord } from '@toolman/shared'
import {
  formatClassroomRecordDate,
  formatClassroomRecordDuration,
  studyRecordTags,
  type ClassroomRecordTag,
} from './classroomRecordsUtils'
import { classroomRecordsStyles as styles } from './ClassroomRecordsPane.styles'

function tagToneStyle(tone: string) {
  if (tone === 'mastered') return styles.tagMastered
  if (tone === 'confirmed') return styles.tagConfirmed
  if (tone === 'assumption') return styles.tagAssumption
  return styles.tagStuck
}

export function StudyRecordCard(props: {
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
