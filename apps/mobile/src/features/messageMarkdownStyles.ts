import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  alignRight: {
    textAlign: 'right',
  },
  h1: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    marginTop: 2,
  },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 2,
  },
  h3: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  italic: {
    fontStyle: 'italic',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  link: {
    color: colors.accent,
  },
  inlineCode: {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    backgroundColor: colors.inputBg,
    color: colors.text,
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listBullet: {
    width: 22,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  listText: {
    flex: 1,
  },
  codeBlock: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  codeLang: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  codeText: {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 10,
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingVertical: 6,
    paddingRight: 8,
  },
  quoteText: {
    color: colors.text,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
})

/** Desktop `.tm-notes-editor-body`: 16px, line-height 1.7; headings from `.tm-notes-rich-body`. */
export const noteStyles = StyleSheet.create({
  root: {
    gap: 8,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 27,
    color: colors.text,
  },
  h1: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 44,
    marginTop: 10,
    marginBottom: 6,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 37,
    marginTop: 9,
    marginBottom: 5,
  },
  h3: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 31,
    marginTop: 8,
    marginBottom: 4,
  },
  list: {
    gap: 6,
    marginVertical: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listBullet: {
    width: 22,
    fontSize: 16,
    lineHeight: 27,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  listText: {
    flex: 1,
  },
  codeBlock: {
    borderRadius: 8,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    marginVertical: 4,
  },
  codeLang: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  codeText: {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 15,
    lineHeight: 25,
    color: colors.text,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: 12,
    paddingVertical: 2,
    marginVertical: 4,
  },
  quoteText: {
    color: colors.textSecondary,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
})
