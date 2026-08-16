# dsh-profile-panel · DSH 插件状态面板 / profile 运维控制台

DeepSeek Harness 插件状态面板：观察、诊断、变更管理与 Agent 化——当前 profile、bundle 状态、待重启检测、一键重启、多 profile 同步安装（含双端模式）、更新检测与对齐、健康检查、profile 对比、启动报告与审计日志。

## 功能

- **观察（Profile / 插件面板）**：当前 boot 的 profile、bundle 清单（已加载 ✓ / 待重启 ⚠、来源归因：内置/依赖/patch、可热加载标记）、profile 目录路径、桌面端下次启动 profile（active + lastKnownGood）；
- **待重启检测 + 实时推送**：监听所有 webCapable profile 的 `package.json` / `pnpm-lock.yaml` / `node_modules/.modules.yaml`；当前 profile 变更出现「需要重启」横幅，其他 profile 待重启以提示条展示；SSE 实时推送（断线自动回落轮询）；
- **一键重启**：桌面端走 `desktopRuntime.requestRestart()`（优雅 dispose → `app.relaunch()`）；纯 `dsh web` 显示 CLI 重启提示；支持「安装后自动重启」倒计时 + 取消；
- **同步安装（F16 双端模式）**：自动检测桌面端 GUI（runtime / desktop profile / 应用数据目录三级检测），检测到时可一键「web + desktop 双端」或「仅当前端」，也可自定义勾选全部 profile；逐 profile 回报（含 `downgraded` 供应链降级标记）；
- **安装助手（F1）**：安装前版本预览——latest、发布年龄、`minimumReleaseAge` 策略预警与建议 pin；
- **回滚与撤销（F2）**：安装前自动落盘 manifest 快照；部分失败可选自动回滚；手动「撤销最近变更」；
- **更新检测与同步（F3）**：逐 bundle 对照 registry 检查过期版本，单条更新 / 全部更新 / 跨 profile 对齐同一版本；
- **健康检查（F6）**：缺失包、peer 缺口、孤儿 bundle、层栈重复 + 「重启后组合」dry-run 预览；
- **Profile 对比（F7）**：两 profile 并排 diff（仅单侧存在 / 版本漂移）；
- **启动报告（F9）**：最近一次 boot 的 bundle 激活结果（含失败原因）；
- **审计日志（F10）**：本地 JSONL 变更时间线（安装/更新/撤销/重启/对齐；路径缩写，不含对话内容）；
- **Agent 工具（F11）**：`profile_status` / `profile_updates` / `profile_sync_install` / `profile_restart` 面向模型注册，变更类走宿主审批；
- **热加载（F12）**：声明 `dsh.hot` 的待重启 bundle 提供「热加载（免重启）」选项（宿主不支持时降级提示）；
- **市场对接（F17）**：下载模块内置市场搜索（与 dshmarket 同源目录：awesome-dsh-plugin.com，离线回退本机 dshmarket 快照）；结果一键带入安装区并自动预览；支持 `github:owner/repo[#path:/sub]` 直装（市场里大部分插件是 GitHub-only，npm registry 查不到）；市场页可通过 `dsh-profile-panel:install-target` 事件或 `#dshpp-install=<target>` 深链把包名直接送进下载模块。

## 安装

```sh
dsh plugin --profile <name> add dsh-profile-panel
# 发布首日可能受 minimumReleaseAge 策略影响而解析旧版，可用显式版本：
dsh plugin --profile <name> add dsh-profile-panel@1.0.0
```

GitHub 直装（未发布 npm 时，`prepare` 会自动构建 lib/ 与 client/）：

```sh
dsh plugin --profile <name> add github:<owner>/dsh-profile-panel
```

本地路径（开发）：

```sh
dsh plugin --profile desktop add ../dsh-profile-panel
```

## 配置（cordis.yml，可选）

```yaml
profile-panel:
  profile: web                  # 显式指定 profile（默认：桌面端取 desktopProfiles，纯 CLI 取 --profile，缺省 web）
  allowRestart: true            # false 时禁用一键重启（systemd/pm2 托管场景）
  pollIntervalMs: 5000          # 变更检测轮询间隔
  minimumReleaseAgeDays: 7      # 供应链版本预览的发布年龄阈值（F1）
```

