# dsh-profile-panel v2 · 增强路线计划（Plan v2）

> 承接 [plan.md](plan.md)（v0.1.0 已完成：观察 + 重启引导 + 多 profile 同步安装核心闭环）。
> v2 把评审产出的 **全部增强建议（F1–F16，含发布/生态）** 落成可执行的阶段计划，与 [spec-v2.md](spec-v2.md) 一一对应。
> 定位演进：从「插件状态面板」升级为 **「profile 运维控制台」**——观察、诊断、变更管理、Agent 化、生态接入。
>
> **实施状态**：Phase 8–15（F1–F14、F16）已全部实现并通过测试（宿主 150 + 客户端 44 用例，typecheck/build 全绿）；Phase 16 仅剩 npm 发布与 awesome-dsh-plugin 收录两项外部动作。详见 [CHANGELOG.md](CHANGELOG.md)。

## 1. 背景与动机

v0.1 已验证核心闭环并在真实桌面环境安装。对照社区生态（dshmarket、dsh-plugin-marketplace、dsh-monitor 等）与官方内置（`dsh-host-plugin-inventory` 只读且无来源归因、`dsh-client-ui-settings-plugins` 仅配置编辑），v2 的动机如下：

| 编号 | 动机（缺口） | 对应建议 |
|------|--------------|----------|
| V1 | P3 供应链降级仍是「事后标记」，缺「事前预警」 | F1 版本对比助手 |
| V2 | 多 profile 安装部分失败无回滚、无撤销入口 | F2 回滚与 undo |
| V3 | 面板只做安装，不做更新/过期管理，profile 间版本漂移无感知 | F3 更新检测与同步 |
| V4 | 待重启靠 2s 轮询非实时；只监听当前 profile，装错 profile 不可见 | F4 SSE 推送、F5 多 profile 聚合 |
| V5 | 无诊断能力：peer 缺口 / 孤儿 bundle / 启动失败均不可见 | F6 健康检查、F7 对比、F8 来源归因、F9 启动报告 |
| V6 | 无历史可回溯（装了什么、何时、结果如何） | F10 审计日志 |
| V7 | 面板能力只对 UI 开放，agent 会话无法使用 | F11 Agent 工具 |
| V8 | 重启是唯一生效路径，HMR 能力未利用 | F12 HMR 检测 |
| V9 | 安装后需手动重启；桌面 profile 切换状态不可见 | F13 自动重启、F14 桌面 selection |
| V10 | 未发布、未进生态（awesome-dsh-plugin / dshmarket 收录） | F15 发布与生态 |
| V11 | 装了桌面端 GUI 的用户安装插件仍需手动勾选 web+desktop 两个 profile，缺「一键双端」模式（P2 的最后一公里） | F16 双端安装模式 |

## 2. 目标

1. **安装闭环增强**：事前版本/发布年龄预警 + 部分失败自动回滚 + 手动撤销 + 更新检测与跨 profile 版本对齐；
2. **实时与全量可见**：SSE 推送替代轮询 + 所有 webCapable profile 的待重启状态聚合；
3. **诊断能力**：健康检查（peer/孤儿/缺失）、profile 对比、bundle 来源归因、boot 启动报告、审计日志；
4. **Agent 化**：只读/变更类工具注册，变更走宿主审批；
5. **体验与生态**：HMR 免重启、安装后自动重启、桌面 selection 展示、npm 发布 + awesome-dsh-plugin 收录；
6. **双端安装模式**：自动检测桌面端 GUI；检测到时安装提供「web + desktop 双端」与「仅当前端」模式选择，一次装齐两端。

## 3. 阶段划分（Phase 8–16）

> 编号延续 plan.md 的 Phase 0–7。每个 Phase 给出任务清单与出口条件；F 编号对应 spec-v2.md 章节。

### Phase 8 — 安装助手、双端模式与回滚（F1、F2、F16）

