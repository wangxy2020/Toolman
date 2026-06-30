export const modulesEn = {
  modules: {
    knowledge: {
      title: 'Knowledge',
      addLabel: 'Add knowledge base',
      headerAll: 'All knowledge bases',
      sidebarEmptyHint: 'No knowledge bases yet. Click above to add one.',
      contentEmptyTitle: 'Knowledge',
      contentEmptyHint: 'Select or create a knowledge base to import files or watch a folder for sync.',
    },
    notes: {
      title: 'Notes',
      addLabel: 'New notebook',
      headerAll: 'All notes',
      sidebarEmptyHint: 'No notebooks yet. Click above to create one.',
      contentEmptyTitle: 'Notes',
      contentEmptyHint:
        'Select a note on the left to edit. Supports Markdown, blocks, backlinks, and full-text search.',
    },
    workflow: {
      title: 'Automation',
      addLabel: 'New automation',
      headerAll: 'All automations',
      sidebarEmptyHint: 'No automations yet. Click above to create one.',
      contentEmptyTitle: 'Automation',
      contentEmptyHint:
        'Automation and workflows are coming soon. Enable the nav entry under Settings → Display → Hidden icons.',
    },
    group: {
      title: 'Groups',
      addLabel: 'Create group',
      headerAll: 'Groups I created',
      sidebarEmptyHint: 'No groups yet. Click above to create one.',
      contentEmptyTitle: 'Groups',
      contentEmptyHint:
        'Create or join groups to share knowledge, notes, and agents with LAN/WAN P2P sync.',
    },
    community: {
      title: 'Community',
      addLabel: 'Explore community',
      headerAll: 'Discover',
      sidebarEmptyHint: 'No subscriptions yet. Click above to explore.',
      contentEmptyTitle: 'Community',
      contentEmptyHint:
        'Browse and install MCP, skills, workflows, and knowledge resources; join tasks, news, and discussions.',
    },
    projects: {
      title: 'Projects',
      addLabel: 'New project',
      headerAll: 'All projects',
      sidebarEmptyHint: 'Pick a module on the left to view MOCK dashboards.',
      contentEmptyTitle: 'Project management',
      contentEmptyHint: 'Cost and schedule dashboards use MOCK data; EPC workflows arrive in a later phase.',
    },
  },
} as const
