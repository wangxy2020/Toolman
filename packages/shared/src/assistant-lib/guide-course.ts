import type { CourseSyllabus } from './teaching-types.js'

/** Built-in usage-guide course title under the shared「课堂」agent. */
export const ASSISTANT_LIB_GUIDE_COURSE_TITLE = 'Toolman使用说明'

export const ASSISTANT_LIB_GUIDE_COURSE_PRESET_ID = 'toolman-guide' as const

export function buildAssistantLibGuideCourseSystemPrompt(): string {
  return [
    '你是 Toolman 产品使用导师，负责带用户学会使用 Toolman 桌面端与移动端。',
    '讲解要具体、可操作：说清在哪个导航入口、点哪个按钮、会看到什么。',
    '按当前教学大纲章节顺序授课：未完成本章验收前，不要提前展开后续章节。',
    '用户明确提问时可以直接回答；验收时用简短追问确认对方能自己复述操作步骤。',
    '不要编造不存在的功能。若某能力尚未上线（例如自动化），如实说明。',
    '每轮有效教学后，如需更新进度，追加机器可读的 socratic-state（不要向用户解释该块）。',
  ].join('\n')
}

export function buildAssistantLibGuideCourseSyllabus(): CourseSyllabus {
  const chapters: CourseSyllabus['chapters'] = [
    {
      id: 'toolman-guide-overview',
      title: '认识 Toolman',
      hours: 0.5,
      status: 'ready',
      lessonPlan: [
        '介绍 Toolman 是本地优先的学习与协作工作台。',
        '左侧导航的核心入口：智能体、课堂、知识库、笔记、群组、社区。',
        '课堂与智能体的区别：智能体是通用对话助手；课堂按课程话题学习，可绑定教材与大纲。',
        '引导用户先熟悉窗口布局：左侧分栏、中间内容、右上角工具栏。',
      ].join('\n'),
      assessmentQuestions: [
        '左侧导航里，课堂和智能体分别适合做什么？',
        '打开课堂后，课程列表出现在窗口的哪一侧？',
      ],
    },
    {
      id: 'toolman-guide-agent',
      title: '智能体与对话',
      hours: 0.5,
      status: 'ready',
      lessonPlan: [
        '在「智能体」中创建或选择助手，用话题组织不同对话。',
        '可配置模型、提示词与知识库，让助手按你的工作方式回答。',
        '长对话建议新开话题，避免上下文过长；需要时再回到原话题。',
      ].join('\n'),
      assessmentQuestions: [
        '如何为一次新任务新建话题，而不是继续占用旧对话？',
        '智能体设置里通常会调整哪两类内容（提示词 / 模型或知识库）？',
      ],
    },
    {
      id: 'toolman-guide-classroom',
      title: '课堂怎么用',
      hours: 1,
      status: 'ready',
      lessonPlan: [
        '侧栏「添加课程」可新建课程：填写名称、选择教学模式、绑定教材知识库。',
        '「Toolman使用说明」会预置在侧栏，可在课程设置里删除；其他课程可通过侧栏「添加课程」创建。',
        '添加课程后可生成教学大纲；章节需按目录从上到下学习，通过验收才能进入下一章。',
        '右上角「上课」开始本节课，「课堂」回到对话，「课堂记录」查看当前课程的学习记录；再次点击上课可结束本节。',
        '课堂设置可改教学模式、教材、朗读；危险操作里可删除自建课程。',
      ].join('\n'),
      assessmentQuestions: [
        '如何添加一门新课程并绑定教材？',
        '上课、课堂、课堂记录三个按钮分别做什么？',
        '为什么有的章节点不进去？',
      ],
    },
    {
      id: 'toolman-guide-knowledge',
      title: '知识库',
      hours: 0.5,
      status: 'ready',
      lessonPlan: [
        '在「知识库」导入文件或监听本地文件夹，文档会解析并用于检索。',
        '课堂可以把某个知识库当作教材；智能体也可以绑定知识库作答。',
        '移动端可同步已导出的知识库内容，并在本地搜索。',
      ].join('\n'),
      assessmentQuestions: [
        '要把本地教材用于课堂，应该先在哪里导入文件？',
        '知识库和课堂里的「教材知识库」是什么关系？',
      ],
    },
    {
      id: 'toolman-guide-notes-group',
      title: '笔记、群组与社区',
      hours: 0.5,
      status: 'ready',
      lessonPlan: [
        '「笔记」用于自己写 Markdown / 块笔记，支持链接与搜索。',
        '「群组」用于和成员共享知识库、笔记与智能体，支持局域网与广域网同步。',
        '「社区」用于发现和分享内容；课堂右上角也可把学习摘要分享到群组。',
      ].join('\n'),
      assessmentQuestions: [
        '个人记录更适合放在笔记还是知识库？',
        '想把一份资料交给同事一起用，应该走群组还是只放在本地知识库？',
      ],
    },
    {
      id: 'toolman-guide-settings',
      title: '账号、设置与多端',
      hours: 0.5,
      status: 'ready',
      lessonPlan: [
        '在设置中配置模型、导航模块显示、登录账号。',
        '登录后可使用需要身份的能力（如社区、部分同步）。',
        '桌面端可作为同步中心，手机端连接后继续课堂、知识库与对话。',
        '提醒：模型密钥与账号安全不要分享到群组或社区。',
      ].join('\n'),
      assessmentQuestions: [
        '换一台设备或打开手机端时，怎样继续用同一套课堂和知识库？',
        '模型与账号相关的设置大概在哪里找？',
      ],
    },
  ]

  const totalHours = chapters.reduce((sum, chapter) => sum + (chapter.hours ?? 0), 0)
  return {
    generation: 'ready',
    generatedCount: chapters.length,
    totalHours,
    chapters,
    updatedAt: 0,
  }
}
