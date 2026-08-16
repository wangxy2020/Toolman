import { ScrollView, Text, View } from 'react-native'
import { shellStyles } from '../theme'
import { STREAM_PAD_SIDE } from './agentPaneUtils'
import { agentStreamStyles as styles } from './agentStreamStyles'
import { AgentStreamMessage } from './AgentStreamMessage'
import { ChatComposer } from './ChatComposer'
import { ChatMessageContextMenu } from './ChatMessageContextMenu'
import { useRegisterModulePanelStatus } from './modulePageStatus'
import { useAgentRightPane } from './useAgentRightPane'

export function AgentRightPane() {
  const pane = useAgentRightPane()
  useRegisterModulePanelStatus('classroom-sync', pane.classroomStatus)

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={pane.streamScrollRef}
        style={styles.streamScroll}
        contentContainerStyle={styles.streamContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => pane.scrollStreamToEnd(false)}
        // @ts-expect-error react-native-web className
        className="tm-agent-stream-scroll"
      >
        {!pane.session || pane.session.messages.length === 0 ? (
          <Text style={shellStyles.emptyHint}>
            {pane.agentScope === 'classroom'
              ? '在下方提问开始上课。'
              : '在下方输入问题开始对话。可先点击「Toolman」配置 API，或新建左侧会话。对话会保存在本机。'}
          </Text>
        ) : (
          pane.session.messages.map((msg) => (
            <AgentStreamMessage key={msg.id} msg={msg} pane={pane} />
          ))
        )}
      </ScrollView>

      {pane.error ? <Text style={styles.error}>{pane.error}</Text> : null}
      {pane.actionHint ? <Text style={styles.hint}>{pane.actionHint}</Text> : null}

      <ChatComposer
        value={pane.input}
        onChangeText={pane.setInput}
        busy={pane.busy}
        disabled={pane.groupAgentReadOnly}
        placeholder={
          pane.groupAgentReadOnly ? '该话题为仅阅读，无法调用' : undefined
        }
        onSend={() => void pane.send()}
        onStop={() => pane.abortRef.current?.abort()}
        classLive={pane.classLive}
        classToggleDisabled={!pane.classroomCourse}
        onToggleClass={
          pane.agentScope === 'classroom' ? pane.toggleClass : undefined
        }
        webSearchEnabled={pane.webSearchEnabled}
        onToggleWebSearch={() => pane.patchToolbar({ webSearchEnabled: !pane.webSearchEnabled })}
        kbEnabled={pane.kbEnabled}
        onToggleKb={() => pane.patchToolbar({ kbEnabled: !pane.kbEnabled })}
        useDesktopHost={pane.useDesktopHost}
        onToggleDesktopHost={() => pane.patchToolbar({ useDesktopHost: !pane.useDesktopHost })}
        paddingLeft={STREAM_PAD_SIDE}
        paddingRight={STREAM_PAD_SIDE}
        onNewTopic={
          pane.agentScope === 'classroom' || pane.session?.groupAgent
            ? undefined
            : pane.startNewTopic
        }
        onClear={() => pane.setInput('')}
        onError={pane.setError}
      />

      <ChatMessageContextMenu
        visible={Boolean(pane.userMenu)}
        x={pane.userMenu?.x ?? 0}
        y={pane.userMenu?.y ?? 0}
        onClose={() => pane.setUserMenu(null)}
        items={
          pane.userMenu
            ? [
                {
                  id: 'copy',
                  label: '复制',
                  onPress: () => {
                    void pane.copyMessage(pane.userMenu!.msg)
                  },
                },
                {
                  id: 'edit',
                  label: '编辑',
                  onPress: () => pane.editUserMessage(pane.userMenu!.msg),
                },
                {
                  id: 'delete',
                  label: '删除',
                  danger: true,
                  onPress: () => pane.deleteMessage(pane.userMenu!.msg.id),
                },
                {
                  id: 'select',
                  label: '选择',
                  onPress: () => pane.enterMessageSelection(pane.userMenu!.msg.id),
                },
                {
                  id: 'select-all',
                  label: '全选',
                  onPress: pane.selectAllMessages,
                },
                {
                  id: 'cancel',
                  label: '取消',
                  onPress: pane.clearUserMessageSelection,
                },
              ]
            : []
        }
      />
    </View>
  )
}
