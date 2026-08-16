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

import { styles } from './ProjectPanesStyles'

export function ProjectPanelHeader(props: {
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

export function IconGrip({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
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

export function IconArrowUp({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 19V5" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="m5 12 7-7 7 7" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function IconArrowDown({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="m19 12-7 7-7-7" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function MenuSwitch(props: { on: boolean; onPress: () => void; label: string }) {
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

export function ProjectDomainPanel({ menuKey }: { menuKey: ProjectSidebarMenuKey }) {
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

export function ProjectCustomizePanel() {
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

