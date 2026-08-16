import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSidebarLayout } from '../layout'
import { colors } from '../theme'
import { asDomElement, isHorizontalSwipe, shouldRevealSwipeActions } from './swipeable-row-gesture'
import { swipeableTopicRowStyles as styles } from './SwipeableTopicRow.styles'
import { useSwipeableTopicRowWebDrag } from './useSwipeableTopicRowWebDrag'

type SwipeableTopicRowProps = {
  active?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onPress: () => void
  onRename?: () => void
  onDelete?: () => void
  children: ReactNode
  /** Optional control on the trailing edge (stays on the sliding row). */
  trailing?: ReactNode
  /** Optional wrap style (e.g. nested indent under notebook). */
  style?: StyleProp<ViewStyle>
  /**
   * Opaque slide surface color. Must stay opaque so actions stay hidden until swipe.
   * Defaults to `colors.surface` (same as notes sidebar).
   */
  chromeColor?: string
  /** Section headers (notebooks / knowledge groups) use muted active chrome. */
  variant?: 'item' | 'section'
  renameA11yLabel?: string
  deleteA11yLabel?: string
}

const webForegroundStyle =
  Platform.OS === 'web'
    ? ({
        userSelect: 'none',
        cursor: 'grab',
        touchAction: 'pan-y',
      } as unknown as ViewStyle)
    : null

export function SwipeableTopicRow(props: SwipeableTopicRowProps) {
  const { open, onOpenChange } = props
  const layout = useSidebarLayout()
  const showRename = Boolean(props.onRename)
  const showDelete = Boolean(props.onDelete)
  const actionCount = (showRename ? 1 : 0) + (showDelete ? 1 : 0)
  const actionWidth = layout.swipeActionWidth
  const actionsWidth = actionWidth * Math.max(1, actionCount)
  const rowMinHeight = layout.rowMinHeight
  const chromeColor = props.chromeColor ?? colors.surface

  const translateX = useRef(new Animated.Value(0)).current
  const dragStart = useRef(0)
  const openRef = useRef(open)
  const actionsWidthRef = useRef(actionsWidth)
  const onOpenChangeRef = useRef(onOpenChange)
  const didDrag = useRef(false)
  openRef.current = open
  actionsWidthRef.current = actionsWidth
  onOpenChangeRef.current = onOpenChange

  const [hostNode, setHostNode] = useState<HTMLElement | null>(null)
  const bindWrapRef = useCallback((node: View | null) => {
    const el = asDomElement(node)
    setHostNode((prev) => (prev === el ? prev : el))
  }, [])

  const animateTo = useCallback(
    (toValue: number, nextOpen: boolean) => {
      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        bounciness: 0,
        speed: 28,
      }).start()
      onOpenChangeRef.current(nextOpen)
    },
    [translateX],
  )

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: open ? -actionsWidth : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 28,
    }).start()
  }, [open, actionsWidth, translateX])

  const settleFromDrag = useCallback(
    (dx: number, velocityX: number) => {
      const max = actionsWidthRef.current
      const current = Math.min(0, Math.max(-max, dragStart.current + dx))
      const nextOpen = shouldRevealSwipeActions({
        translateX: current,
        velocityX,
        actionsWidth: max,
      })
      animateTo(nextOpen ? -max : 0, nextOpen)
    },
    [animateTo],
  )
  const settleFromDragRef = useRef(settleFromDrag)
  settleFromDragRef.current = settleFromDrag

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          isHorizontalSwipe(gesture.dx, gesture.dy, 4),
        onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
          isHorizontalSwipe(gesture.dx, gesture.dy, 4),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStart.current = openRef.current ? -actionsWidthRef.current : 0
          didDrag.current = false
        },
        onPanResponderMove: (_evt, gesture) => {
          if (isHorizontalSwipe(gesture.dx, gesture.dy, 3)) didDrag.current = true
          const max = actionsWidthRef.current
          const next = Math.min(0, Math.max(-max, dragStart.current + gesture.dx))
          translateX.setValue(next)
        },
        onPanResponderRelease: (_evt, gesture) => {
          settleFromDrag(gesture.dx, gesture.vx)
        },
        onPanResponderTerminate: () => {
          const max = actionsWidthRef.current
          animateTo(openRef.current ? -max : 0, openRef.current)
        },
      }),
    [animateTo, settleFromDrag, translateX],
  )

  useSwipeableTopicRowWebDrag({
    hostNode,
    translateX,
    openRef,
    actionsWidthRef,
    dragStart,
    didDrag,
    settleFromDragRef,
  })

  const handlePress = () => {
    if (didDrag.current) {
      didDrag.current = false
      return
    }
    if (openRef.current) {
      animateTo(0, false)
      return
    }
    props.onPress()
  }

  return (
    <View
      ref={bindWrapRef}
      style={[
        styles.wrap,
        webForegroundStyle,
        { minHeight: rowMinHeight, backgroundColor: chromeColor },
        props.style,
      ]}
    >
      <View style={styles.actions}>
        {showRename ? (
          <Pressable
            accessibilityLabel={props.renameA11yLabel ?? '重命名'}
            style={[styles.actionBtn, styles.renameBtn, { width: actionWidth, minHeight: rowMinHeight }]}
            onPress={() => {
              animateTo(0, false)
              props.onRename?.()
            }}
          >
            <Text style={[styles.actionText, { fontSize: 12 }]}>重命名</Text>
          </Pressable>
        ) : null}
        {showDelete ? (
          <Pressable
            accessibilityLabel={props.deleteA11yLabel ?? '删除'}
            style={[styles.actionBtn, styles.deleteBtn, { width: actionWidth, minHeight: rowMinHeight }]}
            onPress={() => {
              animateTo(0, false)
              props.onDelete?.()
            }}
          >
            <Text style={[styles.actionText, { fontSize: 12 }]}>删除</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.View
        collapsable={false}
        style={[
          styles.foreground,
          webForegroundStyle,
          { backgroundColor: chromeColor, transform: [{ translateX }] },
        ]}
        {...(Platform.OS === 'web' ? null : panResponder.panHandlers)}
      >
        <View
          collapsable={false}
          style={[
            styles.foregroundRow,
            { minHeight: rowMinHeight, backgroundColor: chromeColor },
            props.active
              ? props.variant === 'section'
                ? styles.rowSectionActive
                : styles.rowActive
              : null,
          ]}
        >
          <Pressable
            onPress={handlePress}
            style={({ pressed }) => [
              styles.row,
              { minHeight: rowMinHeight },
              props.trailing ? styles.rowWithTrailing : null,
              pressed && !props.active ? styles.rowPressed : null,
            ]}
          >
            {props.children}
          </Pressable>
          {props.trailing ? (
            <View testID="swipe-ignore" style={styles.trailing}>
              {props.trailing}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  )
}
