import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { colors } from '../theme'

function usePulse(value: Animated.Value, duration: number, delayMs = 0) {
  useEffect(() => {
    value.setValue(0)
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    const timer = setTimeout(() => animation.start(), delayMs)
    return () => {
      clearTimeout(timer)
      animation.stop()
    }
  }, [delayMs, duration, value])
}

function PulseDot() {
  const progress = useRef(new Animated.Value(0)).current
  usePulse(progress, 1100)

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.15],
  })
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  })

  return (
    <Animated.View
      style={[styles.pulse, { opacity, transform: [{ scale }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  )
}

function StreamDot({ delayMs }: { delayMs: number }) {
  const progress = useRef(new Animated.Value(0)).current
  usePulse(progress, 1200, delayMs)

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  })
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  })

  return (
    <Animated.View
      style={[styles.dot, { opacity, transform: [{ translateY }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  )
}

/** Pulse + bouncing dots while the assistant is thinking / waiting for first tokens. */
export function ThinkingHeartbeat() {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel="正在思考"
      accessibilityState={{ busy: true }}
    >
      <PulseDot />
      <View style={styles.dots}>
        <StreamDot delayMs={0} />
        <StreamDot delayMs={150} />
        <StreamDot delayMs={300} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 20,
    paddingVertical: 2,
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.textSecondary,
  },
})
