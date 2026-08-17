import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'
import { colors } from '../theme'

/** Blinking bar while assistant tokens are streaming (desktop `.tm-stream-cursor`). */
export function StreamCursor() {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[styles.cursor, { opacity }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  )
}

const styles = StyleSheet.create({
  cursor: {
    width: 2,
    height: 16,
    marginLeft: 2,
    marginTop: 4,
    backgroundColor: colors.textSecondary,
  },
})