**任务**
- [x] **F1 版本对比助手**
  - 新增 `registryView(pkg)` 统一封装：`pnpm view <pkg> version`（dist-tag latest）+ `pnpm view <pkg> time --json`（发布时间表）；5 分钟 TTL 内存缓存；失败返回 `{ ok:false, code:'network'|'not-found' }` 且不阻断主流程
  - 新增 `POST /api/profile-panel/install-preview`：`{ package, spec? }` → 最新版、发布时间、发布年龄、`minimumReleaseAgeDays` 阈值、`warnings[]`、`suggestedPin`
  - `POST /install` 请求支持 `preview?: boolean`：预览 warnings 并入安装响应
  - 与 v0.1 `downgraded` 标记共用 `semverCompare` / `readInstalledVersion`（install.ts 已有）
  - Config 增加 `minimumReleaseAgeDays`（默认 7）
- [x] **F2 回滚与 undo**
  - 安装前落盘快照：`<profileDir>/.dsh-profile-panel/undo/<ts>/package.json`（完整 manifest）+ 同目录 `lockfile.fingerprint`（仅指纹不复制文件）
  - `POST /install` 请求 `rollback?: boolean`（默认 `false` 保持 v1 语义）：部分失败（≥1 成功且 ≥1 失败）时自动恢复已成功 profile 的快照，响应加 `rolledBackProfiles[]`
  - 新增 `POST /api/profile-panel/undo`：`{ profiles? }` → 恢复最近快照 manifest（不自动 pnpm install，返回 hint），audit 记录
  - undo 与 install/restart 互斥（busy 状态位 409）
  - 快照目录不在 `TRACKED_FILES` 内，不影响 watcher；恢复 package.json 会自然触发 pendingRestart（预期行为）
- [x] **F16 双端安装模式**
  - 宿主新增 `detectDesktop(ctx)`：三级桌面端 GUI 检测（① `ctx.desktopProfiles` 服务存在 → `runtime`；② `$DSH_HOME/profiles/desktop` 存在且 webCapable → `profile`；③ 桌面应用数据目录存在（Windows `%APPDATA%\DSH Desktop` 等）→ `app-data`；都不满足 → `none`），返回 `{ detected, reason, profile?, appDataDir? }`；与 F14 共用桌面存在性检测实现
  - status 载荷增加 `desktop` 检测结果；`POST /install` 请求支持 `mode: 'single' | 'dual' | 'all'`（优先级 `profiles` > `mode` > 缺省 `single`）
  - `dual` = {当前 profile, 另一端}：另一端按 `current==='web' → 'desktop'`、`current==='desktop' → 'web'`、其他自定义名 → `'desktop'` 解析，并按 webCapable profile 过滤；另一端缺失 → 降级为仅当前 + `warnings[].code='dual-unavailable'`
  - `all` = 全部 webCapable profile（等价 UI 全选）
  - 客户端 InstallSection：`desktop.detected=true` 时显示模式选择（单端 / 双端 / 自定义勾选）；双端选中自动勾选 {当前, 另一端}；未检测到桌面端时隐藏模式选择（保持 v0.1 行为）

**出口条件**：detectDesktop 三级检测单测 + resolveDualTargets 单测（current=web/desktop/自定义、另一端缺失降级）；install mode 优先级与 `dual-unavailable` warning 单测；客户端模式选择器组件测试（显隐 + 双端自动勾选）；fake-home 实测「纯 web + desktop profile 存在 → 双端一次装齐两 profile」。`pnpm run typecheck` / `build` 全绿。

### Phase 9 — 更新检测与同步（F3）

