import {
  IpcChannel,
  type CommunityNewsArticle,
  type CommunityNewsComment,
  type CommunityNewsCommentCreateInput,
  type CommunityNewsCommentListInput,
  type CommunityNewsInteractionOutput,
  type CommunityNewsListInput,
  type CommunityNewsRecommendedOutput,
  type CommunityNewsSource,
  type CommunityNewsSourceCreateInput,
  type CommunityNewsSourceFetchInput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function listCommunityNewsArticles(
  input: CommunityNewsListInput = {},
): Promise<{ items: CommunityNewsArticle[] }> {
  return invokeIpc(IpcChannel.CommunityNewsList, input)
}

export async function getCommunityNewsArticle(id: string): Promise<CommunityNewsArticle> {
  return invokeIpc(IpcChannel.CommunityNewsGet, { id })
}

export async function listRecommendedCommunityNews(): Promise<CommunityNewsRecommendedOutput> {
  return invokeIpc(IpcChannel.CommunityNewsRecommended)
}

export async function favoriteCommunityNewsArticle(
  articleId: string,
): Promise<CommunityNewsInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityNewsFavorite, { articleId })
}

export async function likeCommunityNewsArticle(
  articleId: string,
): Promise<CommunityNewsInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityNewsLike, { articleId })
}

export async function dislikeCommunityNewsArticle(
  articleId: string,
): Promise<CommunityNewsInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityNewsDislike, { articleId })
}

export async function listCommunityNewsSources(): Promise<{ items: CommunityNewsSource[] }> {
  return invokeIpc(IpcChannel.CommunityNewsSourceList)
}

export async function createCommunityNewsSource(
  input: CommunityNewsSourceCreateInput,
): Promise<CommunityNewsSource> {
  return invokeIpc(IpcChannel.CommunityNewsSourceCreate, input)
}

export async function deleteCommunityNewsSource(sourceId: string): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityNewsSourceDelete, { sourceId })
}

export async function fetchCommunityNewsSource(
  input: CommunityNewsSourceFetchInput,
): Promise<unknown> {
  return invokeIpc(IpcChannel.CommunityNewsSourceFetch, input)
}

export async function listCommunityNewsComments(
  input: CommunityNewsCommentListInput,
): Promise<{ items: CommunityNewsComment[] }> {
  return invokeIpc(IpcChannel.CommunityNewsCommentList, input)
}

export async function createCommunityNewsComment(
  input: CommunityNewsCommentCreateInput,
): Promise<CommunityNewsComment> {
  return invokeIpc(IpcChannel.CommunityNewsCommentCreate, input)
}
