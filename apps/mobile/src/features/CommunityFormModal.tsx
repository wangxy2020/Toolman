import { type ReactNode } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { communityPublishModalStyles as styles } from './communityPublishModalStyles'

export type CommunityFormModalProps = {
  visible: boolean
  title: string
  confirmLabel: string
  submitting?: boolean
  confirmDisabled?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
  children: ReactNode
}

export function CommunityFormModal(props: CommunityFormModalProps) {
  const {
    visible,
    title,
    confirmLabel,
    submitting = false,
    confirmDisabled = false,
    error,
    onClose,
    onConfirm,
    children,
  } = props

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
              <Text style={styles.title}>{title}</Text>
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
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {children}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnSecondary,
                pressed ? styles.footerBtnPressed : null,
              ]}
            >
              <Text style={styles.footerBtnSecondaryText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={submitting || confirmDisabled}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnPrimary,
                submitting || confirmDisabled ? styles.footerBtnDisabled : null,
                pressed ? styles.footerBtnPressed : null,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.footerBtnPrimaryText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
