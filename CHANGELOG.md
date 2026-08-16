# Changelog

## v2.0.0（未发布 · 当前工作区实现）

> 依据 plan-v2.md / spec-v2.md 的 F1–F16 全量实现；F15 的 npm 发布待执行。

### F17 — 市场对接（dshmarket 同源目录 + GitHub 直装 + 市场→面板跳转）

- **市场搜索（下载模块内置）**：`src/market.ts` 加载 awesome-dsh-plugin.com/plugins.json（即 dshmarket 的目录源，TTL 缓存 60s），离线时回退本机 `dshmarket/data/registry-snapshot.json`；`GET /api/profile-panel/market/search?q=&limit=`；客户端 InstallSection 内置搜索框（结果带 npm/GitHub 来源徽标、星标与简介），一键「带入安装区」并自动触发版本预览。
- **安装目标解析对齐 dshmarket**：目录条目有合法 `npm` 字段→npm 名；否则→`github:owner/repo[#path:/sub]`（monorepo 子包选择器）。这解释了历史问题——市场目录 457 个插件中仅 119 个是 npm 包，其余 338 个只存在于 GitHub，面板此前只查 npm registry，因此「大部分市场包名查不到版本」。
- **GitHub 直装支持**：`validateInstallTarget` 接受严格形态的 `github:` 目标（拒绝版本 spec、`..` 选择器与注入）；安装成功后按依赖 diff 对账新增 bundle（`installedAs` / `resolvedVersion` 回报）；`install-preview` 对 GitHub 目标返回 `github-source` 预览（无需 registry）；F3 更新检测对 github/link/file 依赖跳过 registry 查询并降级为 `non-registry` 提示。
- **市场→面板跳转（接收侧）**：`src/client/market-bridge.ts` 支持 `window` 自定义事件 `dsh-profile-panel:install-target`（`detail: { package, spec? }`）与 URL 深链 `#dshpp-install=<target>`；InstallSection 挂载时消费预填并自动预览。设置外壳是单页导航（每功能一页、无跨分区切换 API），故接收侧为「预填待消费」语义——市场侧按钮只需派发事件或设置 hash，即可把包名送进本插件下载模块（上游 dshmarket 接入点已预留）。
- 双语文案、宿主单测（install/market/routes/registry/updates）与客户端测试（panel 市场搜索、深链/事件预填、bridge 解析）全部补齐。

### 仓库发布准备（GitHub 仓库名 `dsh-profilespanel`）

- 构建产物 `lib/` + `client/` 纳入版本库：`github:lingxin-maz/dsh-profilespanel` 直装**无需在消费端构建**，装完即可运行（`prepare` 脚本仍保留作刷新路径）；
- 新增 `.github/workflows/ci.yml`（push/PR 自动 typecheck + build + test）、`.gitattributes`（LF 归一）、完整 `.gitignore`；`package.json` 增加 `engines`（node ≥ 18）、`packageManager`（pnpm@11.7.0）；
- README 重写：项目优势（与 dshmarket / 官方内置能力对比表）、三种安装方式（npm / GitHub / 本地）、安装后验证步骤、仓库运行必需内容清单。

### 修复（健康检查误报 · F6 peer-gap）

- **宿主自带 peer 不再误报**：`@deepseek-ai/*` 由 harness 装载器从其自身模块表提供，文件系统扫描永远看不到——此类 peer（如 `@deepseek-ai/cordis`、`@deepseek-ai/schemastery`）不再被报告为「缺失」；
- **peer 查找路径修正**：共享 store 查找原先把 `node_modules` 拼了两层且不扫 pnpm 虚拟库，现改用 `readInstalledVersion`（flat + `.pnpm` 布局均覆盖），并增加 `import.meta.resolve` 宿主解析兜底——只有三种方式都失败才报告缺失；
- 真实 desktop profile 验证：`collectHealth` 返回 `ok: true, issues: []`（修复前 3 条 peer-gap 误报）。

### 修复（启动报告 · F9，与 loader 真实形状对齐）

- `readLoaderEntries` 兼容 cordis loader 的 **Generator** 形状（`entries()` 返回迭代器而非数组），并对非迭代结果 / 抛错 / 无 loader 全部降级为空报告；
- `index.ts` 经 `ctx.get('loader')` 获取 loader 服务（避免无 inject 时直接属性访问抛错）。

### Phase 8 — 安装助手、双端模式与回滚（F1 / F2 / F16）

