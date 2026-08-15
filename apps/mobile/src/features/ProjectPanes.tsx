import { useMemo, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useMobileApp } from '../state/MobileAppContext'
import { IconRefresh } from '../icons/composer-icons'
import { colors } from '../theme'
import {
  getProjectMenu,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  type ProjectSidebarMenuKey,
} from './projectSidebar'
import { buildProjectStats } from './projectStats'
import { ProjectStatsBody } from './ProjectStatsUi'
import { useRegisterModulePanelStatus } from './modulePageStatus'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import {
  projectCustomizeVisibleCount,
  useProjectUi,
} from './useProjectPanes'

export { getProjectMenu } from './projectSidebar'
export { ProjectUiProvider, useOptionalProjectUi } from './useProjectPanes'

export function ProjectLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const { activeTab, setActiveTab, preferences, visibleKeys } = useProjectUi()
  const menus = preferences.order
    .filter((key) => visibleKeys.includes(key))
    .map((key) => getProjectMenu(key))

  return (
    <SidebarShell>
      <SidebarAddButton
        label="自定义"
        onPress={() => {
          setActiveTab(PROJECT_SIDEBAR_CUSTOM_TAB)
          setLeftOpen(false)
        }}
      />
      <SidebarList>
        {menus.map((menu) => (
          <SidebarItem
            key={menu.id}
            label={menu.label}
            active={activeTab === menu.id}
            onPress={() => {
              setActiveTab(menu.id)
              setLeftOpen(false)
            }}
          />
        ))}
      </SidebarList>
    </SidebarShell>
  )
}

function ProjectPanelHeader(props: {
  title: string
  subtitle: string
  actions?: ReactNode
  demo?: boolean
}) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelHeaderText}>
        <View style={styles.panelTitleRow}>
          <Text style={styles.panelTitle}>{props.title}</Text>
          {props.demo ? <Text style={styles.demoBadge}>演示</Text> : null}
        </View>
        <Text style={styles.panelSubtitle}>{props.subtitle}</Text>
      </View>
      {props.actions ? <View style={styles.panelActions}>{props.actions}</View> : null}
    </View>
  )
}

function IconGrip({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </Svg>
  )
}

function IconArrowUp({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 19V5" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="m5 12 7-7 7 7" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function IconArrowDown({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="m19 12-7 7-7-7" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function MenuSwitch(props: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: props.on }}
      accessibilityLabel={props.label}
      style={[styles.switchTrack, props.on ? styles.switchTrackOn : null]}
    >
      <View style={styles.switchThumb} />
    </Pressable>
  )
}

function ProjectDomainPanel({ menuKey }: { menuKey: ProjectSidebarMenuKey }) {
  const menu = getProjectMenu(menuKey)
  const stats = useMemo(() => buildProjectStats(menuKey), [menuKey])
  useRegisterModulePanelStatus('project-page', {
    tone: 'muted',
    message: '演示数据',
    meta: `共 ${stats.records.length} 个项目`,
  })
  return (
    <View style={styles.panelRoot}>
      <ProjectPanelHeader title={menu.title} subtitle={menu.subtitle} demo />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // @ts-expect-error react-native-web className
        className="tm-project-page-scroll"
      >
        <ProjectStatsBody stats={stats} />
      </ScrollView>
    </View>
  )
}

