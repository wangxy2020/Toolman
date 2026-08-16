import { useEffect, useRef, type ReactNode } from 'react'
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconPanelLeft } from '../icons/nav-icons'
import { useI18n } from '../i18n'
import { useSidebarLayout } from '../layout'
import { type MobileModuleId } from '../modules'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import { ModulePageStatusBar, ModulePageStatusProvider } from '../features/modulePageStatus'
import { ModuleOverflowMenu } from './ModuleOverflowMenu'

const STATUS_BAR_MODULES = new Set<MobileModuleId>(['knowledge', 'notes', 'community', 'projects'])

type Props = {
  left: ReactNode
  right: ReactNode
  /**
   * `drawer` — main is 100% width; left slides in as an overlay layer.
   * `docked` — settings: left pane always visible, cannot be dismissed.
   */
  sidebarMode?: 'drawer' | 'docked'
}

export function AppShell({ left, right, sidebarMode = 'drawer' }: Props) {
  const insets = useSafeAreaInsets()
  const { sidebarWidth } = useSidebarLayout()
  const {
    module,
    setModule,
    leftOpen,
    setLeftOpen,
    showSettings,
    setShowSettings,
    modulePrefs,
  } = useMobileApp()
  const { t } = useI18n()

  const docked = sidebarMode === 'docked'
  const drawerVisible = !docked && leftOpen
  const showModuleStatusBar = !showSettings && STATUS_BAR_MODULES.has(module)
  const slide = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (docked) return
    Animated.timing(slide, {
      toValue: leftOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [docked, leftOpen, slide])

  const drawerTranslateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-sidebarWidth, 0],
  })
  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })

  return (
    <View style={[shellStyles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={shellStyles.topBar}>
        <View style={shellStyles.topBarSide}>
          <Pressable
            style={[shellStyles.brandBtn, showSettings ? shellStyles.brandBtnActive : null]}
            onPress={() => {
              const next = !showSettings
              setShowSettings(next)
              if (!next) setLeftOpen(false)
            }}
            accessibilityLabel={showSettings ? t('shell.closeSettings') : t('shell.openSettings')}
          >
            <Text style={[shellStyles.brand, showSettings ? shellStyles.brandActive : null]}>
              Toolman
            </Text>
          </Pressable>

          <Pressable
            style={[
              shellStyles.iconBtn,
              leftOpen && !docked ? shellStyles.iconBtnActive : null,
              docked ? shellStyles.iconBtnDisabled : null,
            ]}
            onPress={() => {
              if (docked) return
              setLeftOpen(!leftOpen)
            }}
            disabled={docked}
            accessibilityLabel={
              docked ? t('shell.sidebarPinned') : leftOpen ? t('shell.closeSidebar') : t('shell.openSidebar')
            }
            hitSlop={8}
          >
            <IconPanelLeft
              size={18}
              color={
                docked
                  ? colors.textSecondary
                  : leftOpen
                    ? colors.accent
                    : colors.textSecondary
              }
            />
          </Pressable>
        </View>

        <View style={shellStyles.topBarCenterTrack}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={shellStyles.topBarCenter}
            contentContainerStyle={shellStyles.topBarCenterContent}
          >
            {modulePrefs.nav.visibleModuleIds.map((id) => (
              <ModuleChip
                key={id}
                label={t(`modules.${id}`)}
                active={!showSettings && module === id}
                onPress={() => {
                  setShowSettings(false)
                  setModule(id)
                  setLeftOpen(false)
                }}
              />
            ))}
          </ScrollView>
        </View>

        <View style={[shellStyles.topBarSide, shellStyles.topBarSideEnd]}>
          <ModuleOverflowMenu />
        </View>
      </View>

      <View style={shellStyles.workspace}>
        {docked ? (
          <>
            <View style={[shellStyles.dockedSidebar, { width: sidebarWidth }]}>{left}</View>
            <MainPane withStatusBar={showModuleStatusBar}>{right}</MainPane>
          </>
        ) : (
          <>
            <MainPane withStatusBar={showModuleStatusBar}>{right}</MainPane>

            <View
              style={shellStyles.drawerLayer}
              pointerEvents={drawerVisible ? 'auto' : 'none'}
            >
              <Animated.View
                style={[shellStyles.drawerBackdrop, { opacity: backdropOpacity }]}
              >
                <Pressable style={{ flex: 1 }} onPress={() => setLeftOpen(false)} />
              </Animated.View>
              <Animated.View
                style={[
                  shellStyles.drawerPanel,
                  {
                    width: sidebarWidth,
                    transform: [{ translateX: drawerTranslateX }],
                  },
                ]}
              >
                {left}
              </Animated.View>
            </View>
          </>
        )}
      </View>
    </View>
  )
}

function MainPane(props: { children: ReactNode; withStatusBar: boolean }) {
  return (
    <ModulePageStatusProvider>
      <View style={shellStyles.mainPane}>
        {props.withStatusBar ? (
          <>
            <View style={shellStyles.mainPaneBody}>{props.children}</View>
            <ModulePageStatusBar />
          </>
        ) : (
          props.children
        )}
      </View>
    </ModulePageStatusProvider>
  )
}

function ModuleChip(props: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      style={[shellStyles.navItem, props.active ? shellStyles.navItemActive : null]}
    >
      <Text
        style={[shellStyles.navItemText, props.active ? shellStyles.navItemTextActive : null]}
        numberOfLines={1}
      >
        {props.label}
      </Text>
    </Pressable>
  )
}
