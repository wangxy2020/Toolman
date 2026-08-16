import { StyleSheet, Platform } from 'react-native'
import { colors } from '../theme'

export const notesStyles = StyleSheet.create({
  group: {
    marginBottom: 2,
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
  sectionName: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  notebookTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notebookRenameWrap: {
    marginHorizontal: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  /** Match desktop `.tm-assistant-action-btn`. */
  actionBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  actionBtnPressed: {
    borderColor: colors.accent,
  },
  sectionBody: {
    paddingBottom: 2,
  },
  sectionEmpty: {
    marginLeft: 34,
    marginRight: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
  },
  noteSwipe: {
    marginLeft: 28,
  },
  renameWrap: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  renameWrapActive: {
    backgroundColor: colors.accentSoft,
  },
  renameInput: {
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    color: colors.text,
  },
  pageRow: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    minHeight: 0,
  },
  /** Desktop `.tm-notes-editor-pane--edit`. */
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    minWidth: 0,
  },
  pageContent: {
    flexGrow: 1,
    paddingTop: 24,
    /** Match agent stream (`STREAM_PAD_SIDE`); equal L/R so the 8px web scrollbar cannot skew the page. */
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 16,
  },
  pageContentNarrow: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  editorSplit: {
    gap: 16,
    width: '100%',
  },
  editorSplitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  editorCol: {
    flex: 1,
    minWidth: 0,
  },
  previewEmpty: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  outline: {
    width: 180,
    flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: colors.bg,
    gap: 6,
  },
  outlineTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  outlineItem: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text,
  },
  outlineL2: {
    paddingLeft: 8,
    color: colors.textSecondary,
  },
  outlineL3: {
    paddingLeft: 16,
    color: colors.textSecondary,
  },
  titleInput: {
    width: '100%',
    borderWidth: 0,
    padding: 0,
    marginBottom: 10,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    color: colors.text,
    backgroundColor: 'transparent',
    ...Platform.select({ web: { outlineWidth: 0 }, default: {} }),
  },
})

