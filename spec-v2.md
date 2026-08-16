# dsh-profile-panel v2 · 规格说明（Spec v2）

> 承接 [spec.md](spec.md)（v0.1.0）。定义 v2（0.2.0+）全部新增功能的接口、数据模型、判定逻辑、安全约束、兼容性与测试规格。
> 范围：**F1–F16**（F 编号与 [plan-v2.md](plan-v2.md) 的 Phase 对应；F15 为发布/生态流程规格，无新接口）。
> 实现基线：宿主机制已在会话中实测——`webServer.register` 直出原始 `req/res`（SSE 可行）、`registerUpgrade`（WebSocket 备选）、`ctx.tools.register(defineTool(...))`（Agent 工具）、`ctx.loader.entries()`（boot 投影）。

## 0. 变更总览

### 0.1 新增端点

| 端点 | 方法 | 功能 | 变更类 |
|------|------|------|--------|
| `/api/profile-panel/install-preview` | POST | 安装事前版本/发布年龄预警 | 否（只读查询） |
| `/api/profile-panel/undo` | POST | 撤销最近一次变更（恢复 manifest 快照） | 是 |
| `/api/profile-panel/updates` | GET | 逐 bundle 更新检测 | 否 |
| `/api/profile-panel/update` | POST | 更新（升级）指定 bundle | 是 |
| `/api/profile-panel/align` | POST | 多 profile 版本对齐 | 是 |
| `/api/profile-panel/events` | GET | SSE 状态推送 | 否 |
| `/api/profile-panel/poll` | GET | 长轮询回落通道 | 否 |
| `/api/profile-panel/health` | GET | 健康检查 + 启动组合预览 | 否 |
| `/api/profile-panel/diff` | GET | profile 间 bundles 对比 | 否 |
| `/api/profile-panel/boot-report` | GET | 最近一次 boot 激活报告 | 否 |
| `/api/profile-panel/audit` | GET | 审计日志读取 | 否 |
| `/api/profile-panel/hot-reload` | POST | 免重启加载（HMR 能力 bundle） | 是 |
| `/api/profile-panel/cancel-restart` | POST | 取消待执行的重启 | 是 |

### 0.2 变更端点

- `GET /status` 载荷扩展：`profilesPending`、`desktopSelection?`、`desktop`（F16 桌面端 GUI 检测结果）、`bundles[].source/layerIndex/introducedBy/hotReloadable`、`updatesSummary`（仅含 outdated 计数供徽标渲染，完整数据走 `/updates`）；
- `POST /install` 请求扩展：`mode?`（`'single' | 'dual' | 'all'`，F16）、`preview?`、`rollback?`、`autoRestart?`；响应扩展：`warnings[]`、`rolledBackProfiles[]`、`autoRestart?`；
- 客户端：SSE 优先 + 轮询回落（`usePanelStatus`）。

### 0.3 新数据文件

```
<profileDir>/.dsh-profile-panel/undo/<ISO-ts>/package.json     # 安装前 manifest 快照
<profileDir>/.dsh-profile-panel/undo/<ISO-ts>/lockfile.fingerprint  # pnpm-lock 指纹（mtime+size+sha256 前 16 位）
<profileDir>/.dsh-profile-panel/audit.jsonl                    # 审计日志（追加写）
```

- `.dsh-profile-panel/` 目录**不在** `TRACKED_FILES`（`package.json` / `pnpm-lock.yaml` / `node_modules/.modules.yaml`）内，不影响变更检测；
- 恢复快照会改写 `package.json` → 自然触发 pendingRestart（预期行为，与 v0.1「自身升级也触发」一致）。

## 1. 通用约定

- **`registryView(pkg)`**：统一封装 `pnpm view <pkg> version`（dist-tag latest）与 `pnpm view <pkg> time --json`（发布时间表）。
  返回 `{ ok: true, latest, publishedAt, timeMap }` 或 `{ ok: false, code: 'network' | 'not-found' }`；TTL 300s 内存缓存；
  调用方对失败一律**降级为 warning 而非错误**（P3 教训：`@latest` 会被元数据缓存骗过，故 dist-tag 直查、不读本地 pnpm 解析状态）。