- **F1 版本对比助手**：`src/registry.ts`（`pnpm view` 封装 + TTL 缓存 + 发布年龄计算）；`POST /api/profile-panel/install-preview`；install 请求 `preview?: boolean` 时 warnings 并入响应；Config 新增 `minimumReleaseAgeDays`（默认 7）。
- **F2 回滚与 undo**：安装前自动落盘 manifest 快照（`.dsh-profile-panel/undo/<ts>/`）；install 请求 `rollback?: boolean` 部分失败自动恢复；`POST /api/profile-panel/undo` 恢复最近快照。
- **F16 双端安装模式**：`src/desktop.ts`（runtime / profile / app-data 三级桌面端检测 + `resolveInstallTargets`）；install 请求 `mode: 'single' | 'dual' | 'all'`（优先级 `profiles > mode > 缺省 single`，另一端缺失降级 + `dual-unavailable` warning）；客户端模式选择器（单端 / 双端 / 自定义勾选）。

### Phase 9 — 更新检测与同步（F3）

- `src/updates.ts`：逐 bundle 过期检测（`GET /api/profile-panel/updates`）、更新（`POST /update`，复用安装执行器）、跨 profile 对齐（`POST /align`，version 缺省取 registry latest）；客户端 UpdatesCard（更新 / 全部更新 / 对齐 + 逐 profile 结果）。

### Phase 10 — 实时推送与多 profile 监听（F4 / F5）

- `src/events.ts`：单调 seq 事件总线；`GET /api/profile-panel/events`（SSE，连接上限 8、30s 心跳、断开清理）+ `GET /api/profile-panel/poll`（25s 长轮询回落）；安装/更新/对齐/重启均发布事件。
- `src/multi-watch.ts`：全部 webCapable profile 变更聚合（上限 10）；status 新增 `profilesPending`；客户端 SSE 优先 + 轮询回落（`use-status.ts`）+ 「其他 profile 待重启」提示条。

### Phase 11 — 健康检查与启动预览（F6）

- `src/health.ts`：manifest 损坏 / 缺失包 / peer 缺口（静态扫描）/ 孤儿 bundle / 层栈重复 + reconcile dry-run `nextBundles`；`GET /api/profile-panel/health`；客户端 HealthCard。

### Phase 12 — profile 对比与来源归因（F7 / F8）

- `src/compare.ts`：`GET /api/profile-panel/diff?profiles=a,b`；客户端 CompareCard（双下拉 + 差异行）。
- `src/attribution.ts`：bundles 行扩展 `source`（inbox/dependency/patch）、`layerIndex`、`introducedBy`、`hotReloadable`；客户端来源标签 + 可热加载标记。

### Phase 13 — 启动报告与审计日志（F9 / F10）

- `src/boot-report.ts`：loader 投影读取；`GET /api/profile-panel/boot-report`；客户端 BootReportCard（失败项带原因）。
- `src/audit.ts`：本地 JSONL 审计（追加、时间戳严格递增、1000 条或 30 天轮转、损坏行跳过）；install / update / align / undo / restart 全部记录；`GET /api/profile-panel/audit`；客户端 AuditCard。

### Phase 14 — Agent 工具（F11）

- `src/tools.ts`：`profile_status` / `profile_updates` / `profile_sync_install` / `profile_restart` 四个工具；`@deepseek-ai/dsh-tools` 懒加载（缺失时静默跳过）；变更类复用面板执行器与门控（install 复用 `validateInstallTarget`、restart 受 `allowRestart` 门控）。

### Phase 15 — 体验增强（F12 / F13 / F14）

- **F12 HMR**：`isHotReloadable` 能力探测（`dsh.hot` / hmr 依赖标记）；`POST /api/profile-panel/hot-reload`（宿主 hmr 探测，不支持 501）；客户端「热加载（免重启）」按钮。
- **F13 自动重启**：install 请求 `autoRestart?: boolean`（仅当前 profile + 重启可用时调度）；`POST /api/profile-panel/cancel-restart`（cancelToken）；客户端 5s 倒计时 + 取消。
- **F14 桌面 selection**：`readDesktopSelection`（active + lastKnownGood）；status 新增 `desktopSelection`（仅桌面形态）；ProfileCard 显示「下次桌面启动」。

### Phase 16 — 发布与生态（F15，部分）

- README 重写为 v2 能力与接口总表；本文档新建；npm 发布与 awesome-dsh-plugin 收录待执行。

## v0.1.0

- 初始版本：观察 + 待重启检测 + 一键重启 + 多 profile 同步安装（详见 plan.md / spec.md / VERIFICATION.md）。
