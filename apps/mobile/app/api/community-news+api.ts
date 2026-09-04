import { fetchDirectCommunityNewsFromFeeds } from '../../src/features/communityNewsDirect'

export async function GET(): Promise<Response> {
  try {
    const items = await fetchDirectCommunityNewsFromFeeds()
    return Response.json({ ok: true, data: items })
  } catch (error) {
    const message = error instanceof Error ? error.message : '资讯拉取失败'
    return Response.json({ ok: false, error: { message } }, { status: 502 })
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 })
}
