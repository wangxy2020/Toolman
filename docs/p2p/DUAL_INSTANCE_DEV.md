# 单机双开 P2P 开发测试指南

在同一台 Mac 上同时运行两个 Toolman 实例，模拟「用户 A（群主）」与「用户 B（成员）」进行群组知识库等 P2P 功能测试。

---

## 1. 为什么要隔离目录？

| 类型 | 是否应共用 | 说明 |
|------|------------|------|
| 应用数据 `--user-data-dir` | **否** | 数据库、登录、P2P 设备 ID、群组状态必须独立 |
| Community Hub 社区数据 | **是（双开脚本）** | `pnpm dev:p2p:a/b` 共用 `/tmp/toolman-community-shared`，留言与市场内容可互见 |
| `~/Documents/Toolman/{用户名}/本地知识库/` | **否（测试时）** | 共用会导致双文件监听、无法区分「P2P 同步」与「本地已有文件」 |

推荐布局（用户名 = 应用内显示名称，如「用户1」「用户2」）：

> **开发机注意**：若 `~/Documents/Toolman` 是 Git 仓库（源码目录），程序会自动改用 `~/Documents/ToolmanData/{用户名}/` 存放用户文件，避免污染代码仓库。

```
~/Documents/ToolmanData/     ← 开发机上常见（Toolman 为 git 仓库时）
├── 用户1/
│   ├── 工作区/
│   ├── 本地知识库/
│   ├── 网络知识库/
│   ├── 共享知识库/
│   └── 本地文件/
└── 用户2/
    └── ...
```

正式用户机器上若无 git 仓库冲突，则使用 `~/Documents/Toolman/{用户名}/`。

```
/tmp/toolman-node-b/          ← 用户 A 应用数据
/tmp/toolman-p2p-b/           ← 用户 B 应用数据
/tmp/toolman-community-shared/ ← 双开时共用的社区 Hub 数据库（留言、市场资源等）
```

（应用数据与 `~/Documents/Toolman/` 下的用户目录相互独立；社区 Hub 通过 `scripts/p2p-community-env.sh` 在双开时共享。）

---

## 2. 一键初始化

在仓库根目录执行：

```bash
# 创建知识库目录；若已有 toolman.db 则写入独立 knowledgeFolderPath
./scripts/p2p-dual-instance-init.sh
```

若要**清空**两个测试实例的登录与群组数据后重来：

```bash
./scripts/p2p-dual-instance-init.sh --reset-data
./scripts/p2p-dual-instance-init.sh
```

> 首次使用需先各启动一次应用并完成登录，生成 `toolman.db` 后，再运行 init 脚本写入知识库路径；然后**完全退出**两个窗口并重启。

---

## 3. 启动两个实例

**终端 1 — 用户 A（群主）：**

```bash
pnpm dev:p2p:a
# 等价于：pnpm --filter @toolman/desktop exec electron-vite dev -- --user-data-dir=/tmp/toolman-node-b
```

**终端 2 — 用户 B（成员）：**

```bash
pnpm dev:p2p:b
# 等价于：pnpm --filter @toolman/desktop exec electron-vite dev -- --user-data-dir=/tmp/toolman-p2p-b
```

两个窗口需使用**不同账号**登录。

---

## 4. 验证

单实例（重启应用后）：

```bash
pnpm verify:folders
```

双实例：

```bash
pnpm verify:folders:a
pnpm verify:folders:b
```

## 5. 推荐测试流程（群组知识库）

### 4.1 准备文件

1. 将 1～2 个测试 PDF 放入 **用户 A** 目录：
   ```
   ~/Documents/Toolman/用户1/本地知识库/
   ```
2. 确认 **用户 B** 目录为空：
   ```
   ~/Documents/Toolman/用户2/本地知识库/
   ```

### 4.2 建群与加入

1. **用户 A**：侧栏「群组」→ 创建群组（如「用户1测试1」）
2. **用户 A**：成员面板 → 生成邀请链接
3. **用户 B**：侧栏「加入群组」→ 粘贴链接
4. 成员面板应显示「局域网 · 在线」（同一 Wi-Fi 下）

### 4.3 共享知识库

1. **用户 A**：进入群组 → **群组知识库** → 点击添加
2. 展开「默认文件夹」，勾选 PDF → **添加**
3. **用户 B**：进入同一群组 → 群组知识库，应看到共享文件（来自 P2P，而非本地监听）

### 4.4 验证 P2P 真的生效

| 检查项 | 预期 |
|--------|------|
| 用户 B 的 `用户2/本地知识库/` | 共享前**没有**同名 PDF |
| 用户 B 群组内打开文件 | 能预览/打开 |
| 用户 B 点「保存」（若权限为可保存） | 文件出现在 `共享知识库/[群名]/` |
| 用户 A 修改 PDF 后 | 成员端同步或刷新后更新 |

---

## 6. 常见问题

### 主进程改动不生效

`electron-vite dev` 的 HMR **不会**热更新 main 进程。修改 `apps/desktop/src/main/**` 后需**完全退出**两个 Electron 窗口再重启。

### 端口占用

若日志出现 `EADDRINUSE 127.0.0.1:18765`，说明旧实例未退出。关闭所有 Toolman 窗口后重试。

### 仍指向旧的「本地知识库」

1. 运行 `./scripts/p2p-dual-instance-init.sh`
2. 或在应用内：**设置 → 工作区 → 本地知识库路径**，手动改为上表中的目录
3. 完全重启应用

### 自定义路径

可通过环境变量覆盖默认位置：

```bash
export TOOLMAN_P2P_USER_A_DATA=/tmp/my-user-a
export TOOLMAN_P2P_USER_B_DATA=/tmp/my-user-b
export TOOLMAN_P2P_USER_A_KB="$HOME/Documents/Toolman/甲/本地知识库"
export TOOLMAN_P2P_USER_B_KB="$HOME/Documents/Toolman/乙/本地知识库"
./scripts/p2p-dual-instance-init.sh
```

---

## 7. 相关命令

| 命令 | 说明 |
|------|------|
| `pnpm dev:p2p:a` | 启动用户 A |
| `pnpm dev:p2p:b` | 启动用户 B |
| `pnpm p2p:dual-init` | 初始化目录与 DB 路径 |
| `./scripts/p2p-dual-node-e2e.sh` | 打印完整双节点 E2E 清单 |

更多 P2P 概念与故障排查见 [README.md](./README.md)。
