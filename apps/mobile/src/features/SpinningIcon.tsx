import { type ReactNode, useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'

export function SpinningIcon({ spinning, children }: { spinning: boolean; children: ReactNode }) {
  const rotate = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!spinning) {
      rotate.stopAnimation()
      rotate.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [rotate, spinning])
  return (
    <Animated.View
      style={{
        transform: [
          {
            rotate: rotate.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  )
}