function ProjectCustomizePanel() {
  const { preferences, setMenuVisible, moveMenu, resetMenus } = useProjectUi()
  const hidden = new Set(preferences.hidden)
  const visibleCount = projectCustomizeVisibleCount(preferences)
  useRegisterModulePanelStatus('project-page', {
    tone: 'muted',
    message: '就绪',
    meta: `${visibleCount}/${preferences.order.length} 项显示`,
  })

  return (
    <View style={styles.panelRoot}>
      <ProjectPanelHeader
        title="自定义"
        subtitle="配置项目管理左侧菜单的显示与顺序"
        actions={
          <Pressable
            onPress={resetMenus}
            accessibilityLabel="恢复默认"
            style={({ pressed }) => [styles.resetBtn, pressed ? styles.resetBtnPressed : null]}
          >
            <IconRefresh size={14} color={colors.textSecondary} />
            <Text style={styles.resetBtnText}>恢复默认</Text>
          </Pressable>
        }
      />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.customizeScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // @ts-expect-error react-native-web className
        className="tm-project-page-scroll"
      >
        <View style={styles.settingsInner}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>
              菜单项（{visibleCount}/{preferences.order.length} 项显示）
            </Text>
            <View style={styles.settingsList}>
              {preferences.order.map((key, index) => {
                const menu = getProjectMenu(key)
                const visible = !hidden.has(key)
                const atTop = index === 0
                const atBottom = index === preferences.order.length - 1
                return (
                  <View key={key} style={styles.settingsRow}>
                    <View style={styles.settingsDrag} accessibilityElementsHidden>
                      <IconGrip />
                    </View>
                    <Text style={styles.settingsLabel} numberOfLines={1}>
                      {menu.label}
                    </Text>
                    <View style={styles.settingsActions}>
                      <View style={styles.toggleWrap}>
                        <Text style={styles.toggleLabel}>{visible ? '显示' : '隐藏'}</Text>
                        <MenuSwitch
                          on={visible}
                          label={visible ? '隐藏' : '显示'}
                          onPress={() => setMenuVisible(key, !visible)}
                        />
                      </View>
                      <Pressable
                        disabled={atTop}
                        onPress={() => moveMenu(key, 'up')}
                        accessibilityLabel="上移"
                        style={({ pressed }) => [
                          styles.iconBtn,
                          atTop ? styles.iconBtnDisabled : null,
                          pressed && !atTop ? styles.iconBtnPressed : null,
                        ]}
                      >
                        <IconArrowUp />
                      </Pressable>
                      <Pressable
                        disabled={atBottom}
                        onPress={() => moveMenu(key, 'down')}
                        accessibilityLabel="下移"
                        style={({ pressed }) => [
                          styles.iconBtn,
                          atBottom ? styles.iconBtnDisabled : null,
                          pressed && !atBottom ? styles.iconBtnPressed : null,
                        ]}
                      >
                        <IconArrowDown />
                      </Pressable>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>

          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>说明</Text>
            <View style={styles.hintList}>
              <Text style={styles.hintItem}>
                • 隐藏后的菜单不会在左侧显示；若当前正在查看被隐藏的页面，将自动切换到第一个可见菜单。
              </Text>
              <Text style={styles.hintItem}>• 排序仅影响侧栏顶部「自定义」下方的菜单项。</Text>
              <Text style={styles.hintItem}>• 设置保存在本机，换设备需重新配置。</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export function ProjectRightPane() {
  const { activeTab } = useProjectUi()
  if (activeTab === PROJECT_SIDEBAR_CUSTOM_TAB) {
    return <ProjectCustomizePanel />
  }
  const menuKey: ProjectSidebarMenuKey = activeTab
  return <ProjectDomainPanel menuKey={menuKey} />
}

const styles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  panelHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  panelActions: {
    flexShrink: 0,
    paddingTop: 2,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
    color: colors.text,
  },
  demoBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  panelSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
  },
  customizeScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  settingsInner: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 16,
  },
  settingsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    padding: 12,
  },
  settingsCardTitle: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  settingsList: {
    gap: 6,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  settingsDrag: {
    opacity: 0.55,
  },
  settingsLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: colors.text,
  },
  settingsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleLabel: {
    minWidth: 28,
    fontSize: 11,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  switchTrack: {
    width: 32,
    height: 16,
    borderRadius: 999,
    backgroundColor: colors.border,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchTrackOn: {
    backgroundColor: colors.accent,
    justifyContent: 'flex-end',
  },
  switchThumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors.hover,
  },
  iconBtnDisabled: {
    opacity: 0.35,
  },
  hintCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.inputBg,
  },
  hintTitle: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  hintList: {
    gap: 4,
  },
  hintItem: {
    fontSize: 12,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  resetBtnPressed: {
    backgroundColor: colors.borderLight,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
})
