import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useMobileApp } from '../state/MobileAppContext'
import { GroupJoinModal } from './GroupJoinModal'
import { GROUP_SIDEBAR_MENUS } from './groupSidebar'
import { groupPaneStyles as styles } from './groupPaneStyles'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { useGroupChat } from './useGroupChat'

export function GroupLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const {
    groups,
    activeGroupId,
    activeAction,
    createGroup,
    joinGroupByInvite,
    selectGroup,
    selectGroupAction,
    expanded,
    toggleExpanded,
  } = useGroupChat()
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <SidebarShell>
      <SidebarAddButton
        label="创建群组"
        onPress={() => {
          createGroup()
          setLeftOpen(false)
        }}
      />
      <SidebarAddButton label="加入群组" onPress={() => setJoinOpen(true)} />
      <GroupJoinModal
        visible={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoin={(input) => {
          const result = joinGroupByInvite(input)
          if (result.ok) setLeftOpen(false)
          return result
        }}
      />
      <SidebarList>
        {groups.length === 0 ? (
          <Text style={sidebarStyles.empty}>
            暂无群组。可粘贴电脑邀请链接加入，或连接电脑同步已有群组。
          </Text>
        ) : (
          groups.map((group) => {
            const isOpen = expanded.has(group.id)
            const isActive = group.id === activeGroupId
            return (
              <View key={group.id} style={styles.groupBlock}>
                <View style={[styles.groupRow, isActive ? styles.groupRowActive : null]}>
                  <Pressable
                    accessibilityLabel={isOpen ? '折叠' : '展开'}
                    onPress={() => toggleExpanded(group.id)}
                    style={({ pressed }) => [
                      styles.expandHit,
                      pressed ? styles.expandHitPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.chevron, isOpen ? styles.chevronOpen : null]}
                      accessibilityElementsHidden
                    >
                      ›
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => {
                      selectGroup(group.id)
                      setLeftOpen(false)
                    }}
                    style={styles.groupNameHit}
                  >
                    <Text
                      style={[styles.groupName, isActive ? styles.groupNameActive : null]}
                      numberOfLines={1}
                    >
                      {group.name}
                    </Text>
                  </Pressable>
                </View>
                {isOpen
                  ? GROUP_SIDEBAR_MENUS.map((menu) => {
                      const childActive = isActive && activeAction === menu.id
                      return (
                        <Pressable
                          key={menu.id}
                          onPress={() => {
                            selectGroupAction(group.id, menu.id)
                            setLeftOpen(false)
                          }}
                          style={({ pressed }) => [
                            styles.subItem,
                            childActive ? styles.subItemActive : null,
                            pressed && !childActive ? styles.subItemPressed : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subItemLabel,
                              childActive ? styles.subItemLabelActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            {menu.label}
                          </Text>
                        </Pressable>
                      )
                    })
                  : null}
              </View>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}