- **安全门控**：所有变更类端点（含 v2 新增）维持 v0.1 规则——同源 POST + 环回地址 + 拒绝任何转发头 + body ≤ 4 KiB（`sameOrigin` / `trustedLoopbackRequest` / `readJsonBody` 复用 http.ts）。
- **审计写入尽力而为**：失败仅 `logger.warn`，不阻断主流程。
- **路径展示**：一律经 `abbreviatePath` 缩写（`~/.dsh/profiles/...`）；不上报任何数据。

## 2. F1 版本对比助手

### 2.1 动机
P3 的 `downgraded` 是**事后**标记；安装前告知「latest 发布不足 `minimumReleaseAge`，可能被策略静默降级」并给出建议 pin，可让用户主动决策。

### 2.2 接口

`POST /api/profile-panel/install-preview`

请求（复用 `validateInstallTarget` 校验 package/spec）：
```jsonc
{ "package": "dshmarket", "spec": "1.5.1" }   // spec 可选
```

响应 200：
```jsonc
{
  "ok": true,
  "package": "dshmarket",
  "spec": null,
  "latest": "1.5.1",
  "publishedAt": "2025-06-01T00:00:00.000Z",
  "releaseAgeDays": 12,
  "minimumReleaseAgeDays": 7,
  "warnings": [
    { "code": "release-age", "message": "latest 1.5.1 发布于 12 天前（<7 天时可能被策略降级）；建议显式 pin 版本" }
  ],
  "suggestedPin": "1.5.1"
}
```

### 2.3 判定逻辑

- `spec` 缺省：latest 取 dist-tag；`releaseAgeDays = now − publishedAt(latest)`；
- `spec` 为精确版本：latest 仍按 dist-tag 计算（供对比），另比对 requested vs latest；
- `releaseAgeDays < minimumReleaseAgeDays` → `warnings[].code = 'release-age'`；`suggestedPin = latest`（精确版时为空）；
- registry 查询失败：HTTP 仍 200，返回 `{ ok: false, code: 'network', warnings: [{ code: 'network', ... }] }`，不阻断。

### 2.4 与 install 集成

`POST /install` 请求加 `preview?: boolean`；为 `true` 时执行器先跑预览，`warnings` 并入响应（与逐 profile 结果并列，不改变执行语义）。

### 2.5 配置

`Config` 增加 `minimumReleaseAgeDays: z.number().min(0).default(7)`。

## 3. F2 回滚与 undo

### 3.1 快照

- 触发：每次 install / update / align 执行**前**（串行，先快照后变更）；
- 内容：完整 manifest（`dependencies` + `dsh.profile.bundles` 等）+ `lockfile.fingerprint`（`pnpm-lock.yaml` 的 mtime + size + sha256 前 16 位，仅记录不复制文件）。

### 3.2 自动回滚（install.rollback）

- `rollback: true` 且结果部分失败（≥1 ok 且 ≥1 fail）→ 对每个 **ok** profile 恢复其最近快照 manifest（`writeProfileManifest`）；
- 响应加 `rolledBackProfiles: string[]`；`overallOk` 仍为 `false`；
- 恢复 manifest 后**不自动** `pnpm install`（避免连锁失败），返回 hint：「已恢复 manifest，请执行 pnpm install 或重试」；
- 默认 `rollback: false`（v1 语义不变）。

### 3.3 手动 undo

`POST /api/profile-panel/undo`

```jsonc
请求: { "profiles": ["desktop"] }        // 缺省 = 当前 profile
响应: { "ok": true, "results": [
  { "profile": "desktop", "restoredTs": "2025-06-01T08:00:00.000Z",
    "hint": "manifest 已恢复，请执行 pnpm install 或重启面板验证" }
]}
```

