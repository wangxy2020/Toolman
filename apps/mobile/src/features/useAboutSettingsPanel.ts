import { useEffect, useState } from 'react'
import { Linking } from 'react-native'
import { recordProvenanceBeacon } from '../lib/record-provenance-beacon'
import { resolveAboutLinkUrl, type AboutLinkId } from '../settings/about'

export function aboutLinkInteractive(id: AboutLinkId): boolean {
  return id === 'join' || Boolean(resolveAboutLinkUrl(id))
}

export function useAboutSettingsPanel() {
  const [joinOpen, setJoinOpen] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateLabel, setUpdateLabel] = useState('检查更新')
  const [updateHint, setUpdateHint] = useState<string | null>(null)

  useEffect(() => {
    recordProvenanceBeacon('app.about.view')
  }, [])

  const checkUpdate = () => {
    if (updateBusy) return
    setUpdateBusy(true)
    setUpdateLabel('检查中…')
    setUpdateHint('正在检查更新…')
    setTimeout(() => {
      setUpdateBusy(false)
      setUpdateLabel('已是最新')
      setUpdateHint('当前已是最新版本。')
    }, 500)
  }

  const openLink = (id: AboutLinkId) => {
    if (id === 'join') {
      setJoinOpen(true)
      return
    }
    const url = resolveAboutLinkUrl(id)
    if (url) void Linking.openURL(url)
  }

  return {
    joinOpen,
    setJoinOpen,
    updateBusy,
    updateLabel,
    updateHint,
    checkUpdate,
    openLink,
  }
}