**任务**
- [x] `GET /api/profile-panel/updates?profile=`：逐 bundle `readInstalledVersion` vs registry latest → `[{ bundle, installed, latest, outdated, releaseAgeDays }]`；registry 查询走 registryView 缓存
- [x] `POST /api/profile-panel/update`：`{ package, spec?, profiles[] }` → 复用 install 执行器 + reconcile + 待重启检测自然触发；`downgraded` 标记沿用
- [x] `POST /api/profile-panel/align`：`{ package, profiles[], version? }` → 多 profile 对齐同一版本（version 缺省 = latest），响应逐 profile
- [x] 客户端：BundleCard 行尾「有更新」徽标 + 新增 UpdatesSection（列表 + 更新 / 全部更新 / 对齐按钮 + 逐 profile 结果行）

**出口条件**：updates 接口与更新/对齐执行器单测；客户端组件测试；fake-home 实测「旧版本 → 检测到更新 → 一键更新 → 待重启横幅出现」。

### Phase 10 — 实时推送与多 profile 监听（F4、F5）

**任务**
- [x] **F4 SSE 推送**
  - `GET /api/profile-panel/events`（text/event-stream；基于现有 `webServer.register` 直出原始 req/res，无需 upgrade；宿主另有 `registerUpgrade` 可作 WebSocket 备选）
  - 事件：`pending`（携带 changes）、`clean`、`installing`/`installed`、`restarting`、`updates`；30s 心跳 comment；连接上限（如 8）超出 503；断开即清理监听
  - 降级通道：长轮询 `GET /api/profile-panel/poll?since=<seq>`（宿主维护单调递增 seq，无变更挂起至 25s）
  - 客户端 `usePanelStatus`：SSE 优先 + 轮询回落（EventSource onerror 连续 2 次切换轮询；成功后尝试重连 SSE）
- [x] **F5 多 profile 聚合**
  - 宿主 `MultiProfileWatcher`：对每个 webCapable profile 复用 `createProfileWatcher`，聚合 `profilesPending: [{ profile, pendingRestart, changes }]`
  - status 载荷增加 `profilesPending`；面板横幅下加「其他 profile 待重启」提示条
  - 上限保护：最多监听 10 个 profile；仅 webCapable；只跟踪 3 个文件（复用 TRACKED_FILES）

**出口条件**：SSE 事件流 fake-home E2E；轮询回落切换测试（mock EventSource）；多 profile 聚合单测（含上限截断）。

### Phase 11 — 健康检查与启动预览（F6）

**任务**
- [x] reconcile dry-run：复用 `reconcileBundles` 判定逻辑，只计算不写盘 → `nextBundles`（「重启后组合」预览）
- [x] `GET /api/profile-panel/health?profile=`，检查项：
  - `manifest-broken`（error）：package.json 不可解析
  - `missing-package`（error）：dependencies/bundles 声明但 node_modules 缺失
  - `peer-gap`（warning）：某 bundle 的 peerDependencies 未满足（本地静态扫描，对齐 `pnpm peers check` 语义，不 spawn）
  - `orphan-bundle`（info）：bundles 有、dependencies 无且非 in-box（疑似残留）
  - `duplicate-bundle`（warning）：层栈重复
- [x] 客户端 HealthCard：issue 列表（severity + code + 建议文案）+ 「重启后组合」预览

**出口条件**：health 单测（各 issue code 构造用例）；`nextBundles` dry-run 断言「不写盘」；UI 组件测试。

### Phase 12 — profile 对比与来源归因（F7、F8）

**任务**
- [x] **F7** `GET /api/profile-panel/diff?profiles=a,b`：`{ onlyInA, onlyInB, versionDiffers: [{ bundle, a, b }] }`（版本复用 `readInstalledVersion`）
- [x] **F8 来源归因**：status.bundles 行扩展 `source: 'inbox' | 'dependency' | 'patch'`、`layerIndex`、`introducedBy?`
  - 判定：`dependency` = 在 dependencies 且声明 dsh.bundle.patch；`inbox` = 不在 dependencies（官方内置）；`patch` = 不在 dependencies 但出现在 bundles 且包声明 dsh.bundle.patch（兼容异常 manifest 的兜底态）