- 无快照 → 404 `{ error: 'no undo snapshot for profile: desktop' }`；
- 与 install / restart 互斥（busy 位 409）；
- 每 profile 独立恢复；部分失败逐 profile 回报（对齐 install 语义）。

## 4. F3 更新检测与同步

### 4.1 updates（只读）

`GET /api/profile-panel/updates?profile=web`

```jsonc
{
  "profile": "web",
  "updatedAt": "2025-06-13T00:00:00.000Z",
  "updates": [
    { "bundle": "dshmarket", "installed": "1.2.2", "latest": "1.5.1", "outdated": true, "releaseAgeDays": 12 }
  ]
}
```

- 范围：manifest `dependencies` 中声明 `dsh.bundle.patch` 的 bundle（面板已装清单）；registry 查询走 `registryView` 缓存；
- `outdated = semverCompare(latest, installed) > 0`（复用 install.ts 的 `semverCompare`）；
- 离线/失败：`updates: []` + `warnings: [{ code: 'network' }]`。

### 4.2 update（变更）

`POST /api/profile-panel/update`：`{ package, spec?, profiles[] }`
- 语义 = install 指定版本（可传 `spec` 为精确升级目标，缺省由 pnpm 解析 latest 范围）；
- 执行器、reconcile、`downgraded` 标记、安全门控、audit 记录**全部复用 install 流程**（内部同一实现，端点语义区分）。

### 4.3 align（变更）

`POST /api/profile-panel/align`：`{ package, profiles[], version? }`（`version` 缺省 = `registryView.latest`）
- 逐 profile 执行 update；响应逐 profile（同 install 结果行 + `downgraded`）；
- 典型场景：desktop 1.2.2 / web 1.5.1 → align 使两 profile 一致；版本漂移由 F7 diff 暴露、F3 align 收敛。

## 5. F4 SSE 推送

### 5.1 端点

`GET /api/profile-panel/events`（`Content-Type: text/event-stream; charset=utf-8`）
- 实现：基于现有 `webServer.register`（handler 收到原始 `IncomingMessage`/`ServerResponse`，直接 `res.writeHead(200, {...})` + `res.write` + `flushHeaders`），**无需** upgrade；宿主 `registerUpgrade`（WebSocket）作为后续备选通道，v2 不实现；
- 事件（`event:` 字段 + `data:` JSON）：

| event | data | 触发 |
|-------|------|------|
| `pending` | `{ profile, changes }` | watcher onPending |
| `clean` | `{ profile }` | watcher onClean |
| `installing` | `{ profile, package }` | install 开始（逐 profile） |
| `installed` | `{ overallOk, results }` | install 完成 |
| `restarting` | `{}` | 重启提交 |
| `updates` | `{ updates }` | updates 缓存刷新后广播（可选） |

- 心跳：每 30s 发 `: ping` comment；客户端 45s 无数据视为断线；
- 连接管理：上限 8 条，超出 503；响应 end / 客户端断开即注销监听（复用 `onPending`/`onClean` 的订阅列表）。

### 5.2 降级通道（poll）

`GET /api/profile-panel/poll?since=<seq>`
- 宿主维护单调递增 `seq`（每次状态变更 +1）；
- 有变更：立即返回 `{ seq, status }`；无变更：挂起至 25s 超时返回 `{ seq, status }`（status 为全量快照）；
- 客户端策略：EventSource 优先；`onerror` 连续 2 次 → 切换轮询；轮询成功恢复后每 60s 尝试重连 SSE。

### 5.3 安全

- SSE / poll 为 GET 只读，与 `status` 同级，不做环回门控；不携带凭据变更。

## 6. F5 多 profile 聚合

### 6.1 宿主

- `MultiProfileWatcher`：对每个 webCapable profile 各起一个 `createProfileWatcher`（复用 watcher.ts）；
- 上限 10 个，超出截断并 `logger.warn`；非 webCapable / manifest 损坏的 profile 跳过；
- 聚合结果写入共享状态，随 SSE/poll/status 暴露。

