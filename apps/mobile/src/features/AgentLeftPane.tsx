import { Pressable, Text, TextInput, View } from 'react-native'
import { IconPlus } from '../icons/composer-icons'
import { colors } from '../theme'
import { agentTopicStyles as topicStyles } from './agentTopicStyles'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { SidebarSectionRow } from './SidebarSectionRow'
import { SwipeableTopicRow } from './SwipeableTopicRow'
import { useAgentLeftPane } from './useAgentLeftPane'

function AgentChevron({ open }: { open: boolean }) {
  return (
    <Text style={[topicStyles.chevron, open ? topicStyles.chevronOpen : null]} accessibilityElementsHidden>
      ›
    </Text>
  )
}

export function AgentLeftPane() {
  const {
    sections,
    activeSessionId,
    renameTarget,
    draftTitle,
    setDraftTitle,
    openSwipeId,
    setSwipeOpen,
    expanded,
    toggleExpanded,
    layout,
    createAgent,
    createSession,
    commitRename,
    beginRenameSession,
    confirmDeleteAgent,
    confirmDeleteSession,
    selectSession,
  } = useAgentLeftPane()

  return (
    <SidebarShell>
      <SidebarAddButton label="新建智能体" onPress={createAgent} />
      <SidebarList>
        {sections.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无智能体，点击上方新建</Text>
        ) : (
          sections.map((section) => {
            const isOpen = expanded.has(section.key)
            const sectionActive = section.sessions.some(
              (session) => session.id === activeSessionId,
            )
            const canCreateTopic = Boolean(section.assistantId)
            const renamingAgent =
              renameTarget?.kind === 'agent' &&
              section.assistantId != null &&
              renameTarget.id === section.assistantId

            return (
              <View key={section.key} style={topicStyles.group}>
                {renamingAgent ? (
                  <View
                    style={[
                      topicStyles.agentRenameWrap,
                      { minHeight: layout.rowMinHeight },
                      sectionActive ? topicStyles.renameWrapActive : null,
                    ]}
                  >
                    <TextInput
                      style={[topicStyles.renameInput, { fontSize: layout.topicFontSize }]}
                      value={draftTitle}
                      onChangeText={setDraftTitle}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={commitRename}
                      onBlur={commitRename}
                      placeholder="智能体名称"
                      placeholderTextColor={colors.textSecondary}
                      underlineColorAndroid="transparent"
                    />
                  </View>
                ) : (
                  <SidebarSectionRow
                    active={sectionActive}
                    chromeColor={colors.hover}
                    onPress={() => toggleExpanded(section.key)}
                    onLongPress={() => confirmDeleteAgent(section)}
                    longPressA11yLabel={section.title}
                    trailing={
                      canCreateTopic ? (
                        <Pressable
                          accessibilityLabel="新建话题"
                          hitSlop={6}
                          onPress={() => createSession(section.assistantId!)}
                          style={({ pressed }) => [
                            topicStyles.actionBtn,
                            pressed ? topicStyles.actionBtnPressed : null,
                          ]}
                        >
                          {({ pressed }) => (
                            <IconPlus
                              size={14}
                              color={pressed ? colors.accent : colors.textSecondary}
                            />
                          )}
                        </Pressable>
                      ) : undefined
                    }
                  >
                    <View style={topicStyles.agentTitleRow}>
                      <AgentChevron open={isOpen} />
                      <Text
                        style={[
                          topicStyles.sectionName,
                          sectionActive ? topicStyles.sectionNameActive : null,
                        ]}
                        numberOfLines={1}
                      >
                        {section.title}
                      </Text>
                    </View>
                  </SidebarSectionRow>
                )}
                {isOpen ? (
                  <View style={topicStyles.sectionBody}>
                    {section.sessions.length === 0 ? (
                      <Text style={topicStyles.sectionEmpty}>暂无话题</Text>
                    ) : (
                      section.sessions.map((session) => {
                        const active = activeSessionId === session.id
                        const renaming =
                          renameTarget?.kind === 'session' && renameTarget.id === session.id
                        if (renaming) {
                          return (
                            <View
                              key={session.id}
                              style={[
                                topicStyles.renameWrap,
                                { minHeight: layout.rowMinHeight },
                                active ? topicStyles.renameWrapActive : null,
                              ]}
                            >
                              <TextInput
                                style={[
                                  topicStyles.renameInput,
                                  { fontSize: layout.topicFontSize },
                                ]}
                                value={draftTitle}
                                onChangeText={setDraftTitle}
                                autoFocus
                                selectTextOnFocus
                                returnKeyType="done"
                                onSubmitEditing={commitRename}
                                onBlur={commitRename}
                                placeholder="话题名称"
                                placeholderTextColor={colors.textSecondary}
                                underlineColorAndroid="transparent"
                              />
                            </View>
                          )
                        }
                        return (
                          <SwipeableTopicRow
                            key={session.id}
                            active={active}
                            open={openSwipeId === session.id}
                            onOpenChange={(open) => setSwipeOpen(session.id, open)}
                            style={topicStyles.topicSwipe}
                            onPress={() => selectSession(session.id)}
                            onRename={() => beginRenameSession(session)}
                            onDelete={() => confirmDeleteSession(session)}
                            renameA11yLabel="重命名话题"
                            deleteA11yLabel="删除话题"
                          >
                            <Text
                              style={[
                                sidebarStyles.itemLabel,
                                active ? sidebarStyles.itemLabelActive : null,
                                topicStyles.title,
                                {
                                  fontSize: layout.topicFontSize,
                                  lineHeight: layout.topicFontSize + 6,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {session.title}
                            </Text>
                          </SwipeableTopicRow>
                        )
                      })
                    )}
                  </View>
                ) : null}
              </View>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}
