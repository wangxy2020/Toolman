import { fetchDirectCommunityNewsFromFeeds } from '../apps/mobile/src/features/communityNewsDirect'

type NodeReq = { method?: string }
type NodeRes = {
  status: (code: number) => NodeRes
  json: (body: unknown) => void
  end: () => void
}

export default async function handler(req: NodeReq, res: NodeRes): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: { message: 'Method not allowed' } })
    return
  }
  try {
    const items = await fetchDirectCommunityNewsFromFeeds()
    res.status(200).json({ ok: true, data: items })
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: { message: error instanceof Error ? error.message : '资讯拉取失败' },
    })
  }
}
