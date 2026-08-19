import { StyleSheet } from 'react-native'

/** Align with desktop light theme tokens (`theme.css`). */
export const colors = {
  bg: '#ffffff',
  surface: '#ffffff',
  navBg: '#f5f5f5',
  border: '#e8e8e8',
  borderLight: '#f0f0f0',
  text: '#1a1a1a',
  textSecondary: '#8b8f96',
  accent: '#00a870',
  accentHover: '#009660',
  accentSoft: '#e8f7f0',
  hover: '#f5f5f5',
  danger: '#dc2626',
  online: '#16a34a',
  inputBg: '#f5f5f5',
}

export const shellStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 0,
    zIndex: 2,
  },
  topBarSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  topBarSideEnd: {
    justifyContent: 'flex-end',
  },
  /** Capsule track for the center module menu. */
  topBarCenterTrack: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '56%',
    backgroundColor: colors.navBg,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  topBarCenter: {
    flexGrow: 0,
    flexShrink: 1,
  },
  topBarCenterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  brandBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 7,
  },
  brandBtnActive: {
    backgroundColor: colors.accentSoft,
  },
  brand: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  brandActive: {
    color: colors.accent,
  },
  navItem: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemActive: {
    backgroundColor: colors.bg,
  },
  navItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  navItemTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 11,
    maxWidth: '100%',
    textAlign: 'right',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  workspace: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    position: 'relative',
  },
  /** Full-width column: stream + input (or settings content). */
  mainPane: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.bg,
    minWidth: 0,
    minHeight: 0,
  },
  mainPaneBody: {
    flex: 1,
    minHeight: 0,
  },
  /** Settings-only: permanent left nav (same width as module drawer). */
  dockedSidebar: {
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },
  drawerLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    elevation: 40,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
  },
  listItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  listItemActive: {
    backgroundColor: colors.accentSoft,
  },
  listItemTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '400',
  },
  listItemMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  emptyHint: {
    color: colors.textSecondary,
    fontSize: 13,
    padding: 16,
    lineHeight: 20,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: colors.accentSoft,
  },
  iconBtnDisabled: {
    opacity: 0.35,
  },
  iconBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  iconBtnTextActive: {
    color: colors.accent,
  },
})