- [x] 客户端：BundleCard 行尾来源标签 + 层序；新增 CompareCard（两 profile 并排差异）

**出口条件**：diff 单测（onlyIn/versionDiffers 断言）；归因单测（三态构造）；UI 组件测试。

### Phase 13 — 启动报告与审计日志（F9、F10）

**任务**
- [x] **F9 boot 报告**：apply 时（及 loader 阶段变化时）读取 `ctx.loader.entries()`（官方 `dsh-host-plugin-inventory` 同款投影：id / module / 有效启用 / phase）；订阅 loader 失败 → `{ bundle, phase: 'failed', error }`；`GET /api/profile-panel/boot-report` 返回最近一次 boot 结果（内存快照）
- [x] **F10 审计日志**
  - 文件：`<profileDir>/.dsh-profile-panel/audit.jsonl`（追加写；写入失败仅 logger.warn，不阻断主流程）
  - 条目：`{ ts, action: install|update|uninstall(预留)|restart|undo|align, profile, package?, spec?, resolved?, ok, error? }`；路径缩写（复用 `abbreviatePath`）；永不记录对话/prompt 内容
  - `GET /api/profile-panel/audit?limit=50&offset=0` → `{ total, entries }`；保留策略：>1000 条或 >30 天轮转
- [x] 客户端：AuditCard 时间线（按 action 着色，失败标红）

**出口条件**：boot-report 单测（loader 快照模拟 + failed 捕获）；audit 写入/读取/轮转/失败不阻断单测。

### Phase 14 — Agent 工具（F11）

**任务**
- [x] 用 `@deepseek-ai/dsh-tools` 的 `defineTool` + `ctx.tools.register`（参照 dsh-tool-jobs 的 apply 模式）注册 4 个工具：
  - `profile_status`（只读）：返回精简 status（profileName / bundles / pendingRestart / profilesPending / restart.available）
  - `profile_updates`（只读）：返回 updates 载荷
  - `profile_sync_install`（变更）：`{ package, spec?, profiles[] }`，触发现有 install 流程
  - `profile_restart`（变更）：触发现有重启流程，受 allowRestart 门控
- [x] 变更类工具经宿主审批（pre-execute 策略 / 用户审批，对齐 dsh-tool-jobs 的 `tools/pre-execute` 监听模式）；只读工具免审批
- [x] 输出用通用 UI 卡片：read（status/updates）、execute（install/restart）

**出口条件**：工具注册断言（4 个，宿主测试）；agent 会话内 `profile_status` 实测成功；变更类工具审批通过后执行成功（E2E 或宿主级测试）。

### Phase 15 — 体验增强（F12、F13、F14）

**任务**
- [x] **F12 HMR 能力检测**：bundle package.json 含 `dsh.hot: true` 或依赖 `cordis-plugin-hmr`/`@deepseek-ai/dsh-client-hmr` → `hotReloadable: true`；pending 且 hotReloadable 显示「热加载（免重启）」→ `POST /api/profile-panel/hot-reload`（宿主 hmr 机制探测，不可用返回 501 + hint）
- [x] **F13 安装后自动重启**：install 请求 `autoRestart?: true`（仅当 profiles 只含当前 profile 且 restart.available，否则返回 `autoRestartSkipped: true`）；客户端 5s 倒计时 + 取消 → `POST /api/profile-panel/cancel-restart`（延迟重启定时器 + 取消令牌）
- [x] **F14 桌面 selection**：仅桌面形态读取 profile-selection `state.json`（active + lastKnownGood）→ status.desktopSelection；ProfileCard 显示「下次桌面启动：X（lastKnownGood 回退: Y）」，active ≠ 当前 profile 时黄色提示

**出口条件**：hot-reload 单测 + 501 降级路径；自动重启倒计时组件测试 + 取消令牌单测；desktopSelection 单测（fake state.json 读取/缺省）。

### Phase 16 — 发布与生态（F15）

