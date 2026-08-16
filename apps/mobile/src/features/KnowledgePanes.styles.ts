import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const knowledgePaneStyles = StyleSheet.create({
  group: {
    marginBottom: 2,
  },
  groupDisabled: {
    opacity: 0.45,
  },
  sectionRow: {
    marginHorizontal: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionRowActive: {
    // Match desktop `.tm-assistant-row--active` → `--tm-hover`
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 22,
    height: 34,
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
  sectionNameHit: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  sectionName: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  sectionNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  sectionNameDisabled: {
    color: colors.textSecondary,
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
  kbItem: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  kbItemActive: {
    backgroundColor: colors.accentSoft,
  },
  kbItemPressed: {
    backgroundColor: colors.hover,
  },
  kbItemIcon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kbItemText: {
    flex: 1,
    minWidth: 0,
  },
  kbItemLabel: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  kbItemLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
  kbItemMeta: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    opacity: 0.85,
  },
  rightRoot: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.bg,
  },
})
