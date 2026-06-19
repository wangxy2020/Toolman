import { useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'

export interface SystemPaths {
  userData: string
  logs: string
  blobs: string
  temp: string
  home: string
  documents: string
  desktop: string
  downloads: string
}

let cachedSystemPaths: SystemPaths | null = null
let pendingLoad: Promise<SystemPaths | null> | null = null

export async function loadSystemPaths(): Promise<SystemPaths | null> {
  if (cachedSystemPaths) return cachedSystemPaths
  if (pendingLoad) return pendingLoad

  pendingLoad = window.api.invoke(IpcChannel.AppGetPaths).then((result) => {
    pendingLoad = null
    if (!result.ok) return null
    cachedSystemPaths = result.data as SystemPaths
    return cachedSystemPaths
  })

  return pendingLoad
}

export function useSystemPaths() {
  const [systemPaths, setSystemPaths] = useState<SystemPaths | null>(cachedSystemPaths)

  useEffect(() => {
    if (cachedSystemPaths) {
      setSystemPaths(cachedSystemPaths)
      return
    }

    void loadSystemPaths().then(setSystemPaths)
  }, [])

  return systemPaths
}
