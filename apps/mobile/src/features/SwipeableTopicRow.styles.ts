import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const swipeableTopicRowStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 10,
    marginVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  actions: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameBtn: {
    backgroundColor: colors.accent,
  },
  deleteBtn: {
    backgroundColor: colors.danger,
  },
  actionText: {
    color: '#fff',
    fontWeight: '600',
  },
  foreground: {
    backgroundColor: colors.surface,
  },
  foregroundRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
  },
  trailing: {
    justifyContent: 'center',
    paddingRight: 8,
  },
  row: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  rowWithTrailing: {
    paddingRight: 4,
  },
  rowActive: {
    backgroundColor: colors.accentSoft,
  },
  rowSectionActive: {
    backgroundColor: colors.hover,
  },
  rowPressed: {
    backgroundColor: colors.hover,
  },
})
