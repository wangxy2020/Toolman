import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors } from '../theme'
import { KNOWLEDGE_CREATE_KINDS, type KnowledgeCreateForm } from './knowledgeCreateUtils'
import { knowledgeCreateModalStyles as styles } from './KnowledgeCreateModal.styles'
import { useKnowledgeCreateModal } from './useKnowledgeCreateModal'

export type { KnowledgeCreateForm }

type Props = {
  visible: boolean
  submitting?: boolean
  onClose: () => void
  onSubmit: (input: KnowledgeCreateForm) => Promise<void> | void
}

export function KnowledgeCreateModal(props: Props) {
  const { visible, submitting = false, onClose } = props
  const {
    name,
    changeName,
    kind,
    changeKind,
    description,
    setDescription,
    networkUrl,
    handleUrlChange,
    error,
    isNetwork,
    namePlaceholder,
    kindHint,
    handleSubmit,
  } = useKnowledgeCreateModal(props)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.titleDot} />
              <Text style={styles.title}>添加知识库</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            <Text style={styles.label}>
              名称<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={changeName}
              placeholder={namePlaceholder}
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />

            <Text style={styles.label}>类型</Text>
            <View style={styles.kindRow} accessibilityRole="radiogroup">
              {KNOWLEDGE_CREATE_KINDS.map((item) => {
                const active = kind === item.id
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => changeKind(item.id)}
                    style={({ pressed }) => [styles.kindOption, pressed ? styles.kindOptionPressed : null]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    hitSlop={6}
                  >
                    <View style={[styles.kindRadio, active ? styles.kindRadioActive : null]}>
                      {active ? <View style={styles.kindRadioDot} /> : null}
                    </View>
                    <Text style={styles.kindLabel}>{item.label}</Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.label}>描述</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="简要说明该知识库的用途（可选）"
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            {isNetwork ? (
              <>
                <Text style={styles.label}>网络地址</Text>
                <TextInput
                  style={styles.input}
                  value={networkUrl}
                  onChangeText={handleUrlChange}
                  placeholder="https://example.com/docs"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  editable={!submitting}
                />
                <Text style={styles.hint}>{kindHint}</Text>
              </>
            ) : (
              <Text style={styles.hint}>{kindHint}</Text>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnSecondary,
                pressed ? styles.footerBtnPressed : null,
                submitting ? styles.footerBtnDisabled : null,
              ]}
            >
              <Text style={styles.footerBtnSecondaryText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnPrimary,
                pressed && !submitting ? styles.footerBtnPressed : null,
                submitting ? styles.footerBtnDisabled : null,
              ]}
            >
              <Text style={styles.footerBtnPrimaryText}>{submitting ? '创建中…' : '创建'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
