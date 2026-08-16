import { StyleSheet } from 'react-native'
import { colors } from '../theme'

export const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
  },
  dropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.hover,
  },
  dropzonePressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dropzoneActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dropzoneDisabled: {
    opacity: 0.6,
  },
  dropTitle: {
    fontSize: 13,
    color: colors.text,
  },
  dropHint: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  empty: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: 10,
    paddingBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bg,
  },
  cardSelected: {
    borderColor: '#7dceb0',
    backgroundColor: '#f3fbf7',
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardStatus: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardStatusReady: {
    color: '#2e9b6a',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  cardAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionPressed: {
    backgroundColor: colors.hover,
  },
  cardActionDangerPressed: {
    backgroundColor: '#fef2f2',
  },
  statusBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusReady: {
    backgroundColor: '#dcfce7',
  },
  statusPending: {
    backgroundColor: colors.hover,
  },
  selectHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBoxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
})
