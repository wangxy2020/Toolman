export const settingsPagesIntegrationsEn = {
  skills: {
    title: 'Skills',
    intro:
      'Installed skills can be attached in agent settings. At runtime, SKILL.md content is injected into the system prompt.',
    empty: 'No skills yet. Click "Add" to install from a local folder (must include SKILL.md).',
    builtinBadge: 'Built-in',
    descriptions: {
      'find-skills':
        'Helps discover and install skills when users ask how to do something, whether a skill exists, or want to extend agent capabilities.',
      'skill-creator':
        'Create new skills and improve existing ones — for writing skills from scratch or editing and updating them.',
    },
    delete: {
      confirm: 'Delete skill "{{name}}"?',
      title: 'Delete skill',
    },
  },
  channels: {
    title: 'Channels',
    intro:
      'Connect agents to Feishu, DingTalk, WeChat Work, QQ, Discord, Slack, and more. Feishu, DingTalk, Discord, and WeChat Work are available; QQ/Slack are coming soon. Enabling starts a local webhook server (DingTalk uses Stream long connection). Channel messages follow agent tool permission settings (dangerous actions still require approval, except heartbeat tasks).',
    webhookBase: 'Local webhook base URL:',
    notConfigured: 'Not configured',
    platforms: {
      feishu: 'Feishu',
      dingtalk: 'DingTalk',
      wechat: 'WeChat Work',
      qq: 'QQ',
      discord: 'Discord',
      slack: 'Slack',
    },
    enable: {
      feishu: 'When enabled, agents can receive and reply to messages via Feishu',
      dingtalk: 'When enabled, agents can receive and reply to messages via DingTalk',
      wechat: 'When enabled, agents can receive and reply to messages via WeChat Work',
      discord: 'When enabled, agents can receive and reply to messages via Discord',
      default: 'When enabled, agents can receive and reply to messages via {{platform}}',
    },
    hints: {
      discord:
        'Discord receives messages via Bot Gateway long connection. Enter the Bot Token in "App Secret".',
      dingtalk:
        'DingTalk receives messages via Stream long connection. Enable the bot in the developer console with Stream mode, enter AppKey as "App ID" and AppSecret as "App Secret".',
      feishu:
        'In the Feishu developer console → Event Subscriptions, set the request URL above and subscribe to "Receive message" events.',
      wechat:
        'In the WeChat Work developer console, configure the callback URL, Token, and EncodingAESKey, and enter the AgentId in the "Domain" field.',
      default: 'Runtime adapter for this platform is coming soon. You can save configuration first.',
    },
    credentials: {
      sectionTitle: '{{platform}} credentials (App Credentials)',
      appId: 'App ID',
      appIdPlaceholder: 'cli_xxxxxxxxxxxxxxxx',
      appSecretDefault: 'App Secret',
      appSecretDiscord: 'App Secret (Bot Token)',
      appSecretDingtalk: 'App Secret',
      appSecretWechat: 'App Secret (CorpSecret)',
      appSecretPlaceholderSaved: 'Saved — leave blank to keep unchanged',
      appSecretPlaceholder: '••••••••••••••••••••••••••••••••',
      encryptKey: 'Encrypt Key',
      encryptKeyPlaceholderSaved: 'Saved — leave blank to keep unchanged',
      encryptKeyPlaceholder: 'Optional',
      verificationToken: 'Verification Token',
      verificationTokenPlaceholder: 'Optional',
    },
    modal: {
      title: '{{platform}} channel settings',
      enableTitle: 'Enable {{platform}} channel',
      webhookLabel: 'Webhook URL',
      copy: 'Copy',
      copied: 'Copied',
      channelName: 'Channel name',
      bindAssistant: 'Bind agent',
      selectAssistant: 'Select an agent…',
      domain: 'Domain',
      domainFeishu: 'Feishu (China)',
      domainWechat: 'Agent ID (numeric)',
      domainDefault: 'Default',
      allowedChatIds: 'Allowed chat IDs',
      allowedChatIdsPlaceholder: 'Leave blank for no restriction',
      allowedChatIdsHint:
        'Enter group or direct chat IDs, comma-separated. Leave blank to respond to all conversations.',
      cancel: 'Cancel',
      testConnection: 'Test connection',
      testing: 'Testing…',
      saveConfig: 'Save settings',
    },
    status: {
      connected: 'Connected',
      connecting: 'Connecting',
      error: 'Error',
      unsupported: 'Coming soon',
      disconnected: 'Disconnected',
    },
    webhook: {
      copyFailed: 'Copy failed — please select and copy the text manually',
    },
  },
  quickPhrases: {
    title: 'Quick Phrases',
    intro: 'Quickly insert frequently used prompts in the input box.',
    empty: 'No quick phrases yet. Click "Add" in the top-right corner to create one.',
    add: {
      title: 'Add Quick Phrase',
    },
    edit: {
      title: 'Edit Quick Phrase',
      action: 'Edit',
    },
    label: 'Name',
    labelPlaceholder: 'Name shown in the menu',
    content: 'Content',
    contentPlaceholder: 'Phrase text inserted into the input box',
    hint: 'If the name is left blank, a prefix of the content is used automatically. Insert from the quick phrase menu in the chat input.',
    delete: {
      confirm: 'Delete quick phrase "{{label}}"?',
      action: 'Delete',
    },
  },
} as const
