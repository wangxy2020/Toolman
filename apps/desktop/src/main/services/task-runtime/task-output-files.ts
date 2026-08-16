import type { AgentTask } from '@toolman/shared'

import {
  collectOutputPathsFromTaskProse,
  collectRecentWorkspaceOutputPaths,
  collectTaskArtifactOutputPaths,
  collectTaskOutputPathsFromHistory,
  sortTaskOutputPaths,
} from './task-output-files-collect'

export {
  OUTPUT_FILE_PATTERN,
  isTaskOutputWriteTool,
  extractTaskToolOutputPathsFromArgs,
  extractFileCandidatesFromText,
} from './task-output-files-extract'

export { resolveTaskOutputFilePath } from './task-output-files-resolve'

export { collectTaskOutputPathsFromHistory } from './task-output-files-collect'

/** Prefer tool/artifact outputs; avoid mtime/prose false positives when history exists. */
export function resolveTaskOutputFileLinks(task: AgentTask): string[] {
  const paths = new Set<string>()

  for (const path of collectTaskOutputPathsFromHistory(task)) {
    paths.add(path)
  }
  for (const path of collectTaskArtifactOutputPaths(task)) {
    paths.add(path)
  }

  if (paths.size === 0) {
    for (const path of collectOutputPathsFromTaskProse(task)) {
      paths.add(path)
    }
    for (const path of collectRecentWorkspaceOutputPaths(task)) {
      paths.add(path)
    }
  }

  return sortTaskOutputPaths(task, [...paths])
}

export function discoverTaskOutputFilePaths(task: AgentTask): string[] {
  return resolveTaskOutputFileLinks(task)
}
