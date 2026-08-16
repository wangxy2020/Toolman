import { Text } from 'react-native'
import {
  DEFAULT_KNOWLEDGE_CHUNK_CONFIG,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER,
  KNOWLEDGE_WATCH_OFFICE_TEMP_EXCLUDE_HINT,
  KNOWLEDGE_WATCH_SUPPORTED_TYPES_HINT,
} from '@toolman/shared'
import { SettingsDialogFrame } from './SettingsDialogFrame'
import {
  SettingsInfoRow,
  SettingsSectionTitle,
  SettingsTextArea,
} from './settingsModalFields'
import { Field, Toggle, settingsUiStyles as styles } from './settingsUi'
import { knowledgeChunkStrategyLabel } from './knowledgeSettingsUtils'
import { useKnowledgeSettingsModal } from './useKnowledgeSettingsModal'

type Props = {
  visible: boolean
  onClose: () => void
}

export function KnowledgeSettingsModal({ visible, onClose }: Props) {
  const {
    knowledgeUi,
    activeTab,
    setActiveTab,
    syncEnabled,
    setSyncEnabled,
    preferDesktopIndex,
    setPreferDesktopIndex,
    name,
    setName,
    description,
    setDescription,
    networkUrl,
    setNetworkUrl,
    watchInclude,
    setWatchInclude,
    watchExclude,
    setWatchExclude,
    watchDebounceMs,
    setWatchDebounceMs,
    urlRefreshIntervalHours,
    setUrlRefreshIntervalHours,
    error,
    isLocalKb,
    isNetworkKb,
    isCreated,
    nameReadOnly,
    canEditWatch,
    tabs,
    title,
    handleSave,
  } = useKnowledgeSettingsModal({ visible, onClose })

  return (
    <SettingsDialogFrame
      visible={visible}
      title={title}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as typeof activeTab)}
      onClose={onClose}
      onSave={() => void handleSave()}
      saveLabel="保存配置"
    >
      {error ? <Text style={styles.hintError}>{error}</Text> : null}

      {activeTab === 'basic' ? (
        <>
          {!knowledgeUi?.activeKbId ? (
            <Text style={styles.hint}>请先在左侧选择一个知识库。</Text>
          ) : null}
          <Field
            label="名称"
            value={name}
            onChangeText={setName}
            editable={!nameReadOnly}
          />
          <SettingsTextArea
            label="描述 (可选)"
            value={description}
            onChangeText={setDescription}
            placeholder="选填"
            editable={isCreated && !nameReadOnly}
            minHeight={72}
          />
          {isNetworkKb ? (
            <>
              <Field
                label="网页地址"
                value={networkUrl}
                onChangeText={setNetworkUrl}
                editable={canEditWatch}
                placeholder="https://"
                keyboardType="url"
              />
              <Text style={styles.hint}>
                在主界面拖拽或添加 HTTP/HTTPS 网页链接，系统会抓取页面内容并建立索引。
              </Text>
            </>
          ) : null}
          <SettingsInfoRow
            label="存储目录"
            value={
              isCreated
                ? '本机应用存储（移动端）'
                : '由桌面端知识库目录管理'
            }
          />
          <Field label="嵌入模型" value="由桌面端配置" editable={false} />
          <Text style={styles.hint}>用于将文档内容转换为向量，修改后需在桌面端重建索引。</Text>
          <Toggle
            label="与桌面端自动同步"
            value={syncEnabled}
            onChange={setSyncEnabled}
          />
          <Text style={styles.hint}>
            完整知识库正文与向量仅局域网可用；跨网先同步目录元数据。
          </Text>
          <Toggle
            label="检索优先走桌面宿主"
            value={preferDesktopIndex}
            onChange={setPreferDesktopIndex}
          />
        </>
      ) : null}

      {activeTab === 'watch' && isLocalKb ? (
        <>
          <SettingsSectionTitle>包含规则</SettingsSectionTitle>
          <Text style={styles.hint}>
            {canEditWatch ? '● 规则保存在本机' : '● 未监听 · 请在桌面端配置文件夹监听'}
          </Text>
          <SettingsTextArea
            value={watchInclude}
            onChangeText={setWatchInclude}
            placeholder={KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER}
            editable={canEditWatch}
            minHeight={96}
          />
          <Text style={styles.hint}>{KNOWLEDGE_WATCH_SUPPORTED_TYPES_HINT}</Text>
          <SettingsTextArea
            label="排除规则"
            value={watchExclude}
            onChangeText={setWatchExclude}
            placeholder={DEFAULT_KNOWLEDGE_WATCH_CONFIG.exclude.join('\n')}
            editable={canEditWatch}
            hint="每行一个 glob 模式，匹配到的文件将跳过索引。"
            minHeight={88}
          />
          <Text style={styles.hint}>{KNOWLEDGE_WATCH_OFFICE_TEMP_EXCLUDE_HINT}</Text>
          <Field
            label="防抖间隔（毫秒）"
            value={watchDebounceMs}
            onChangeText={setWatchDebounceMs}
            editable={canEditWatch}
            keyboardType="number-pad"
            placeholder={String(DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs)}
          />
          <Text style={styles.hint}>文件变更后等待多久再触发重新索引。监听在桌面端生效。</Text>
        </>
      ) : null}

      {activeTab === 'watch' && isNetworkKb ? (
        <>
          <Field
            label="刷新间隔（小时）"
            value={urlRefreshIntervalHours}
            onChangeText={setUrlRefreshIntervalHours}
            editable={canEditWatch}
            keyboardType="number-pad"
            placeholder="0"
          />
          <Text style={styles.hint}>定时重新抓取并索引知识库内全部网页，0 表示关闭。抓取在桌面端执行。</Text>
        </>
      ) : null}

      {activeTab === 'memory' ? (
        <>
          <SettingsSectionTitle>自动保存的上下文记忆</SettingsSectionTitle>
          <Text style={styles.hint}>
            知识库级长期记忆条目在桌面端查看与编辑。移动端可在「系统设置 → 记忆」开关记忆提示，并设置保留天数。
          </Text>
        </>
      ) : null}

      {activeTab === 'advanced' ? (
        <>
          {isLocalKb ? (
            <Field label="文档处理" value="由桌面端选择服务商" editable={false} />
          ) : null}
          <Field label="重排模型" value="由桌面端配置" editable={false} />
          <Field
            label="分块策略"
            value={knowledgeChunkStrategyLabel()}
            editable={false}
          />
          <Field
            label="分段大小"
            value={String(DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkSize)}
            editable={false}
          />
          <Field
            label="重叠大小"
            value={String(DEFAULT_KNOWLEDGE_CHUNK_CONFIG.chunkOverlap)}
            editable={false}
          />
          <Field label="匹配度阈值" value="0.3" editable={false} />
          <Field label="向量存储" value="JSON 文件（默认）" editable={false} />
          <Text style={styles.hint}>
            向量化、切片、重排与索引任务请在桌面端知识库设置中修改并重建。移动端用于浏览已同步内容并检索。
          </Text>
        </>
      ) : null}
    </SettingsDialogFrame>
  )
}
