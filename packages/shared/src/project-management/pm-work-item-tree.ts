import type { PmWorkItem } from './pm-types.js'

export type PmWorkItemTreeNode = {
  item: PmWorkItem
  children: PmWorkItemTreeNode[]
}

export function buildPmWorkItemForest(items: PmWorkItem[]): PmWorkItemTreeNode[] {
  const nodes = new Map<string, PmWorkItemTreeNode>()
  for (const item of items) {
    nodes.set(item.id, { item, children: [] })
  }

  const roots: PmWorkItemTreeNode[] = []
  for (const item of items) {
    const node = nodes.get(item.id)
    if (!node) continue
    if (item.parentId && nodes.has(item.parentId)) {
      nodes.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (list: PmWorkItemTreeNode[]) => {
    list.sort((left, right) => {
      if (left.item.sortOrder !== right.item.sortOrder) {
        return left.item.sortOrder - right.item.sortOrder
      }
      return left.item.title.localeCompare(right.item.title, 'zh-CN')
    })
    for (const node of list) {
      sortNodes(node.children)
    }
  }

  sortNodes(roots)
  return roots
}

export function flattenPmWorkItemForest(
  roots: PmWorkItemTreeNode[],
): Array<{ item: PmWorkItem; depth: number }> {
  const rows: Array<{ item: PmWorkItem; depth: number }> = []

  const walk = (nodes: PmWorkItemTreeNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ item: node.item, depth })
      walk(node.children, depth + 1)
    }
  }

  walk(roots, 0)
  return rows
}

export function wouldCreatePmWorkItemCycle(
  items: PmWorkItem[],
  workItemId: string,
  parentId: string,
): boolean {
  if (workItemId === parentId) {
    return true
  }

  const parentById = new Map(items.map((item) => [item.id, item.parentId]))
  let current: string | undefined = parentId
  const visited = new Set<string>()

  while (current) {
    if (current === workItemId) {
      return true
    }
    if (visited.has(current)) {
      return true
    }
    visited.add(current)
    current = parentById.get(current) ?? undefined
  }

  return false
}
