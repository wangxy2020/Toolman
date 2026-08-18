import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const settingsUiLayoutStyles = StyleSheet.create({
  rightRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 14,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    flexGrow: 1,
  },
  card: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  sectionTrailing: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  sectionTrailingVip: {
    color: colors.accent,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
  },
  headerActionPressed: {
    backgroundColor: colors.hover,
  },
  headerActionPressedAccent: {
    backgroundColor: colors.accentSoft,
  },
  headerActionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  headerActionLabelAccent: {
    color: colors.accent,
  },
  sectionBody: {
    gap: 12,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 42,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    minHeight: 42,
    paddingRight: 6,
    gap: 2,
  },
  inputInRow: {
    flex: 1,
    borderWidth: 0,
    minHeight: 42,
    paddingVertical: 11,
    backgroundColor: 'transparent',
  },
  fieldIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldDetectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputReadonly: {
    backgroundColor: colors.inputBg,
    color: colors.textSecondary,
  },
})
