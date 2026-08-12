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
import { useSidebarLayout } from '../layout'
import { MOBILE_MODULES } from '../modules'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import { ModuleOverflowMenu } from './ModuleOverflowMenu'

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
  } = useMobileApp()

  const docked = sidebarMode === 'docked'
  const drawerVisible = !docked && leftOpen
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
              docked ? '设置中分栏固定' : leftOpen ? '关闭分栏' : '打开分栏'
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

          <Pressable
            style={[shellStyles.brandBtn, showSettings ? shellStyles.brandBtnActive : null]}
            onPress={() => {
              const next = !showSettings
              setShowSettings(next)
              if (!next) setLeftOpen(false)
            }}
            accessibilityLabel={showSettings ? '关闭设置' : '打开设置'}
          >
            <Text style={[shellStyles.brand, showSettings ? shellStyles.brandActive : null]}>
              Toolman
            </Text>
          </Pressable>
        </View>

        <View style={shellStyles.topBarCenterTrack}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={shellStyles.topBarCenter}
            contentContainerStyle={shellStyles.topBarCenterContent}
          >
            {MOBILE_MODULES.map((item) => (
              <ModuleChip
                key={item.id}
                label={item.label}
                active={!showSettings && module === item.id}
                onPress={() => {
                  setShowSettings(false)
                  setModule(item.id)
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
            <View style={shellStyles.mainPane}>{right}</View>
          </>
        ) : (
          <>
            <View style={shellStyles.mainPane}>{right}</View>

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