### 6.2 status 载荷扩展

```jsonc
"profilesPending": [
  { "profile": "desktop", "pendingRestart": true,
    "changes": { "changedFiles": ["package.json"], "addedBundles": ["plugin-x"], "removedBundles": [] } }
]
```

### 6.3 客户端

- 当前 profile 无待重启但存在 `profilesPending` 非空 → 横幅下方提示条「其他 profile 待重启：desktop ⚠」；
- 点击提示条可展开变更明细（复用 `summarizeChanges`）。

## 7. F6 健康检查与启动预览

`GET /api/profile-panel/health?profile=desktop`

```jsonc
{
  "profile": "desktop",
  "ok": false,
  "nextBundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dshmarket", "dsh-profile-panel"],
  "issues": [
    { "severity": "error", "code": "missing-package", "bundle": "dshmarket",
      "message": "声明于 dependencies 但 node_modules 中缺失" },
    { "severity": "warning", "code": "peer-gap", "bundle": "dshmarket",
      "message": "peer @deepseek-ai/cordis ^4.0.1 未满足" },
    { "severity": "info", "code": "orphan-bundle", "bundle": "old-plugin",
      "message": "bundles 中存在但非 dependencies（疑似残留）" }
  ]
}
```

### 7.1 检查项表

| code | severity | 判定 |
|------|----------|------|
| `manifest-broken` | error | package.json 不可解析 |
| `missing-package` | error | dependencies/bundles 声明但 `node_modules/<name>` 缺失 |
| `peer-gap` | warning | 某 bundle 的 `peerDependencies` 未满足（静态扫描，**不 spawn**；宿主自带 `@deepseek-ai/*` peer 免检——由 harness 装载器提供；查找覆盖 profile 与共享 store 的 flat + `.pnpm` 布局，最后以 `import.meta.resolve` 宿主解析兜底，三者都失败才报缺失） |
| `orphan-bundle` | info | bundles 有、dependencies 无且非 in-box |
| `duplicate-bundle` | warning | 层栈重复（bundles 数组去重后长度变小） |

### 7.2 nextBundles

- reconcile **dry-run**：复用 `reconcileBundles` 的判定逻辑，只计算返回、**不写盘**；
- 语义：按当前 dependencies + 已装包声明，预测「下次重启后的层栈」。

## 8. F7 profile 对比

`GET /api/profile-panel/diff?profiles=desktop,web`

```jsonc
{
  "profiles": ["desktop", "web"],
  "onlyInA": ["plugin-x"],
  "onlyInB": ["plugin-y"],
  "versionDiffers": [{ "bundle": "dshmarket", "a": "1.2.2", "b": "1.5.1" }]
}
```

- profile 校验复用 `validProfileName` + `discoverProfiles`；版本复用 `readInstalledVersion`；
- 仅对比 manifest 中声明 dsh.bundle.patch 的 bundle（与 updates 同范围）。

## 9. F8 来源归因

status.bundles 行扩展：

```jsonc
{ "name": "dshmarket", "state": "loaded",
  "source": "dependency", "layerIndex": 2, "introducedBy": "dshmarket@1.5.1",
  "hotReloadable": false }
```

判定规则：

| source | 条件 |
|--------|------|
| `dependency` | name ∈ dependencies 且其包声明 `dsh.bundle.patch`；`introducedBy` = 自身依赖 spec |
| `inbox` | name ∉ dependencies（官方内置，如 dsh-base / dsh-web-app） |
| `patch` | name ∉ dependencies 但出现在 bundles 且包声明 `dsh.bundle.patch`（异常 manifest 兜底态） |

- `layerIndex` = 在 `dsh.profile.bundles` 数组中的下标（0 基，顺序敏感）；
- `hotReloadable` 判定见 F12。

## 10. F9 启动报告

