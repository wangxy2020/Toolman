import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const classroomRecordsStyles = StyleSheet.create({
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
