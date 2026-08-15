import { proxyCommunityHubRequest } from '../../../src/features/communityHubProxy'

export async function GET(request: Request): Promise<Response> {
  return proxyCommunityHubRequest(request)
}

export async function POST(request: Request): Promise<Response> {
  return proxyCommunityHubRequest(request)
}

export async function PATCH(request: Request): Promise<Response> {
  return proxyCommunityHubRequest(request)
}

export async function PUT(request: Request): Promise<Response> {
  return proxyCommunityHubRequest(request)
}

export async function DELETE(request: Request): Promise<Response> {
  return proxyCommunityHubRequest(request)
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 })
}