## HTTP 接口

| 接口 | 方法 | 语义 |
|------|------|------|
| `/api/profile-panel/status` | GET | profile 名/目录、bundle 清单（含来源归因/热加载标记）、pendingRestart、变更明细、重启能力、可安装 profile 列表、桌面端检测与 selection、其他 profile 待重启 |
| `/api/profile-panel/events` | GET | SSE 状态推送（pending / clean / installing / installed / restarting） |
| `/api/profile-panel/poll` | GET | SSE 的长轮询回落通道（`?since=<seq>`） |
| `/api/profile-panel/restart` | POST | 一键重启（同源 + 环回门控；桌面端 202，纯 web 501 + hint） |
| `/api/profile-panel/install` | POST | 多 profile 同步安装 `{ package, spec?, profiles[]?, mode?('single'\|'dual'\|'all'), preview?, rollback?, autoRestart? }`；`package` 亦接受 `github:owner/repo[#path:/sub]`（F17，不可带 spec） |
| `/api/profile-panel/install-preview` | POST | 安装事前版本/发布年龄预警（F1）；GitHub 目标返回来源预览（F17） |
| `/api/profile-panel/market/search` | GET | 市场搜索（dshmarket 同源目录）`?q=<关键词>&limit=<1-20>`（F17） |
| `/api/profile-panel/undo` | POST | 撤销最近变更（恢复 manifest 快照，F2） |
| `/api/profile-panel/updates` | GET | 逐 bundle 更新检测（F3） |
| `/api/profile-panel/update` | POST | 更新指定 bundle（F3） |
| `/api/profile-panel/align` | POST | 多 profile 版本对齐（F3） |
| `/api/profile-panel/health` | GET | 健康检查 + 重启后组合预览（F6） |
| `/api/profile-panel/diff` | GET | 两 profile 并排 diff（`?profiles=a,b`，F7） |
| `/api/profile-panel/boot-report` | GET | 最近一次 boot 激活报告（F9） |
| `/api/profile-panel/audit` | GET | 审计时间线（F10） |
| `/api/profile-panel/hot-reload` | POST | 免重启加载 HMR 能力 bundle（F12） |
| `/api/profile-panel/cancel-restart` | POST | 取消待执行的重启（F13） |

## 开发

```sh
pnpm install
pnpm build        # 宿主端 tsc + 客户端 tsdown
pnpm test         # 宿主单测 + 客户端组件测试
```

## 安全模型（对齐 dshmarket）

- 变更类接口仅接受同源 POST 且来自环回地址，拒绝任何代理转发头；
- 安装仅接受 registry 包名/版本 spec，以及严格形态的 `github:owner/repo[#path:/sub]` 目标；拒绝本地路径、git URL、http 源与命令注入；
- 面板路径展示对 home 前缀缩写；审计日志纯本地、不含对话内容；不上报任何数据。

## 已知边界

- 本插件自身升级后同样出现待重启提示（预期行为）；
- 面板对 profile 选择状态只读，切换 active profile 请用桌面应用托盘菜单；
- 多 profile 安装默认不自动回滚（可勾选 rollback；undo 恢复 manifest 后需 `pnpm install` 重建 node_modules）；
- 桌面端检测为启发式（profile / app-data 命中不代表桌面端正在运行）；`dual` 目标另一端缺失时降级为单端 + warning；
- 热加载为尽力而为：宿主不支持时降级为重启提示；
- `updates` / `install-preview` 依赖 registry 可用性，离线时降级为 warning；
- GitHub 直装跟随仓库 HEAD（无版本号语义），安装后的依赖名以仓库 `package.json` 的 `name` 为准；更新检测对这类依赖跳过 registry 查询；
- 市场搜索在线目录不可达时回退本机 `dshmarket` 快照（可能滞后于在线目录），两者都没有时降级为空结果 + warning；
- 设置外壳为单页导航且未提供跨分区切换 API：市场侧「跳转到下载模块」通过事件/深链预填实现（面板下次打开时自动填入并预览），无法强制宿主切到本分区——如需自动切页，需上游宿主或 dshmarket 配合。
