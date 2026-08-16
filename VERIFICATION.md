# dsh-profile-panel · 端到端验证记录（Verification Record）

> 记录时间：构建完成后的本地验证。环境：DSH Desktop 2.0.0（Electron 43 / Node 24），
> dsh 0.1.0-rc.6，pnpm 11.7.0，Windows。

## 1. 构建与测试

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查 | `pnpm run typecheck`（宿主 tsc + 客户端 tsc） | ✅ 0 错误 |
| 构建 | `pnpm run build`（宿主 tsc → `lib/`，客户端 tsdown → `client/client.js`） | ✅ |
| 客户端产物 | `client/client.js` 以 `window.__ModuleLoader__.load({ id: "dsh-profile-panel", factory })` 包裹，sourcemap 重命名正确 | ✅ |
| 宿主单测 | `vitest run --config vitest.config.ts` | ✅ 45/45 |
| 客户端测试 | `vitest run --config vitest.web.config.ts`（jsdom + testing-library） | ✅ 12/12 |
| peers | `pnpm peers check`（本包） | ✅ No issues |

注：vitest 在 DSH 宿主沙箱内需要 piped-stdio 子进程，经一次性提权运行（与代码无关）。

## 2. 纯 `dsh web` 形态实测（fake-home，全部在会话工作区内）

1. `dsh plugin --profile web add <本包>` → 官方 reconcile 将 `dsh-profile-panel` 追加进
   `dsh.profile.bundles`（排在 dsh-base/dsh-web-app 之后）✅
2. `dsh --profile web --dump-config` → 合成树出现 `# == dsh-profile-panel` 层 ✅
3. 启动 `dsh web --port 60401` → 成功挂载路由（webServer+loader inject 满足即激活）✅
4. `GET /api/profile-panel/status`：
   ```json
   {"profileName":"web","profileDir":"...\\.e2e\\home\\profiles\\web","profileExists":true,
    "bundles":[{"name":"@deepseek-ai/dsh-base","state":"loaded"},...],
    "pendingRestart":false,"changes":null,
    "restart":{"available":false,"restarting":false,"hint":"请在终端重启 dsh web ..."},
    "profiles":[{"name":"web","current":true},{"name":"web2","current":false}]}
   ```
   profile 名来自 `--profile`（非桌面形态），bundles 全部 `loaded`，重启退化为 CLI 提示 ✅
5. 变更实验：运行中执行 `dsh plugin --profile web add <e2e-test-pkg>` →
   **8 秒内** status 变为 `pendingRestart:true`，`changes.changedFiles=[package.json, pnpm-lock.yaml,
   node_modules/.modules.yaml]`，`addedBundles=["e2e-test-pkg"]`，该 bundle 状态 `pending` ⚠ ✅
6. `POST /api/profile-panel/restart`（同源环回）→ **501** + `hint: 请在终端重启 dsh web` ✅
7. `POST /api/profile-panel/install`：
   - 跨源 Origin → **403** ✅
   - `{"package":"../evil"}` → **400** `invalid package name` ✅
   - 合法包 + `profiles:["web","web2"]` → **200** `{overallOk:false, results:[{profile:"web",ok:false,error:"spawn EPERM"},...]}`
     —— 逐 profile 回报语义正确（沙箱内 pnpm 子进程被宿主安全策略拦截，按预期走部分失败路径；
     真实桌面端走 DesktopPnpm 服务不受影响）✅
8. `GET /plugins/dsh-profile-panel/client.js` → 200，`text/javascript`，ModuleLoader factory 格式正确；
   首页 HTML 含 `dsh-profile-panel` boot 条目（浏览器端动态加载成立）✅
9. 重启假 home 服务 → 快照含 e2e-test-pkg，`pendingRestart` 归零（boot 基线重算）✅

## 3. desktop profile 形态验证（真实环境）

1. `dsh plugin --profile desktop add D:\Desktop\harness_plugins_rank` → 安装成功，
   supply-chain 校验通过；manifest 变为：
   ```json
   "dependencies": { "dsh-profile-panel": "link:D:/Desktop/harness_plugins_rank", "dshmarket": "1.5.1" },
   "dsh": { "profile": { "bundles": [ "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dshmarket", "dsh-profile-panel" ] } }
   ```
2. `dsh --profile desktop --dump-config` → 合成树含 `# == dsh-profile-panel` 层 ✅
3. 桌面端 profile 解析：`desktopProfiles.current.dir` 优先（修复 dshmarket 缺省 web 的缺陷）——
   由单测 + 与 `dsh-plugin-desktop` 服务形状比对保证 ✅
4. 待用户执行（会终止本代理会话，因此未自动触发）：
   - **重启 DSH Desktop** → 设置页出现「Profile / 插件」面板（`settings.section` id `profile-panel`）
   - 变更实验：`dsh plugin --profile desktop add <任意小包>` → 10 秒内横幅出现 → 点击「立即重启」
     （`desktopRuntime.requestRestart()` → 优雅 dispose → `app.relaunch()`）
   - 多 profile 安装：面板同步安装区块勾选 desktop+web → 逐 profile 回报
   - 若桌面端启动异常，`%APPDATA%\DSH Desktop\profile-selection\state.json` 的 `lastKnownGood`
     兜底回退上一个可用 profile