- **记录时机**：apply 时读取 `ctx.loader.entries()`（官方 `dsh-host-plugin-inventory` 同款投影：id / module / 有效启用 / phase）；订阅 loader 失败事件 → 记录 `{ bundle, phase: 'failed', error }`；
- 内存快照，仅保留最近一次 boot（重启即覆盖）；
- `GET /api/profile-panel/boot-report`：

```jsonc
{
  "bootedAt": "2025-06-13T00:00:00.000Z",
  "entries": [
    { "id": "dshmarket", "module": "dshmarket", "phase": "active" },
    { "id": "broken-plugin", "module": "broken-plugin", "phase": "failed", "error": "Error: cannot resolve ..." }
  ]
}
```

- 与审计日志互补：boot-report 是「本次启动结果」，audit 是「变更时间线」。

## 11. F10 审计日志

### 11.1 文件与条目

- 文件：`<profileDir>/.dsh-profile-panel/audit.jsonl`（追加写；写入失败 `logger.warn` 不阻断）；
- 条目 schema：

```jsonc
{ "ts": 1750000000000, "action": "install", "profile": "desktop", "package": "dshmarket",
  "spec": "1.5.1", "resolved": "1.2.2", "ok": true, "downgraded": true, "error": null }
```

- `action` 枚举：`install` | `update` | `uninstall`（预留）| `restart` | `undo` | `align`；
- 路径字段一律缩写；**永不记录对话 / prompt / 工具参数内容**。

### 11.2 保留策略

- >1000 条 或 日志文件 mtime > 30 天 → 轮转（重命名 `audit.1.jsonl` 并新建，最多保留 1 份历史）。

### 11.3 读取

`GET /api/profile-panel/audit?limit=50&offset=0`（limit 默认 50、上限 200）→ `{ total, entries: [...] }`。

## 12. F11 Agent 工具

### 12.1 实现

- `import { defineTool } from '@deepseek-ai/dsh-tools'`；`ctx.tools.register(...)`（参照 `@deepseek-ai/dsh-tool-jobs` 的 apply 模式）；宿主插件沿用 v0.1 的 `ctx.get('tools')` 可选获取模式——缺失时跳过注册，保持纯 web 形态降级；
- UI 卡片 kind：只读工具 `read`，变更工具 `execute`。

### 12.2 工具表

| name | 变更 | 参数 schema | 返回 |
|------|------|-------------|------|
| `profile_status` | 只读 | `{}` | 精简 status（profileName / bundles / pendingRestart / profilesPending / restart.available / hint） |
| `profile_updates` | 只读 | `{ profile?: string }` | updates 载荷 |
| `profile_sync_install` | 变更 | `{ package: string, spec?: string, profiles?: string[], mode?: 'single' \| 'dual' \| 'all' }` | InstallOutcome（含 warnings / rolledBackProfiles） |
| `profile_restart` | 变更 | `{}` | `{ ok: boolean, hint?: string }` |

### 12.3 权限

- 只读工具免审批；
- 变更类工具经宿主审批（`tools/pre-execute` 策略 / 用户审批，对齐 dsh-tool-jobs 的 pre-execute 监听模式）；`profile_restart` 额外受 `allowRestart` 门控；
- 变更工具与面板共享同一执行器与 busy 状态位（互斥 409）。

## 13. F12 HMR 能力检测

- **判定**：bundle 的 package.json 含 `dsh.hot: true`，或 dependencies 含 `cordis-plugin-hmr` / `@deepseek-ai/dsh-client-hmr` → `hotReloadable: true`；
- `POST /api/profile-panel/hot-reload`：`{ bundle }` → 宿主 hmr 机制（实现时探测 `ctx` 可用热更新入口；不可用返回 501 + hint「该 bundle 不支持热加载，请重启」）；
- 客户端：pending 且 `hotReloadable` 的 bundle → 横幅旁「热加载（免重启）」按钮；失败降级为重启提示。

## 14. F13 安装后自动重启

