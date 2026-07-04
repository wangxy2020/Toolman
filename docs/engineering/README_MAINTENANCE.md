# README 维护说明

根目录 `README.md` 中部分内容由维护者手写（功能介绍、产品说明等）。发布或升级时**不要整文件覆盖**，只同步版本号与命令区。

## 结构标记

| 标记 | 含义 |
|------|------|
| `<!-- toolman:version -->` … `<!-- /toolman:version -->` | 仅放桌面端 semver，由脚本同步 |
| `<!-- toolman:user-content:start -->` … `end` | **手写文案，禁止在发布时改写** |
| `<!-- toolman:commands:start -->` … `end` | 环境要求、快速开始、命令表、故障排查代码块 |

## 发布时同步版本

```bash
# 1. 修改 apps/desktop/package.json 的 version
# 2. 同步 README 中的版本标记（不改用户文案）
pnpm readme:sync-version
```

## 新增/变更 npm 脚本时

只编辑 `<!-- toolman:commands:start -->` 与 `end` 之间的命令表或代码块，不要改动 `toolman:user-content` 区域。

## Cursor / Agent

见 `.cursor/rules/readme-preservation.mdc`：升级、备份恢复、版本 bump 任务不得重写功能介绍等描述性文字。
