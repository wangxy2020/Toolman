import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useI18n } from '../i18n'
import {
  IconAgent,
  IconClassroom,
  IconCommunity,
  IconGroup,
  IconKnowledge,
  IconNotes,
  IconProjects,
} from '../icons/nav-icons'
import type { TopNavModuleId } from '../module-ids'
import {
  hideNavModule,
  LOCKED_TOP_MODULE,
  normalizeNavModules,
  showNavModule,
} from '../settings/nav-visibility'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import { HeaderAction, Section, SettingsScroll, settingsUiStyles as styles } from './settingsUi'

const MODULE_ICONS: Record<
  TopNavModuleId,
  typeof IconAgent
> = {
  agent: IconAgent,
  knowledge: IconKnowledge,
  notes: IconNotes,
  group: IconGroup,
  community: IconCommunity,
  classroom: IconClassroom,
  projects: IconProjects,
}

export function DisplaySettingsPanel() {
  const { t } = useI18n()
  const { module, setModule, modulePrefs, setModulePrefs } = useMobileApp()
  const nav = modulePrefs.nav

  const persist = async (nextNav: typeof nav) => {
    const next = { ...modulePrefs, nav: nextNav }
    setModulePrefs(next)
    await saveModulePrefs(next)
    if (!nextNav.visibleModuleIds.includes(module as TopNavModuleId)) {
      setModule(LOCKED_TOP_MODULE)
    }
  }

  return (
    <SettingsScroll>
      <Section
        title={t('display.menuTitle')}
        trailing={
          <HeaderAction
            tone="muted"
            label={t('common.reset')}
            onPress={() => void persist(normalizeNavModules())}
          />
        }
      >
        <View style={local.columns}>
          <ModuleColumn title={t('display.menuVisible')}>
            {nav.visibleModuleIds.map((id) => (
              <ModuleItem
                key={id}
                id={id}
                label={t(`modules.${id}`)}
                actionLabel={t('display.hideModule')}
                onAction={
                  id === LOCKED_TOP_MODULE
                    ? undefined
                    : () => void persist(hideNavModule(nav, id))
                }
              />
            ))}
          </ModuleColumn>
          <ModuleColumn title={t('display.menuHidden')}>
            {nav.hiddenModuleIds.length === 0 ? (
              <Text style={local.empty}>{t('display.menuHiddenEmpty')}</Text>
            ) : (
              nav.hiddenModuleIds.map((id) => (
                <ModuleItem
                  key={id}
                  id={id}
                  label={t(`modules.${id}`)}
                  actionLabel={t('display.showModule')}
                  actionKind="add"
                  onAction={() => void persist(showNavModule(nav, id))}
                />
              ))
            )}
          </ModuleColumn>
        </View>
        <Text style={styles.hint}>{t('display.menuHint')}</Text>
      </Section>
    </SettingsScroll>
  )
}

function ModuleColumn(props: { title: string; children: ReactNode }) {
  return (
    <View style={local.column}>
      <Text style={local.columnTitle}>{props.title}</Text>
      <View style={local.list}>{props.children}</View>
    </View>
  )
}

function ModuleItem(props: {
  id: TopNavModuleId
  label: string
  actionLabel: string
  actionKind?: 'remove' | 'add'
  onAction?: () => void
}) {
  const Icon = MODULE_ICONS[props.id]
  const add = props.actionKind === 'add'

  return (
    <View style={local.item}>
      <Icon size={16} color={colors.text} />
      <Text style={local.itemLabel} numberOfLines={1}>
        {props.label}
      </Text>
      {props.onAction ? (
        <Pressable
          onPress={props.onAction}
          hitSlop={6}
          accessibilityLabel={`${props.actionLabel} ${props.label}`}
          style={({ pressed }) => [
            local.actionBtn,
            add ? local.actionBtnAdd : null,
            pressed ? (add ? local.actionBtnAddPressed : local.actionBtnPressed) : null,
          ]}
        >
          <Text style={[local.actionMark, add ? local.actionMarkAdd : null]}>
            {add ? '+' : '×'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const local = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  column: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.navBg,
    borderRadius: 10,
    padding: 10,
    minHeight: 160,
  },
  columnTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  list: {
    gap: 8,
  },
  empty: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingVertical: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 6,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  actionBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.hover,
  },
  actionBtnPressed: {
    backgroundColor: '#fee2e2',
  },
  actionBtnAdd: {
    backgroundColor: colors.accentSoft,
  },
  actionBtnAddPressed: {
    backgroundColor: '#cfeedd',
  },
  actionMark: {
    fontSize: 14,
    lineHeight: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  actionMarkAdd: {
    color: colors.accent,
  },
})