- install 请求 `autoRestart?: true`：仅当 `profiles` 只含当前 profile 且 `restart.available` 时生效；否则忽略并返回 `autoRestartSkipped: true`；
- 流程：install 成功 → 响应 `{ autoRestart: { scheduled: true, inMs: 5000, cancelToken } }` → 客户端 5s 倒计时 + 取消按钮 → 宿主 5s 后执行既有 restart 流程（`desktopRuntime.requestRestart()`，门控不变）；
- `POST /api/profile-panel/cancel-restart`：`{ cancelToken }` → `{ cancelled: true }`；在重启执行前有效（取消后重启定时器清除）；cancel 后若仍有 pendingRestart，横幅照常显示（用户可手动重启）。

## 15. F14 桌面 selection 展示

- 仅桌面形态（`ctx.desktopProfiles` 存在时）：读取桌面应用 profile-selection `state.json`（`active` + `lastKnownGood`；路径经桌面服务解析，实现时以实际文件位置为准）；
- status 增加（仅桌面）：

```jsonc
"desktopSelection": { "active": "desktop", "lastKnownGood": "web" }
```

- 客户端：ProfileCard 增加「下次桌面启动：desktop（lastKnownGood 回退: web）」；`active ≠ 当前 profile` 时黄色提示（延续 v0.1 对 P2 的可见性承诺）；
- 读取失败 / 文件不存在 → 字段缺省（不阻断）。

## 16. F15 发布与生态（流程规格）

- **版本**：Phase 8–14 全部落地 → `1.0.0`；部分落地 → `0.2.0+`（semver 递增）；
- **发布清单**：`lib/`、`client/`、`cordis.patch.yml`、`LICENSE`、`README.md`、`README.zh.md`、`CHANGELOG.md`；
- **README 注明**：发布首日本插件自身受 `minimumReleaseAge` 影响，建议显式版本安装（`dsh-profile-panel@<exact>`）；
- **生态**：提交 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry（dshmarket 自动收录）→ 验证「市场可见 → 一键安装」链路；
- **与 dshmarket 协同**：面板检测到 `dshmarket` 已装 → InstallSection 顶部提示「浏览完整插件目录请到 设置 → Plugin Market」；市场侧零改动。

## 17. F16 双端安装模式（桌面端 GUI 检测与单/双端选择）

### 17.1 动机
装了桌面端 GUI 的用户，安装插件时通常希望 web 与 desktop 两个端一次装齐（P2「装错 profile」的最后一公里：不是装错，而是只装了一端）。本功能自动检测桌面端 GUI 是否存在，存在时在安装界面提供「双端 / 单端」模式选择。

### 17.2 桌面端 GUI 检测（detectDesktop）

判定顺序（高 → 低），返回 `DesktopPresence`：

| reason | 判定条件 | 说明 |
|--------|----------|------|
| `runtime` | `ctx.get('desktopProfiles')` 服务存在 | 当前宿主跑在 DSH Desktop 内（最强信号） |
| `profile` | `$DSH_HOME/profiles/desktop` 存在且 webCapable（`webCapableFromBundles`） | 桌面端 profile 已创建（桌面应用大概率已装，即使当前宿主是纯 CLI） |
| `app-data` | 桌面应用数据目录存在（Windows `%APPDATA%\DSH Desktop`、macOS `~/Library/Application Support/DSH Desktop`、Linux `~/.config/DSH Desktop`） | 应用已装但 desktop profile 可能尚未创建 |
| `none` | 以上均不满足 | 未检测到桌面端 |

```ts
interface DesktopPresence {
  detected: boolean
  reason: 'runtime' | 'profile' | 'app-data' | 'none'
  /** 另一端 webCapable profile 名（dual 目标可用时），如 'desktop' */
  profile?: string
  /** reason='app-data' 时透出应用数据目录（路径缩写） */
  appDataDir?: string
}
```

- `detectDesktop` 与 F14（`desktopSelection` 读取）共用桌面存在性检测实现（同一模块，F14 额外读 `state.json` 的 active/lastKnownGood）；
- 检测失败一律降级为 `detected:false`（`none`），不阻断。

