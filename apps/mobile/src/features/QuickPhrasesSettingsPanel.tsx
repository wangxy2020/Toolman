import { useEffect, useState } from 'react'
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useI18n } from '../i18n'
import {
  addQuickPhrase,
  loadQuickPhrases,
  removeQuickPhrase,
  updateQuickPhrase,
  type QuickPhrase,
} from '../storage/quickPhrases'
import { colors } from '../theme'
import { IconPlus } from '../icons/composer-icons'
import {
  HeaderAction,
  PrimaryButton,
  SecondaryButton,
  Section,
  SettingsScroll,
  settingsUiStyles as styles,
} from './settingsUi'

export function QuickPhrasesSettingsPanel() {
  const { t } = useI18n()
  const [phrases, setPhrases] = useState<QuickPhrase[]>([])
  const [editing, setEditing] = useState<QuickPhrase | null | 'new'>(null)

  useEffect(() => {
    void loadQuickPhrases().then(setPhrases)
  }, [])

  const handleSave = async (data: { label: string; text: string }) => {
    const next =
      editing && editing !== 'new'
        ? await updateQuickPhrase(editing.id, data)
        : await addQuickPhrase(data.text, data.label)
    setPhrases(next)
    setEditing(null)
  }

  const handleDelete = (phrase: QuickPhrase) => {
    const confirmText = t('quickPhrases.deleteConfirm', { label: phrase.label })
    const apply = () => {
      void removeQuickPhrase(phrase.id).then(setPhrases)
    }
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(confirmText)) apply()
      return
    }
    Alert.alert(t('common.delete'), confirmText, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: apply },
    ])
  }

  return (
    <>
      <SettingsScroll>
        <Section
          title={t('quickPhrases.title')}
          trailing={
            <HeaderAction
              label={t('common.add')}
              icon={<IconPlus size={14} color={colors.accent} />}
              onPress={() => setEditing('new')}
            />
          }
        >
          <Text style={styles.hint}>{t('quickPhrases.intro')}</Text>
          {phrases.length === 0 ? (
            <Text style={styles.hint}>{t('quickPhrases.empty')}</Text>
          ) : (
            phrases.map((phrase) => (
              <View key={phrase.id} style={local.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={local.label} numberOfLines={1}>
                    {phrase.label}
                  </Text>
                  <Text style={styles.hint} numberOfLines={2}>
                    {phrase.text}
                  </Text>
                </View>
                <Pressable onPress={() => setEditing(phrase)} hitSlop={8}>
                  <Text style={styles.linkText}>{t('quickPhrases.edit')}</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(phrase)} hitSlop={8}>
                  <Text style={[styles.linkText, { color: colors.danger }]}>{t('common.delete')}</Text>
                </Pressable>
              </View>
            ))
          )}
        </Section>
      </SettingsScroll>
      {editing !== null ? (
        <QuickPhraseEditModal
          phrase={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => void handleSave(data)}
        />
      ) : null}
    </>
  )
}

function QuickPhraseEditModal(props: {
  phrase: QuickPhrase | null
  onClose: () => void
  onSave: (data: { label: string; text: string }) => void
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState(props.phrase?.label ?? '')
  const [text, setText] = useState(props.phrase?.text ?? '')

  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={local.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={local.dialog} onStartShouldSetResponder={() => true}>
          <Text style={local.title}>
            {props.phrase ? t('quickPhrases.editTitle') : t('quickPhrases.addTitle')}
          </Text>
          <Text style={styles.label}>{t('quickPhrases.label')}</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder={t('quickPhrases.labelPlaceholder')}
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={styles.label}>{t('quickPhrases.content')}</Text>
          <TextInput
            style={[styles.input, local.textarea]}
            value={text}
            onChangeText={setText}
            placeholder={t('quickPhrases.contentPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <Text style={styles.hint}>{t('quickPhrases.hint')}</Text>
          <View style={local.actions}>
            <SecondaryButton label={t('common.cancel')} onPress={props.onClose} />
            <PrimaryButton
              label={t('common.save')}
              onPress={() => {
                if (!text.trim()) return
                props.onSave({ label: label.trim(), text: text.trim() })
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const local = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
})
