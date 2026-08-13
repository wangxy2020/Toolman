import { type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { IconPlus } from '../icons/composer-icons'
import { useSidebarLayout } from '../layout'
import { colors } from '../theme'

/** Align with desktop `.tm-sidebar` chrome; sizes adapt for phone / iPad. */
export const sidebarStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingTop: 6,
  },
  add: {
    marginTop: 6,
    marginHorizontal: 10,
    marginBottom: 6,
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  addPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  addText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  addTextPressed: {
    color: colors.accent,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 2,
    paddingBottom: 16,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    lineHeight: 18,
  },
  item: {
    marginHorizontal: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  itemActive: {
    backgroundColor: colors.accentSoft,
  },
  itemPressed: {
    backgroundColor: colors.hover,
  },
  itemLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  itemLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
  itemMeta: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textSecondary,
  },
})

export function SidebarAddButton(props: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const layout = useSidebarLayout()
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityLabel={props.label}
      style={({ pressed }) => [
        sidebarStyles.add,
        { minHeight: layout.rowMinHeight },
        pressed && !props.disabled ? sidebarStyles.addPressed : null,
        props.disabled ? { opacity: 0.55 } : null,
      ]}
    >
      {({ pressed }) => {
        const active = pressed && !props.disabled
        return (
          <>
            <IconPlus
              size={layout.addIconSize}
              color={active ? colors.accent : colors.textSecondary}
            />
            <Text
              style={[
                sidebarStyles.addText,
                { fontSize: layout.addFontSize },
                active ? sidebarStyles.addTextPressed : null,
              ]}
            >
              {props.label}
            </Text>
          </>
        )
      }}
    </Pressable>
  )
}

export function SidebarList(props: { children: ReactNode }) {
  return (
    <ScrollView
      style={sidebarStyles.list}
      contentContainerStyle={sidebarStyles.listContent}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      // @ts-expect-error react-native-web className
      className="tm-sidebar-scroll"
    >
      {props.children}
    </ScrollView>
  )
}

export function SidebarItem(props: {
  label: string
  meta?: string
  active?: boolean
  onPress: () => void
}) {
  const active = Boolean(props.active)
  const layout = useSidebarLayout()
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        sidebarStyles.item,
        { minHeight: layout.rowMinHeight },
        active ? sidebarStyles.itemActive : null,
        pressed && !active ? sidebarStyles.itemPressed : null,
      ]}
    >
      <Text
        style={[
          sidebarStyles.itemLabel,
          { fontSize: layout.topicFontSize },
          active ? sidebarStyles.itemLabelActive : null,
        ]}
        numberOfLines={1}
      >
        {props.label}
      </Text>
      {props.meta ? <Text style={sidebarStyles.itemMeta}>{props.meta}</Text> : null}
    </Pressable>
  )
}

export function SidebarShell(props: { children: ReactNode }) {
  return <View style={sidebarStyles.root}>{props.children}</View>
}
