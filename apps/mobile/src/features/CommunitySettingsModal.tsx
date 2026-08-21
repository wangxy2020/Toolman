import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { saveModulePrefs } from '../settings/prefs'
import { pickReachableCommunityHubBaseUrl, resolveCommunityHubBaseUrl } from '../settings/communityHubUrl'
import { useMobileApp } from '../state/MobileAppContext'
import { communityHubProbeFlags, isHostedWebPage } from '../sync/desktopDevHost'
import { whenLocalNetworkAccessGranted } from '../sync/localNetworkFetch'
import {
  fetchCommunityHubHealth,
  fetchFederationCatalogCount,
  fetchFederationPeering,
  probeCommunityHub,
  type CommunityHubHealth,
  type FederationPeeringInfo,
} from './communityHubClient'
import { CommunityNewsSourcesModal } from './CommunityPublishModals'
import { SettingsDialogFrame } from './SettingsDialogFrame'
import { SettingsInfoRow, SettingsSectionTitle } from './settingsModalFields'
import { Field, Toggle, settingsUiStyles as styles } from './settingsUi'

type Props = {
  visible: boolean
  onClose: () => void
}

type SettingsTab = 'hub' | 'federation' | 'rss'

function portFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.port) return parsed.port
    return parsed.protocol === 'https:' ? '443' : '80'
  } catch {
    return '3721'
  }
}

