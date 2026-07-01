# EPC Commercial Engine（闭源 Rust）

Cherry Studio 项目管理 — **工作 4：工程量清单与进度款数据统计** 核心引擎。

## 构建

```bash
pnpm epc:build
# 或
pnpm epc:build
# 或: CARGO_TARGET_DIR=packages/epc-commercial-engine/target cargo build --release --manifest-path packages/epc-commercial-engine/Cargo.toml
```

产物：`packages/epc-commercial-engine/target/release/epc-commercial-cli`

## 开发授权

1. 查看机器码（应用内 IPC 或 CLI）：

```bash
echo '{"command":"get-machine-id"}' | ./target/release/epc-commercial-cli
```

2. 开发环境可设置 `EPC_COMMERCIAL_DEV_SKIP_LICENSE=1` 跳过校验。

3. 生产环境将 `license.key` 放到：

`~/Library/Application Support/CherryStudio/epc-commercial/license.key`（macOS 生产）

开发环境目录名可能为 `CherryStudioDev`。

## 生成 license.key（运维脚本示例）

使用 Rust 库内 `license::sign_license_payload` 生成，或运行：

```bash
pnpm tsx scripts/epc-generate-license.ts --machine MACHINE-XXX --days 365
```

（见仓库 `scripts/epc-generate-license.ts`）

## 智能体用法

在智能体 **可访问路径** 指向工作区根目录后：

- **快捷短语**（设置 → 快捷短语）：插入工作说明后 **回车发送** 即触发本地 Rust 引擎（扫描工作区各文件夹 BOQ）；可选附加行 `期数: ipc4`。
- **命令**（命令面板或发送）：`epc ipcx to boq` — 将 `ipcx` 改为期数（如 `epc ipc4 to boq`）后发送或点选执行。

可选附加行：`母表: /path/to/合同价格表.xlsx`

## 账本

`{工作区根目录}/ipc_process_log.txt`（制表符分隔文本，便于查看与手工删除行以重新处理）

## 项目管理修订层（全模块约定）

工作区统一修订文件：

`{工作区}/.cherry-studio/project-management/revisions.json`

- 大模型/用户修改成本数据表（支付汇总、aligned 母表等）后，**变更单元格默认 lock**；再次运行工作 4/5 或后续计划 Rust 引擎时**不会覆盖**。
- **无需**特定指令句式；普通对话中改表即可。
- 用户明确要求「强制重算 / 按引擎结果覆盖 / 忽略已有修改」时，本次工作流忽略修订层。
- 旧版 `IPC_Payment_data/data_overrides.json` 会在首次读取时自动迁移至上述路径。

| domain | 说明 |
|--------|------|
| `cost_epc_payment` | `ipc_payment_data.xlsx`、`project_ipc_data.xlsx` 行级 lock |
| `cost_epc_aligned` | `*_aligned.xlsx` 单元格 lock |
| `progress_plan` | 计划管理占位（后续 Rust 接入） |

## 步骤 2 清洗缓存（CSV）

与 IPC xlsx **同一目录**，文件名：`{project_id}SCH{分项号}{IPC期号}.csv`（无分隔符），例如 `TAZASSLOT4SCH4IPC002.csv`。

- `project_id`：自 IPC 文件名或工作区子文件夹推断（如 `TAZASSLOT4`）。
- `SCHx`：文件名中 `SCH 4` 等分项号（非 IPC 期号）。
- `IPC期号`：如 `IPC002`、`IPC004`。
- 文件为**纯 CSV**：首行表头 + 数据行（无 `#` 注释行），便于 Excel 打开核对及后续入库。
- 流水线开始时对**全部**已识别的 IPC 工程量清单检查：同目录无 CSV 或 IPC 文件比 CSV 更新则**立即清洗并写入**（含账本已 SUCCESS、本次不再合并母表的文件）。
- **步骤 3 及以后**从同目录 CSV 读取明细（`current_total_price` 等列）；若 CSV 为旧版带 `#` 头，下次运行会自动重写为纯表格式。
- 需强制重新清洗：删除该 CSV，或保存/更新 IPC xlsx 后重跑（按文件修改时间判断）。

列名（与 IPC 表头映射）：

| CSV 列 | IPC 表头（示例） |
|--------|------------------|
| item | Item / Item No / No |
| description | Description / Work Description |
| unit | Unit / UOM |
| unit_price | Unit Price / Unit Rate |
| contract_total_qty | Contract Qty / BOQ Qty / Est Qty |
| previous | Previous / Previous Qty |
| current_qty | Current / Quantity / Qty |
| end_total_qty | End Qty / Cumulative / To Date |
| current_total_price | Current Total Price / Total Price (TZS) / 期数列 IPCn |

## 合并输出母表（aligned）

与合同母表**同目录**，默认文件名为 `{母表文件名}_aligned.xlsx`（**不含 IPC 期号**）。

- **首次**处理：从原始母表读取，写入 `{stem}_aligned.xlsx`，并在对应 Schedule 分表追加本期 IPC 列。
- **再次**处理新 IPC：若已存在 `{stem}_aligned.xlsx`，则在其上**追加新列**，不新建文件。
- 兼容旧版 `{stem}_aligned_{IPC期号}.xlsx`：若尚无 canonical 文件，则自动选用同目录下修改时间最新的 `*_aligned_*.xlsx` 继续追加列。

## 母表工作表（Schedule1–4）

工作表名**不必**以 `Schedule` 开头，只要包含 `schedule` 与数字 **1–4**（数字与 schedule 之间可有可无空格/`-`/`_`），后缀 **USD、TZS、EUR** 等货币代码亦可，例如 `Schedule1-USD`、`Bill - Schedule 3 - Iringa`。

表头支持：**首行 SCHEDULE 标题（合并单元格）+ 双行表头**（如 `Item No` 与 `Unit Price` / 次行 `[USD]`）；行号列 **Item**、**Item No**、**No** 等；单价列 **Unit Price**（可与货币行合并识别）。

## 步骤 1 文件命名约定（示例）

| 文件名 | 处理分组 | 说明 |
|--------|----------|------|
| 含 BOQ/价格表、**无 IPC 期号** | 合同母表 | 如 `TAZASSLOT1-Iringa-BOQ.xlsx`（工作簿内多 Schedule 分表） |
| 含 **IPC 期号** + SCH/Schedule | 待处理 | 如 `...SCH 1-2025007(IPC007-Iringa).xlsx` |
| **无 IPC 期号** | 无需处理 | 如 `TAZASSLOT1-IRINGA-IPC.xlsx` |
| `ipc_process_log.txt` 中为 SUCCESS | 已处理 | 同名且 MD5 一致；FAILED 仍进待处理 |
