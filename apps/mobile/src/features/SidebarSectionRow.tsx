import type { ReactNode } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSidebarLayout } from '../layout'
import { colors } from '../theme'
import { swipeableTopicRowStyles as styles } from './SwipeableTopicRow.styles'

type SidebarSectionRowProps = {
  active?: boolean
  onPress: () => void
  onLongPress?: () => void
  children: ReactNode
  trailing?: ReactNode
  /** Opaque row chrome; agents use muted gray, notes use surface. */
  chromeColor?: string
  style?: StyleProp<ViewStyle>
  longPressA11yLabel?: string
}

/** Non-swipe L1 sidebar row: tap to expand, long-press for delete/cancel. */
export function SidebarSectionRow(props: SidebarSectionRowProps) {
  const layout = useSidebarLayout()
  const rowMinHeight = layout.rowMinHeight
  const chromeColor = props.chromeColor ?? colors.surface

  return (
    <View
      style={[
        styles.wrap,
        { minHeight: rowMinHeight, backgroundColor: chromeColor },
        props.style,
      ]}
    >
      <View
        style={[
          styles.foregroundRow,
          { minHeight: rowMinHeight, backgroundColor: chromeColor },
          props.active ? styles.rowSectionActive : null,
        ]}
      >
        <Pressable
          accessibilityHint={props.onLongPress ? '长按删除' : undefined}
          accessibilityLabel={props.longPressA11yLabel}
          onPress={props.onPress}
          onLongPress={props.onLongPress}
          delayLongPress={400}
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
    </View>
  )
}