export function CommunitySettingsModal({ visible, onClose }: Props) {
  const { modulePrefs, setModulePrefs, auth } = useMobileApp()
  const [activeTab, setActiveTab] = useState<SettingsTab>('hub')
  const [hubBaseUrl, setHubBaseUrl] = useState('')
  const [guestReadOnly, setGuestReadOnly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<CommunityHubHealth | null>(null)
  const [peering, setPeering] = useState<FederationPeeringInfo | null>(null)
  const [catalogCount, setCatalogCount] = useState<number | null>(null)
  const [liveUrl, setLiveUrl] = useState(() => resolveCommunityHubBaseUrl(''))

  const resolvedUrl = liveUrl || resolveCommunityHubBaseUrl(hubBaseUrl)

  const loadHub = useCallback(async (configured: string, includeLoopback?: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const flags = communityHubProbeFlags()
      const picked = await pickReachableCommunityHubBaseUrl(configured, probeCommunityHub, {
        ...flags,
        includeLoopback: includeLoopback ?? flags.includeLoopback,
      })
      setLiveUrl(picked.url)
      if (!picked.online) {
        throw new Error('无法连接社区 Hub')
      }
      const nextHealth = await fetchCommunityHubHealth(picked.url)
      setHealth(nextHealth)
      const [nextPeering, count] = await Promise.all([
        fetchFederationPeering(picked.url).catch(() => null),
        fetchFederationCatalogCount(picked.url).catch(() => null),
      ])
      setPeering(nextPeering)
      setCatalogCount(count)
    } catch (loadError) {
      setHealth(null)
      setPeering(null)
      setCatalogCount(null)
      setError(loadError instanceof Error ? loadError.message : '加载 Hub 状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    setActiveTab('hub')
    setHubBaseUrl(modulePrefs.community.hubBaseUrl)
    setGuestReadOnly(modulePrefs.community.guestReadOnly)
    setError(null)
    const configured = resolveCommunityHubBaseUrl(modulePrefs.community.hubBaseUrl)
    const hosted = isHostedWebPage()
    void loadHub(configured, hosted ? false : undefined)
    if (!hosted) return
    return whenLocalNetworkAccessGranted(() => {
      void loadHub(configured, true)
    })
  }, [visible, modulePrefs.community, loadHub])

  const handleSave = async () => {
    const next = {
      ...modulePrefs,
      community: {
        hubBaseUrl: hubBaseUrl.trim(),
        guestReadOnly,
      },
    }
    setModulePrefs(next)
    await saveModulePrefs(next)
    onClose()
  }

  const connected = health?.status === 'ok' || health?.status === 'healthy' || Boolean(health)
  const hubStatusText = error
    ? '不可用'
    : loading
      ? '加载中…'
      : connected
        ? '已连接'
        : '未连接'
  const connectionMode = hubBaseUrl.trim() ? '远程 Hub' : '本地 Sidecar'

  return (
    <SettingsDialogFrame
      visible={visible}
      title="社区设置"
      subtitle="Community Hub 连接与资讯源配置"
      tabs={[
        { id: 'hub', label: 'Hub 服务' },
        { id: 'federation', label: '联邦 Peering' },
        { id: 'rss', label: '资讯源' },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as SettingsTab)}
      onClose={onClose}
      onSave={() => void handleSave()}
      saveLabel="保存"
    >
      {error && activeTab !== 'rss' ? <Text style={styles.hintError}>{error}</Text> : null}

      {activeTab === 'hub' ? (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <SettingsSectionTitle>Hub 服务状态</SettingsSectionTitle>
            <Pressable onPress={() => void loadHub(hubBaseUrl)} hitSlop={8}>
              <Text style={styles.linkText}>{loading ? '刷新中…' : '刷新'}</Text>
            </Pressable>
          </View>
          <Field
            label="社区 Hub 地址"
            value={hubBaseUrl}
            onChangeText={setHubBaseUrl}
            placeholder={resolveCommunityHubBaseUrl('')}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            留空则自动探测本机 / 局域网桌面社区 Hub（端口 3721）。真机或跨网请填写电脑的局域网或 Tailscale 地址。
          </Text>
          <SettingsInfoRow label="连接模式" value={connectionMode} />
          <SettingsInfoRow label="运行状态" value={hubStatusText} />
          <SettingsInfoRow label="访问地址" value={resolvedUrl} />
          <SettingsInfoRow label="端口" value={portFromUrl(resolvedUrl)} />
          {health?.version ? <SettingsInfoRow label="版本" value={health.version} /> : null}
          {health?.dataDir ? (
            <SettingsInfoRow label="数据目录" value={health.dataDir} mono />
          ) : null}
          {health ? <SettingsInfoRow label="社区用户" value={String(health.userCount)} /> : null}
          {health ? (
            <SettingsInfoRow label="资源数量" value={String(health.resourceCount)} />
          ) : null}
          <Toggle label="未登录时只读" value={guestReadOnly} onChange={setGuestReadOnly} />
          <Text style={styles.hint}>
            {hubBaseUrl.trim()
              ? '已填写 Hub 地址。资讯 RSS 由该 Hub 本地拉取，不走联邦。留言与市场目录由桌面端 P2P 联邦同步；网页/手机写入该 Hub 后由桌面对外共享。'
              : '资讯 RSS 由本机桌面 Hub 拉取，不依赖联邦。留言与资源共享走桌面 P2P 联邦；网页/手机连上该 Hub 即可发布。'}
          </Text>
        </>
      ) : null}

      {activeTab === 'federation' ? (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <SettingsSectionTitle>F1 Hub Peering</SettingsSectionTitle>
            <Pressable onPress={() => void loadHub(hubBaseUrl)} hitSlop={8}>
              <Text style={styles.linkText}>{loading ? '刷新中…' : '刷新'}</Text>
            </Pressable>
          </View>
          <SettingsInfoRow
            label="P2P 联邦"
            value={peering?.federationPeering || health?.federationPeering ? '已开启' : '已关闭'}
          />
          <SettingsInfoRow
            label="Hub Peering API"
            value={peering ? '可用' : loading ? '检查中…' : '不可用'}
          />
          <SettingsInfoRow
            label="联邦目录缓存"
            value={catalogCount == null ? '—' : `${catalogCount} 条`}
          />
          {peering?.baseUrl ? (
            <SettingsInfoRow label="Peer Hub 地址" value={peering.baseUrl} />
          ) : null}
          {peering?.latestUpdatedAt ? (
            <SettingsInfoRow
              label="上次同步"
              value={new Date(peering.latestUpdatedAt).toLocaleString()}
            />
          ) : (
            <SettingsInfoRow label="上次同步" value="尚未同步" />
          )}
          <Text style={styles.hint}>
            Peer Hub 地址保存在 Community 数据目录的 hub.json 中，请在桌面端社区设置里编辑。移动端只读查看当前 Hub 的联邦状态。
          </Text>
        </>
      ) : null}

      {activeTab === 'rss' ? (
        <CommunityNewsSourcesModal
          visible={visible}
          embedded
          hubBaseUrl={resolvedUrl}
          userId={auth?.identityId ?? null}
          onClose={onClose}
          onPublished={() => undefined}
        />
      ) : null}
    </SettingsDialogFrame>
  )
}