**任务**
- [x] 版本号：Phase 8–14 全部落地 → `1.0.0`；部分落地 → `0.2.0+`（semver 递增）
- [ ] npm 发布：`pnpm publish`；注意本插件自身也受 minimumReleaseAge 影响（发布当天安装可能解析旧版）→ README 注明显式版本安装
- [x] 文档：README 加截图、CHANGELOG；plan.md / spec.md 增加 v2 引用
- [ ] 生态：提交 awesome-dsh-plugin registry（dshmarket 自动收录）；与 dshmarket 协同——F17 已实现：下载模块内置市场搜索（同源目录 + 快照回退）、`github:` 直装、`dsh-profile-panel:install-target` 事件与 `#dshpp-install=` 深链接收侧（市场侧按钮接入点已预留，上游 PR 待提交）
- [x] 回归：既有 58 用例 + v2 新增用例全绿；typecheck/build 通过；双形态（desktop + 纯 web）E2E 复验

**出口条件**：npm 可见、market 收录、双形态复验通过。

## 4. 里程碑

| 里程碑 | 阶段 | 判定 |
|--------|------|------|
| M6 安装闭环增强 | P8–P9 | install-preview / rollback / undo / updates / align / 双端模式可用 |
| M7 实时与全量可见 | P10 | SSE + 多 profile 聚合 |
| M8 诊断能力 | P11–P13 | health / diff / 归因 / boot-report / audit |
| M9 Agent 化 | P14 | 4 个工具注册 + 审批流 |
| M10 体验与发布 | P15–P16 | HMR / 自动重启 / npm 发布 / 生态收录 |

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| `pnpm view` 网络失败或元数据缓存（P3 教训：`@latest` 会被缓存骗过） | `registryView` 统一封装：TTL 5min、失败降级为 warning 不阻断；dist-tag 直查不依赖本地 pnpm 状态 |
| 宿主 webServer 对流式响应支持不确定 | SSE 基于 `register` 直出原始 res 实测；不支持则长轮询回落（同一事件序列 seq 机制） |
| 回滚只恢复 manifest 不够（lockfile/node_modules 已变） | 快照含 lockfile 指纹；undo/自动回滚均提示 `pnpm install`；不伪装成完整还原 |
| 多 profile 监听开销 | 仅 webCapable、上限 10、复用 watcher 工厂（3 文件 stat，开销可忽略） |
| 审计日志含敏感路径/隐私 | 路径缩写、无对话内容、纯本地 JSONL、不 telemetry |
| 变更类 Agent 工具被滥用 | 走宿主审批体系；只读工具才免审批；与 install/restart 同一安全门控 |
| HMR 检测误判（声明了但宿主不支持） | 能力探测 + 调用失败降级为「仍需重启」提示 |
| 自动重启误触发 | 仅 `autoRestart` 显式请求 + 仅当前 profile + 5s 取消窗口 + 取消令牌 |
| undo 与 install/restart 并发 | 单一 busy 状态位（installing / undoing / restarting 互斥，409） |
| desktop 检测误判（如 app-data 命中但桌面端未实际使用该 profile） | 三级检测带 `reason` 透出 UI；dual 目标按 webCapable profile 过滤；仅影响模式选择提示，不阻断安装 |
| desktop profile 未创建 / 非 webCapable | `dual` 降级为仅当前 profile + `dual-unavailable` warning；UI 禁用双端选项并提示「桌面端 profile 不可用」 |
| v2 规模膨胀 | 每 Phase 独立出口条件；F1–F3 优先（复用 install 基础设施），F11–F14 可单独裁剪；F15 依赖前面全部 |

## 6. 交付物

- `plan-v2.md`（本文件）、`spec-v2.md`（v2 详细规格）
- 各 Phase 代码变更（宿主 `src/` + 客户端 `src/client/` + `tests/`）
- 发布包 + README/CHANGELOG 更新 + awesome-dsh-plugin 提交
