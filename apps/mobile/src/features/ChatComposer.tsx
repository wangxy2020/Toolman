import { useRef } from 'react'
import { Platform, Pressable, Text, TextInput, View } from 'react-native'
import { IconMic, IconSend, IconTranslate } from '../icons/composer-icons'
import { colors } from '../theme'
import { useI18n } from '../i18n'
import { SpinningIcon } from './SpinningIcon'
import { useChatComposer, type ChatComposerProps } from './useChatComposer'
import { useComposerInputActions } from './useComposerInputActions'
import { chatComposerStyles as styles } from './chatComposerStyles'
import {
  ChatComposerEmojiPicker,
  ChatComposerPhraseMenu,
  ChatComposerSlashMenu,
  ChatComposerToolbar,
} from './ChatComposerPopups'

export type { ChatComposerProps }

const DEFAULT_PAD_X = 12

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  busy = false,
  disabled = false,
  placeholder = '输入消息，Enter 发送…',
  mode = 'agent',
  webSearchEnabled = false,
  onToggleWebSearch,
  kbEnabled = false,
  onToggleKb,
  onNewTopic,
  classLive = false,
  onToggleClass,
  classToggleDisabled = false,
  onClear,
  onClearChat,
  onPopupOpenChange,
  popupDismissToken = 0,
  paddingLeft = DEFAULT_PAD_X,
  paddingRight = DEFAULT_PAD_X,
  onError,
  onAttachFile,
}: ChatComposerProps) {
  const { t } = useI18n()
  const {
    fieldHeight,
    emojiOpen,
    slashOpen,
    phraseOpen,
    phrases,
    rootRef,
    canSend,
    isGroup,
    closePopups,
    trySend,
    insertEmoji,
    applySlashCommand,
    applyPhrase,
    toggleEmoji,
    toggleSlash,
    togglePhrase,
    resizePan,
  } = useChatComposer({
    value,
    onChangeText,
    onSend,
    busy,
    disabled,
    mode,
    onClearChat,
    onPopupOpenChange,
    popupDismissToken,
  })
  const inputRef = useRef<TextInput>(null)
  const inputActions = useComposerInputActions({
    value,
    onChangeText,
    disabled,
    busy,
    blurInput: () => inputRef.current?.blur(),
    onError,
  })

  const iconColor = colors.text
  const mutedColor = colors.textSecondary

  return (
    <View style={[styles.area, { paddingLeft, paddingRight }]} ref={rootRef} collapsable={false}>
      <View style={styles.box}>
        <ChatComposerToolbar
          isGroup={isGroup}
          busy={busy}
          disabled={disabled}
          classLive={classLive}
          classToggleDisabled={classToggleDisabled}
          onToggleClass={onToggleClass}
          onNewTopic={onNewTopic}
          onAttachFile={onAttachFile}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={onToggleWebSearch}
          kbEnabled={kbEnabled}
          onToggleKb={onToggleKb}
          emojiOpen={emojiOpen}
          slashOpen={slashOpen}
          phraseOpen={phraseOpen}
          phraseLabel={t('chat.quickPhrases')}
          onToggleEmoji={toggleEmoji}
          onToggleSlash={toggleSlash}
          onTogglePhrase={togglePhrase}
          onClear={onClear}
          value={value}
          resizePanHandlers={resizePan.panHandlers}
        />

        {isGroup && emojiOpen ? <ChatComposerEmojiPicker onInsert={insertEmoji} /> : null}
        {isGroup && slashOpen ? <ChatComposerSlashMenu onApply={applySlashCommand} /> : null}
        {phraseOpen ? (
          <ChatComposerPhraseMenu
            label={t('chat.quickPhrases')}
            emptyLabel={t('quickPhrases.empty')}
            phrases={phrases}
            onApply={applyPhrase}
          />
        ) : null}

        <TextInput
          ref={inputRef}
          style={[styles.field, { height: fieldHeight }]}
          value={value}
          onChangeText={onChangeText}
          onFocus={closePopups}
          placeholder={
            Platform.OS === 'web'
              ? isGroup
                ? '输入群组消息，Enter 发送，Shift+Enter 换行…'
                : '输入消息，Enter 发送，Shift+Enter 换行…'
              : placeholder
          }
          placeholderTextColor={colors.textSecondary}
          multiline
          editable={!disabled}
          blurOnSubmit={false}
          underlineColorAndroid="transparent"
          // @ts-expect-error react-native-web keyboard
          onKeyDown={(e: { key: string; shiftKey?: boolean; preventDefault: () => void }) => {
            if (e.key !== 'Enter' || e.shiftKey) return
            e.preventDefault()
            trySend()
          }}
        />

        <View style={styles.footer}>
          <View style={{ flex: 1 }} />
          <View style={styles.footerActions}>
            {busy && !isGroup ? (
              <Pressable style={styles.abortBtn} onPress={onStop}>
                <Text style={styles.abortText}>停止</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[
                    styles.footerIcon,
                    inputActions.translating ? styles.footerIconActive : null,
                  ]}
                  disabled={!inputActions.canTranslate}
                  onPress={() => void inputActions.translateInput()}
                  accessibilityLabel={inputActions.translating ? '翻译中' : '翻译'}
                >
                  <SpinningIcon spinning={inputActions.translating}>
                    <IconTranslate
                      size={18}
                      color={inputActions.canTranslate || inputActions.translating ? iconColor : mutedColor}
                    />
                  </SpinningIcon>
                </Pressable>
                <Pressable
                  style={[
                    styles.footerIcon,
                    inputActions.listening ? styles.footerIconActive : null,
                  ]}
                  disabled={!inputActions.canVoice}
                  delayLongPress={280}
                  onLongPress={inputActions.startVoiceInput}
                  onPressOut={inputActions.stopVoiceInput}
                  onPress={inputActions.hintVoiceInput}
                  accessibilityLabel={inputActions.listening ? '正在听…' : '长按语音输入'}
                >
                  <IconMic
                    size={18}
                    color={inputActions.canVoice || inputActions.listening ? iconColor : mutedColor}
                  />
                </Pressable>
                <Pressable
                  style={[styles.sendBtn, !canSend ? styles.sendBtnDisabled : null]}
                  disabled={!canSend}
                  onPress={trySend}
                  accessibilityLabel="发送"
                >
                  <IconSend size={18} color="#fff" />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