### 17.3 status 载荷

```jsonc
"desktop": {
  "detected": true,
  "reason": "profile",
  "profile": "desktop",
  "appDataDir": "~\\AppData\\Roaming\\DSH Desktop"
}
```

### 17.4 install mode（服务端解析）

`POST /install` 请求 `mode?: 'single' | 'dual' | 'all'`，目标 profile 解析优先级：

```
profiles（显式） > mode > 缺省 single
```

| mode | 解析 |
|------|------|
| `single` | 仅当前 profile（v0.1 行为） |
| `dual` | {当前, 另一端}：另一端 = `current==='web' ? 'desktop' : current==='desktop' ? 'web' : 'desktop'`，并按 webCapable profile 过滤；另一端缺失/不可用 → 降级为仅当前 profile + `warnings[].code='dual-unavailable'`（不 400，保持幂等与宽容） |
| `all` | 全部 webCapable profile（等价 UI 全选） |

- `mode` 与 `profiles` 同时给出时 `profiles` 优先（`mode` 忽略）；
- 降级 warning 并入 install 响应 `warnings[]`（与 F1 preview warnings 同数组）。

### 17.5 客户端

- InstallSection 顶部：`status.desktop.detected === true` 时显示模式分段选择：
  - **单端（仅当前）**：selected = {当前}；
  - **双端（web + desktop）**：selected = {当前, `desktop.profile`}（自动勾选，`desktop.profile` 缺失时禁用并提示「桌面端 profile 不可用」）；
  - **自定义**：复选框自由勾选（当前 profile 默认勾选，即 v0.1 行为）；
- `desktop.detected === false` → 隐藏模式选择，行为与 v0.1 完全一致；
- 双端选中后若用户手动改勾选 → 自动切到「自定义」模式。

### 17.6 安全 / 兼容

- 无新增端点；`mode` 仅改变目标 profile 解析，执行器、门控、reconcile、audit 全部复用 install；
- 兼容性见 §18 矩阵各行；`profile_sync_install` 工具（§12.2）新增 `mode` 参数，语义与面板一致。

## 18. 兼容性矩阵更新（v2）

| 形态 | v2 新增能力 | 降级/边界 |
|------|-------------|-----------|
| DSH Desktop（active: desktop / web） | F1–F16 全部；双端模式默认可用（`reason=runtime`） | — |
| 纯 `dsh web` | F1–F13、F16（desktop 已装时双端可用，`reason=profile/app-data`）；restart 仍 501 + hint | SSE → poll；HMR 视宿主能力；自动重启不可用；`reason=none` 时双端选项隐藏 |
| systemd / pm2 + `allowRestart: false` | F1–F12、F14、F16（视 desktop 检测） | `profile_restart` 工具与自动重启隐藏/拒绝 |
| 无 webServer 的 headless | 无新增 HTTP 端点；审计目录仍可写（install 不可用则无 audit 变更条目） | F16 无 UI 载体（`mode` 仅对工具调用方开放） |

## 19. 测试规格（v2 新增）

### 18.1 宿主（vitest）

