import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSidebarLayout } from '../layout'
import { colors } from '../theme'

type SwipeableTopicRowProps = {
  active?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onPress: () => void
  onRename: () => void
  onDelete: () => void
  children: ReactNode
  /** Optional wrap style (e.g. nested indent under notebook). */
  style?: StyleProp<ViewStyle>
  renameA11yLabel?: string
  deleteA11yLabel?: string
}

export function SwipeableTopicRow(props: SwipeableTopicRowProps) {
  const { open, onOpenChange } = props
  const layout = useSidebarLayout()
  const actionWidth = layout.swipeActionWidth
  const actionsWidth = actionWidth * 2
  const rowMinHeight = layout.rowMinHeight

  const translateX = useRef(new Animated.Value(0)).current
  const dragStart = useRef(0)
  const openRef = useRef(open)
  const actionsWidthRef = useRef(actionsWidth)
  openRef.current = open
  actionsWidthRef.current = actionsWidth

  const animateTo = (toValue: number, nextOpen: boolean) => {
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      bounciness: 0,
      speed: 28,
    }).start()
    onOpenChange(nextOpen)
  }

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: open ? -actionsWidth : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 28,
    }).start()
  }, [open, actionsWidth, translateX])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          dragStart.current = openRef.current ? -actionsWidthRef.current : 0
        },
        onPanResponderMove: (_evt, gesture) => {
          const max = actionsWidthRef.current
          const next = Math.min(0, Math.max(-max, dragStart.current + gesture.dx))
          translateX.setValue(next)
        },
        onPanResponderRelease: (_evt, gesture) => {
          const max = actionsWidthRef.current
          const current = Math.min(0, Math.max(-max, dragStart.current + gesture.dx))
          const shouldOpen = gesture.vx < -0.35 || current <= -(max / 2)
          animateTo(shouldOpen ? -max : 0, shouldOpen)
        },
        onPanResponderTerminate: () => {
          const max = actionsWidthRef.current
          animateTo(openRef.current ? -max : 0, openRef.current)
        },
      }),
    // recreate when width changes so release math stays correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionsWidth],
  )

  return (
    <View style={[styles.wrap, { minHeight: rowMinHeight }, props.style]}>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={props.renameA11yLabel ?? '重命名'}
          style={[styles.actionBtn, styles.renameBtn, { width: actionWidth, minHeight: rowMinHeight }]}
          onPress={() => {
            animateTo(0, false)
            props.onRename()
          }}
        >
          <Text style={[styles.actionText, { fontSize: 12 }]}>重命名</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={props.deleteA11yLabel ?? '删除'}
          style={[styles.actionBtn, styles.deleteBtn, { width: actionWidth, minHeight: rowMinHeight }]}
          onPress={() => {
            animateTo(0, false)
            props.onDelete()
          }}
        >
          <Text style={[styles.actionText, { fontSize: 12 }]}>删除</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={() => {
            if (openRef.current) {
              animateTo(0, false)
              return
            }
            props.onPress()
          }}
          style={({ pressed }) => [
            styles.row,
            { minHeight: rowMinHeight },
            props.active ? styles.rowActive : null,
            pressed && !props.active ? styles.rowPressed : null,
          ]}
        >
          {props.children}
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
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
  row: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  rowActive: {
    backgroundColor: colors.accentSoft,
  },
  rowPressed: {
    backgroundColor: colors.hover,
  },
})
