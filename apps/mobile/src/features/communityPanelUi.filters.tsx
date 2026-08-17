import { Pressable, ScrollView, Text, View } from 'react-native'
import { uiStyles } from './communityPanelUi.styles'

export function CommunityStatGrid<T extends string>(props: {
  items: Array<{ id: T; label: string; count: number }>
  activeId: T
  onSelect: (id: T) => void
}) {
  return (
    <View style={uiStyles.statGrid}>
      {props.items.map((item) => {
        const active = item.id === props.activeId
        return (
          <Pressable
            key={item.id}
            onPress={() => props.onSelect(item.id)}
            style={[uiStyles.statCard, active ? uiStyles.statCardActive : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[uiStyles.statLabel, active ? uiStyles.statLabelActive : null]}>
              {item.label}
            </Text>
            <Text style={[uiStyles.statValue, active ? uiStyles.statValueActive : null]}>
              {item.count}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function CommunityCategoryChips<T extends string>(props: {
  items: Array<{ id: T; label: string }>
  activeId: T
  onSelect: (id: T) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={uiStyles.chipRow}
    >
      {props.items.map((item) => {
        const active = item.id === props.activeId
        return (
          <Pressable
            key={item.id}
            onPress={() => props.onSelect(item.id)}
            style={[uiStyles.chip, active ? uiStyles.chipActive : null]}
          >
            <Text style={[uiStyles.chipLabel, active ? uiStyles.chipLabelActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

export function CommunityEmptyState(props: { hint: string; meta?: string }) {
  return (
    <View style={uiStyles.emptyBody}>
      <Text style={uiStyles.emptyHint}>{props.hint}</Text>
      {props.meta ? <Text style={uiStyles.emptyMeta}>{props.meta}</Text> : null}
    </View>
  )
}

