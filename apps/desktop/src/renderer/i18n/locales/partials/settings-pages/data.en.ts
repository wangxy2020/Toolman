export const settingsPagesDataEn = {
  data: {
    title: 'Data',
    backupRestore: 'Backup & restore',
    fullBackup: 'Full backup',
    restore: 'Restore',
    restoreConfirm:
      'Restore will overwrite the current database, knowledge base, and notes. Continue?',
    statusLabel: 'Data status',
    statusCache: 'Cache {{size}}',
    statusAppData: 'App data {{path}}',
    statusWorkDir: 'Work directory {{path}}',
    directories: {
      title: 'Data directories',
      userWork: 'User work directory',
      userWorkHint: 'Workspace, knowledge base, and local files are stored here',
      appData: 'App data',
      appLogs: 'App logs',
      knowledgeFiles: 'Knowledge base files',
    },
    appData: 'App data',
    appLogs: 'App logs',
    knowledgeFiles: 'Knowledge base files',
    clearCache: 'Clear cache',
    clearCacheWithSize: 'Clear cache ({{size}})',
    resetData: 'Reset data',
    openDir: 'Open folder',
    openLogs: 'Open logs',
    deleteFiles: 'Delete files',
    loading: 'Loading…',
    confirm: {
      deleteKnowledge: {
        title: 'Delete files',
        message:
          'This will delete vector and index files in the knowledge base directory and clear knowledge base document records in the database. This action cannot be undone.',
        confirmLabel: 'Delete',
      },
      clearCache: {
        title: 'Clear cache',
        message:
          'This will clear app cache (cache, GPUCache, Code Cache). Agents, conversations, knowledge bases, notes, and groups will not be affected.',
        confirmLabel: 'Clear',
      },
      resetData: {
        title: 'Reset data',
        message: [
          'The following will be cleared:',
          '· App cache (cache, GPUCache, Code Cache)',
          '· Runtime logs (logs/)',
          '· Agent JSON memory files (agent-memory/)',
          '· Agent task lists (agent-tasks/)',
          '· Long-term memory (memory_entries table and vector index)',
          '',
          'The following will be kept:',
          '· Agents and conversation topics',
          '· Knowledge bases and files',
          '· Notes',
          '· Groups',
          '· Model config, accounts, and message attachments (toolman.db, storage/)',
        ].join('\n'),
        confirmLabel: 'Reset',
      },
      restore: {
        title: 'Restore data',
        message:
          'Restore will overwrite the current database, knowledge base, and notes. Continue?',
        confirmLabel: 'Restore',
      },
    },
    messages: {
      backupSuccess: 'Full backup saved: {{path}} (includes {{parts}})',
      restoreSuccess: '{{parts}} restored. Restart the app to ensure the database and knowledge base take effect.',
      deleteKnowledge: 'Knowledge base files deleted',
      clearCache: 'Cache cleared',
      resetMemory: 'Cleared {{count}} long-term memory entries.',
      resetCleared: 'Cleared: {{items}}.',
      resetRestart:
        'Long-term memory cleared. No temporary directories needed clearing. Restart the app to ensure cache changes take full effect.',
    },
    backupParts: {
      database: 'database',
      knowledge: 'knowledge base vectors',
      notes: 'notes',
    },
  },
} as const