## 4. 沙箱边界说明

- vitest 与纯 web 安装执行器（spawn pnpm with pipes）在 DSH 宿主沙箱内受 named-pipe 边界限制，
  均已按「逐 profile 错误回报 / 一次性提权」方式处理或记录；桌面端 packaged pnpm 不受影响。
- `pnpm peers check`（desktop profile）报告的 `@deepseek-ai/cordis` 缺口来自既有 dshmarket@1.5.1
  （本插件安装前已存在；运行时经 `$DSH_HOME/profiles/node_modules` 平铺回退解析，市场功能正常）。

## 5. 事故记录：桌面端 Web boot 失败（`exports is not defined`）

**现象**：重启 DSH Desktop 后报
`Failed to load plugins / failed to import loader entry <随机id> (dsh-profile-panel): exports is not defined`。

**根因**：桌面端浏览器内核（`dsh-client-web` 的 `runPluginBoot`）按名创建 loader 条目（id 为随机生成），
经客户端模块表**物化执行** `client/client.js` 的 factory——此时作用域内只有 `require` 参数。
tsdown 0.22 的 cjs 输出没有像 dshmarket 构建产物那样自带
`var module = { exports: {} }; var exports = module.exports;` 前置声明，normalize 脚本原先也未补齐，
导致 factory 第一句 `Object.defineProperty(exports, ...)` 抛 `exports is not defined`，整棵 Web boot 失败。
宿主端（lib/）导入完全正常；之前的 E2E 只验证了「bundle 可被服务」而从未真正执行它，
jsdom 测试只测源码组件，因此漏检。

**修复**：
1. `scripts/normalize-client-banner.mjs` 在 factory 体内补上 CJS 前置声明（恰好一次）；
2. 新增 `tests/client/bundle.test.tsx`：读取**构建产物** `client/client.js`，用仅含 `require` 的作用域
   真实物化 factory，断言 `name/inject/apply` 导出——该用例在旧产物上会以 `exports is not defined` 失败；
3. 重新构建后 `client/client.js` 头部结构与 dshmarket 产物一致。

**复验**：客户端套件 13/13（含新回归用例）、全套件 58/58、`pnpm run typecheck` / `pnpm run build` 全绿。
修复随工作区链接即时生效（desktop profile 的 `link:` 依赖指向本工作区），重新启动 DSH Desktop 即可恢复。

## 6. 事故记录二：面板 UI 失效（BootReportCard 渲染崩溃）

**现象**：设置页「Profile / 插件」分区整体失效。

**根因**（真实浏览器数据路径，测试固件测不到）：
1. cordis 真实 loader 的 `entries()` 是**生成器**（可迭代对象，不是数组），宿主
   `readLoaderEntries` 直接 `.map` → 线上 `/api/profile-panel/boot-report` 返回
   `{"entries":{}}` 而非数组；
2. 客户端 `BootReportCard` 用 `report?.entries.filter(...)` —— `report` 有可选链但
   `entries` 没有 → 非数组时抛 `TypeError: entries.filter is not a function`，
   **整个设置分区卸载崩溃**。

**修复**（双向防御，客户端一侧刷新页面即生效，无需重启）：
- 宿主 `src/boot-report.ts`：`for...of` 迭代任意可迭代对象，全程 try/catch，
  任何漂移降级为空报告；`routes.ts` boot-report 路由加兜底 500 错误载荷；
- 客户端 `src/client/status-data.ts` 新增 `asArray` 助手；`panel.tsx` 全部载荷数组
  （bundles/profiles/profilesPending/boot-report/audit/health/updates/diff…）改经
  `asArray`；新增 `CardBoundary` 错误边界包裹每张卡片——单卡崩溃降级为一行错误，
  不再拖垮分区；
- 回归测试：`tests/host/boot-report.test.ts`（生成器/非迭代/抛错三种真实形态）；
  `tests/client/panel.test.tsx` 新增 payload-drift 用例（entries/issues/updates 均为
  对象时面板仍完整渲染）；`scripts/live-panel-check.mjs` 诊断脚本（真实构建产物 +
  真实宿主 + 真实 fetch 渲染，5 项检查全 PASS）。

**复验**：typecheck 0 / build 0 / 宿主 156 / 客户端 45 全绿；假 home 全新实例启动
正常且 boot-report 返回数组；真实 3080 实例 live-render 5 项检查全部 PASS。

## 7. 交付物清单

- `package.json` / `cordis.patch.yml` / `tsconfig*.json` / `tsdown.config.ts` / `scripts/normalize-client-banner.mjs`
- `src/`（index / profile / watcher / routes / install / http）+ `src/client/`（index / panel / use-status / status-data / locales / styles / globals / primitives 声明）
- `lib/`（宿主产物 + d.ts）、`client/client.js`（浏览器 classic script）
- `tests/`（宿主 + 客户端全量用例，含 bundle 实执行回归与 payload-drift 回归）
- `README.md`、`plan.md`（勾选状态已更新）、`spec.md`、本记录