- `registryView`：缓存命中/失效、网络失败降级、`time --json` 解析、dist-tag 直查；
- `install-preview`：release-age 边界（= 阈值 / 超阈值 / 未到阈值）、spec 缺省 vs 精确、suggestedPin、失败降级 200；
- `rollback`：部分失败自动回滚（快照恢复断言）、`rollback: false` 保持 v1、无快照 undo 404、busy 互斥 409；
- `updates`：outdated 判定、TTL 缓存、非 bundle 依赖跳过、离线 warning；
- `update` / `align`：版本对齐断言、逐 profile 结果、`downgraded` 沿用；
- SSE / poll：事件序列（pending → clean）、心跳、seq 单调、连接上限 503、断开清理；
- 多 profile 聚合：上限截断、非 webCapable 跳过、manifest 损坏跳过；
- `health`：各 issue code 构造用例、`nextBundles` dry-run 不写盘（断言 manifest mtime 不变）；
- `diff`：onlyIn / versionDiffers 断言；
- 归因：`dependency` / `inbox` / `patch` 三态、layerIndex；
- `boot-report`：loader 快照 + failed 错误捕获；
- `audit`：写入、读取、分页、轮转、路径缩写、失败不阻断；
- 工具：`defineTool` 注册断言（4 个）、只读/变更权限位、`profile_restart` 的 allowRestart 门控；
- `hot-reload`：能力探测、501 降级；
- `autoRestart`：仅当前 profile 生效、`autoRestartSkipped`、取消令牌、取消后横幅保留；
- `desktopSelection`：state.json 读取 / 缺失缺省；
- **F16 detectDesktop**：三级检测（runtime / profile / app-data / none）逐级构造、`appDataDir` 路径缩写、检测失败降级 none；
- **F16 resolveDualTargets**：current=web / desktop / 自定义名三种另一端解析、webCapable 过滤、另一端缺失 → 单端 + `dual-unavailable`；
- **F16 install mode**：优先级 `profiles > mode > 缺省 single`、`all` 全量解析、`mode`+`profiles` 同时给出时 `profiles` 优先、status.desktop 载荷。

### 18.2 客户端（vitest + jsdom + @testing-library/react）

- UpdatesSection：徽标、更新/对齐交互、逐 profile 结果行、离线 warning；
- 「其他 profile 待重启」提示条（显隐 + 展开明细）；
- HealthCard：issue 列表渲染、severity 着色、nextBundles 预览；
- CompareCard：diff 渲染；
- AuditCard：时间线渲染、失败标红；
- 自动重启倒计时 + 取消按钮；
- SSE 断线 → 轮询回落（mock EventSource / fetch）；
- **F16 模式选择器**：`desktop.detected` true/false 时显隐、单端/双端/自定义三态切换、双端自动勾选 {当前, desktop.profile}、`desktop.profile` 缺失时双端禁用 + 提示、手动改勾选切回自定义。

### 18.3 集成（Phase 15/16 手工链路）

- fake-home 纯 web：install-preview → 安装（preview: true 带 warnings）→ 自动回滚（构造部分失败）→ undo → updates → update → align → SSE 实时横幅 → health/diff/boot-report/audit 全链路；
- fake-home 纯 web + desktop profile 存在：双端模式一次装齐 web+desktop 两 profile（断言两 profile manifest 均含新包）；
- desktop profile：Agent 工具审批流 → HMR 热加载 → 自动重启倒计时 → 桌面 selection 展示 → 双端模式默认可用。

## 20. 已知边界

- SSE 依赖宿主 HTTP 直出 res 的能力（`register` 已具备）；若部署有代理层限制长连接，自动走 poll 通道；
- undo / 自动回滚**不重建 node_modules**：恢复 manifest 后需 `pnpm install`（响应 hint 提示）；lockfile 指纹仅用于比对提醒，不参与还原；
- updates 依赖 registry 可用性；离线时为空 + warning，不误报；
- F11 变更工具与面板共享安全门控与 busy 位，无法绕行审批；
- 多 profile 监听上限 10，超出仅记录日志；
- HMR 为「尽力而为」：声明 `dsh.hot` 但宿主不支持时降级为重启提示；
- F15 发布当天本插件自身也受 `minimumReleaseAge` 影响（README 显式版本兜底）；
- F16 桌面端检测为启发式：`app-data` 命中但 desktop profile 未创建 → 双端选项禁用 + 提示，不误装；`profile`/`app-data` 命中不代表桌面端当前在运行（仅代表「已安装/已创建」）；
- F16 `mode=dual` 另一端缺失 → 降级为单端 + `dual-unavailable` warning（不 400）；自定义 profile 名（非 web/desktop）时另一端固定取 `desktop`；
- v2 不实现卸载（`uninstall` 仅作为 audit action 预留，管理动作仍属 dshmarket 领域，与 v0.1 定位一致）。
