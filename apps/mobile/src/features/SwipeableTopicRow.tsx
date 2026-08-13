import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSidebarLayout } from '../layout'
import { colors } from '../theme'
import { asDomElement, isHorizontalSwipe, shouldRevealSwipeActions } from './swipeable-row-gesture'

type SwipeableTopicRowProps = {
  active?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onPress: () => void
  onRename: () => void
  onDelete?: () => void
  children: ReactNode
  /** Optional control on the trailing edge (stays on the sliding row). */
  trailing?: ReactNode
  /** Optional wrap style (e.g. nested indent under notebook). */
  style?: StyleProp<ViewStyle>
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
  const showDelete = Boolean(props.onDelete)
  const actionWidth = layout.swipeActionWidth
  const actionsWidth = actionWidth * (showDelete ? 2 : 1)
  const rowMinHeight = layout.rowMinHeight

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

  useEffect(() => {
    if (Platform.OS !== 'web' || !hostNode) return

    let detachDrag: (() => void) | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button != null && event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest('[data-testid="swipe-ignore"]')) return

      detachDrag?.()

      const pointerId = event.pointerId
      const startX = event.pageX
      const startY = event.pageY
      let lastX = startX
      let lastT = event.timeStamp || Date.now()
      let velocityX = 0
      let captured = false
      dragStart.current = openRef.current ? -actionsWidthRef.current : 0
      didDrag.current = false

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const dx = moveEvent.pageX - startX
        const dy = moveEvent.pageY - startY
        if (!captured) {
          if (!isHorizontalSwipe(dx, dy, 3)) return
          captured = true
          didDrag.current = true
          try {
            hostNode.setPointerCapture(pointerId)
          } catch {
            /* capture is optional; window listeners still track the drag */
          }
        }
        moveEvent.preventDefault()
        const now = moveEvent.timeStamp || Date.now()
        const dt = Math.max(8, now - lastT)
        velocityX = (moveEvent.pageX - lastX) / dt
        lastX = moveEvent.pageX
        lastT = now
        const max = actionsWidthRef.current
        translateX.setValue(Math.min(0, Math.max(-max, dragStart.current + dx)))
      }

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        detach()
        if (!captured) return
        settleFromDragRef.current(upEvent.pageX - startX, velocityX)
      }

      const detach = () => {
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', onUp, true)
        window.removeEventListener('pointercancel', onUp, true)
        try {
          if (hostNode.hasPointerCapture(pointerId)) hostNode.releasePointerCapture(pointerId)
        } catch {
          /* ignore */
        }
        if (detachDrag === detach) detachDrag = null
      }

      detachDrag = detach
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
      window.addEventListener('pointercancel', onUp, true)
    }

    const onDragStart = (event: DragEvent) => {
      event.preventDefault()
    }

    hostNode.addEventListener('pointerdown', onPointerDown)
    hostNode.addEventListener('dragstart', onDragStart)
    return () => {
      detachDrag?.()
      hostNode.removeEventListener('pointerdown', onPointerDown)
      hostNode.removeEventListener('dragstart', onDragStart)
    }
  }, [hostNode, translateX])

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
      style={[styles.wrap, webForegroundStyle, { minHeight: rowMinHeight }, props.style]}
    >
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
        style={[styles.foreground, webForegroundStyle, { transform: [{ translateX }] }]}
        {...(Platform.OS === 'web' ? null : panResponder.panHandlers)}
      >
        <View
          collapsable={false}
          style={[
            styles.foregroundRow,
            { minHeight: rowMinHeight },
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
