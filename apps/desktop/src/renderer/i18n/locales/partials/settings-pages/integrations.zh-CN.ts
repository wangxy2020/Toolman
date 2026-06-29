export const settingsPagesIntegrationsZhCN = {
  skills: {
    title: '技能',
    intro: '已安装的技能可在智能体设置中按需挂载；运行时会把 SKILL.md 内容注入系统提示。',
    empty: '暂无技能，点击「添加」从本地文件夹安装（需包含 SKILL.md）。',
    builtinBadge: '内置',
    descriptions: {
      'find-skills':
        '当用户询问「怎么做 X」「有没有能做 X 的技能」或想扩展智能体能力时，帮助发现并安装合适的技能。',
      'skill-creator':
        '创建新技能、修改并改进现有技能。适用于用户想从零编写技能、编辑或更新已有技能的场景。',
    },
    delete: {
      confirm: '确定删除技能「{{name}}」？',
      title: '删除技能',
    },
  },
  channels: {
    title: '频道',
    intro:
      '将智能体接入飞书、钉钉、企业微信、QQ、Discord、Slack 等平台。飞书、钉钉、Discord、企业微信已可用；QQ/Slack 为「即将推出」。启用后会启动本地 Webhook 服务（钉钉使用 Stream 长连接）；渠道消息遵循智能体工具权限设置（危险操作仍需审批，心跳任务除外）。',
    webhookBase: '本地 Webhook 基址：',
    notConfigured: '未配置',
    platforms: {
      feishu: '飞书',
      dingtalk: '钉钉',
      wechat: '企业微信',
      qq: 'QQ',
      discord: 'Discord',
      slack: 'Slack',
    },
    enable: {
      feishu: '开启后智能体将可以通过飞书接收与回复消息',
      dingtalk: '开启后智能体将可以通过钉钉接收与回复消息',
      wechat: '开启后智能体将可以通过企业微信接收与回复消息',
      discord: '开启后智能体将可以通过 Discord 接收与回复消息',
      default: '开启后智能体将可以通过{{platform}}接收与回复消息',
    },
    hints: {
      discord:
        'Discord 通过 Bot Gateway 长连接接收消息，将 Bot Token 填入「应用密钥」即可。',
      dingtalk:
        '钉钉通过 Stream 长连接接收消息。在开发者后台启用机器人并选择 Stream 模式，将 AppKey 填入「应用 ID」、AppSecret 填入「应用密钥」。',
      feishu:
        '请在飞书开发者后台 → 事件订阅中，将请求地址配置为上述 URL，并订阅「接收消息」事件。',
      wechat:
        '请在企业微信开发者后台配置回调 URL，填写 Token 与 EncodingAESKey，并在「域名」字段填写应用 AgentId。',
      default: '该平台运行时适配即将推出，可先保存配置。',
    },
    credentials: {
      sectionTitle: '{{platform}} 凭证配置 (App Credentials)',
      appId: '应用 ID (App ID)',
      appIdPlaceholder: 'cli_xxxxxxxxxxxxxxxx',
      appSecretDefault: '应用密钥 (App Secret)',
      appSecretDiscord: '应用密钥 (Bot Token)',
      appSecretDingtalk: '应用密钥 (App Secret)',
      appSecretWechat: '应用密钥 (CorpSecret)',
      appSecretPlaceholderSaved: '已保存，留空则不修改',
      appSecretPlaceholder: '••••••••••••••••••••••••••••••••',
      encryptKey: '加密密钥 (Encrypt Key)',
      encryptKeyPlaceholderSaved: '已保存，留空则不修改',
      encryptKeyPlaceholder: '选填',
      verificationToken: '验证令牌 (Verification Token)',
      verificationTokenPlaceholder: '选填',
    },
    modal: {
      title: '{{platform}} 频道配置',
      enableTitle: '启用{{platform}}频道',
      webhookLabel: '回调地址 (Webhook URL)',
      copy: '复制',
      copied: '已复制',
      channelName: '频道名称',
      bindAssistant: '绑定智能体',
      selectAssistant: '请选择智能体...',
      domain: '域名',
      domainFeishu: '飞书（中国）',
      domainWechat: '应用 AgentId（数字）',
      domainDefault: '默认',
      allowedChatIds: '允许的聊天 ID',
      allowedChatIdsPlaceholder: '留空表示不限制',
      allowedChatIdsHint: '可填写群聊或单聊 ID，多个 ID 用逗号分隔；留空则响应所有会话。',
      cancel: '取消',
      testConnection: '测试连接',
      testing: '测试中…',
      saveConfig: '保存配置',
    },
    status: {
      connected: '已连接',
      connecting: '连接中',
      error: '错误',
      unsupported: '即将推出',
      disconnected: '未连接',
    },
    webhook: {
      copyFailed: '复制失败，请手动选择文本复制',
    },
  },
  quickPhrases: {
    title: '快捷短语',
    intro: '在输入框中快速插入常用提示词。',
    empty: '暂无快捷短语，点击右上角「添加」创建。',
    add: {
      title: '添加快捷短语',
    },
    edit: {
      title: '编辑快捷短语',
      action: '编辑',
    },
    label: '名称',
    labelPlaceholder: '显示在菜单中的名称',
    content: '内容',
    contentPlaceholder: '插入到输入框中的短语内容',
    hint: '名称留空时将自动使用内容前缀；可在聊天输入框的快捷短语菜单中直接插入。',
    delete: {
      confirm: '确定删除快捷短语「{{label}}」？',
      action: '删除',
    },
  },
} as const
