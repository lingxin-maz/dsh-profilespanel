window.__ModuleLoader__.load({ id: "dsh-profile-panel", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
//#region src/client/locales.ts
/** zh/en dictionaries for the Profile / Plugins settings section. */
const zh = {
	nav: "Profile / 插件",
	subtitle: "当前 profile、插件清单与待重启状态",
	unavailable: "状态不可用",
	unavailableHint: "无法连接宿主状态接口。请确认当前页面由 dsh 宿主提供，或稍后重试。",
	retry: "重试",
	manifestError: "profile 清单不可读",
	manifestErrorHint: "请检查 profile 目录下的 package.json 是否损坏。",
	profileCard: "当前 Profile",
	profileName: "名称",
	profileDir: "目录",
	desktopTag: "桌面应用托管",
	bundleCard: "插件清单",
	loaded: "已加载",
	pending: "待重启",
	noBundles: "该 profile 尚未挂载任何插件 bundle。",
	updatesCard: "更新",
	updatesHint: "对照 registry 检查已装插件版本；可单条更新、全部更新，或跨 profile 对齐同一版本。",
	allUpToDate: "全部已是最新",
	updateAllButton: "全部更新",
	updateButton: "更新",
	alignButton: "对齐全部 profile",
	updating: "更新中…",
	healthCard: "健康检查",
	healthHint: "静态检查 profile 清单与已装插件：缺失包、peer 缺口、孤儿 bundle、层栈重复；并预览重启后的组合。",
	healthOk: "未发现健康问题",
	nextBundlesLabel: "重启后组合（dry-run reconcile）",
	sourceInbox: "内置",
	sourceDependency: "依赖",
	sourcePatch: "patch",
	hotTag: "可热加载",
	compareCard: "Profile 对比",
	compareHint: "并排对比两个 profile 的插件差异，快速发现版本漂移与漏装。",
	compareOnlyInA: "仅 {profile} 有",
	compareOnlyInB: "仅 {profile} 有",
	compareSame: "两个 profile 完全一致",
	bootReportCard: "启动报告",
	bootReportHint: "最近一次 boot 的 bundle 激活结果（loader 投影）；失败的 bundle 会带原因。",
	bootAllActive: "本次启动全部 bundle 均激活",
	bootFailedNoError: "激活失败（无错误详情）",
	bootEntryCount: "共 {total} 个 loader 条目",
	auditCard: "变更记录",
	auditHint: "面板发起的安装 / 更新 / 撤销 / 重启等操作时间线（本地 JSONL，不含对话内容）。",
	auditEmpty: "暂无变更记录",
	restartBanner: "检测到插件变更，需要重启生效",
	restartBannerHint: "新增或更新的插件将在重启后进入运行组合。",
	othersPending: "其他 profile 待重启",
	addedBundles: "新增",
	removedBundles: "移除",
	changedFiles: "变更文件",
	restartButton: "立即重启",
	restarting: "重启中…",
	restartCard: "重启",
	restartAvailableHint: "重启将优雅停止当前进程并重新启动 DSH，使变更生效。",
	restartRequested: "重启已提交，界面即将断开。",
	installCard: "同步安装",
	installHint: "把一个 registry 插件同时装进勾选的多个 profile，逐 profile 回报结果。",
	modeSingle: "单端（仅当前）",
	modeDual: "双端（web + desktop）",
	modeCustom: "自定义勾选",
	desktopDetectedHint: "检测到桌面端 GUI——可选择双端模式一次装齐 web 与 desktop。",
	dualUnavailable: "桌面端 profile 不可用（未创建或不支持 Web），双端已降级为仅当前。",
	previewCheck: "安装前检查供应链版本策略（发布年龄）",
	rollbackCheck: "部分 profile 失败时自动回滚已成功的 profile",
	autoRestartCheck: "安装后自动重启（仅当前 profile 且允许重启时生效）",
	autoRestartScheduled: "安装成功，自动重启倒计时",
	cancelRestart: "取消重启",
	autoRestartSkipped: "自动重启已跳过（仅当前 profile 且重启可用时生效）",
	autoRestartUnavailable: "本主机重启不可用，勾选不会生效",
	autoRestartSingleOnly: "自动重启仅在「单端（仅当前）」模式生效；目标包含多个 profile 时会被跳过",
	hotReloadButton: "热加载（免重启）",
	hotReloading: "热加载中…",
	hotReloadFailed: "热加载失败",
	desktopNextBoot: "下次桌面启动",
	desktopLastKnownGood: "回退",
	previewButton: "版本预览",
	undoButton: "撤销最近变更",
	undoing: "撤销中…",
	rolledBack: "已自动回滚: {profiles}",
	previewLatest: "latest",
	previewAgeDays: "发布天数",
	previewSuggestedPin: "建议 pin",
	undoDone: "已恢复快照",
	packageLabel: "包名",
	packagePlaceholder: "例如 dshmarket",
	versionLabel: "版本（可选）",
	versionPlaceholder: "例如 1.5.1（留空由 pnpm 解析）",
	profilesLabel: "目标 Profile",
	currentBadge: "当前",
	installButton: "安装",
	installing: "安装中…",
	installDone: "安装完成",
	installPartial: "部分 profile 安装失败",
	failed: "失败",
	resolvedAs: "解析为",
	downgradedNote: "策略降级：请求 {requested} 实际 {resolved}",
	retryProfile: "重试",
	noProfiles: "没有可安装的目标 profile。",
	installedAs: "安装为",
	marketSearchLabel: "市场搜索（与 dshmarket 同源目录）",
	marketSearchPlaceholder: "输入插件名或关键词，例如 tts",
	marketFill: "带入安装区",
	marketNpmBadge: "npm",
	marketGitBadge: "GitHub",
	marketSource: "目录来源",
	marketLive: "在线",
	marketCache: "缓存",
	marketSnapshot: "本地快照",
	marketError: "市场搜索失败",
	githubTargetHint: "GitHub 目标跟随仓库 HEAD 安装，版本栏不适用。"
};
const en = {
	nav: "Profile / Plugins",
	subtitle: "Current profile, plugin bundles, and pending-restart state",
	unavailable: "Status unavailable",
	unavailableHint: "Cannot reach the host status endpoint. Make sure this page is served by a dsh host, or retry shortly.",
	retry: "Retry",
	manifestError: "Profile manifest unreadable",
	manifestErrorHint: "Check that package.json inside the profile directory is not corrupted.",
	profileCard: "Current Profile",
	profileName: "Name",
	profileDir: "Directory",
	desktopTag: "Managed by the desktop app",
	bundleCard: "Plugin Bundles",
	loaded: "Loaded",
	pending: "Pending restart",
	noBundles: "This profile has no plugin bundles mounted.",
	updatesCard: "Updates",
	updatesHint: "Check installed plugin versions against the registry; update one, update all, or align several profiles to the same version.",
	allUpToDate: "Everything is up to date",
	updateAllButton: "Update all",
	updateButton: "Update",
	alignButton: "Align all profiles",
	updating: "Updating…",
	healthCard: "Health",
	healthHint: "Static scan of the profile manifest and installed plugins: missing packages, peer gaps, orphan bundles, duplicate layers; previews the next boot composition.",
	healthOk: "No health issues found",
	nextBundlesLabel: "Next boot composition (dry-run reconcile)",
	sourceInbox: "in-box",
	sourceDependency: "dependency",
	sourcePatch: "patch",
	hotTag: "hot",
	compareCard: "Profile Compare",
	compareHint: "Compare plugins across two profiles side by side to spot version drift and missing installs.",
	compareOnlyInA: "Only in {profile}",
	compareOnlyInB: "Only in {profile}",
	compareSame: "The two profiles are identical",
	bootReportCard: "Boot Report",
	bootReportHint: "Bundle activation results of the latest boot (loader projection); failures carry their reason.",
	bootAllActive: "Every bundle activated in this boot",
	bootFailedNoError: "activation failed (no error detail)",
	bootEntryCount: "{total} loader entries",
	auditCard: "Change Log",
	auditHint: "Timeline of panel-driven install / update / undo / restart operations (local JSONL, no conversation content).",
	auditEmpty: "No recorded changes yet",
	restartBanner: "Plugin changes detected — restart required",
	restartBannerHint: "New or updated plugins join the running composition after a restart.",
	othersPending: "Other profiles need a restart",
	addedBundles: "Added",
	removedBundles: "Removed",
	changedFiles: "Changed files",
	restartButton: "Restart now",
	restarting: "Restarting…",
	restartCard: "Restart",
	restartAvailableHint: "Restarting gracefully stops this process and relaunches DSH so changes take effect.",
	restartRequested: "Restart submitted — the UI will disconnect shortly.",
	installCard: "Sync Install",
	installHint: "Install one registry plugin into several selected profiles at once, with per-profile results.",
	modeSingle: "Single (current only)",
	modeDual: "Dual (web + desktop)",
	modeCustom: "Custom",
	desktopDetectedHint: "Desktop GUI detected — dual mode installs into web and desktop at once.",
	dualUnavailable: "Desktop profile unavailable (not created or not web-capable); dual degraded to current only.",
	previewCheck: "Check the supply-chain version policy (release age) before installing",
	rollbackCheck: "Auto-rollback succeeded profiles when some fail",
	autoRestartCheck: "Auto-restart after install (current profile only, restart must be available)",
	autoRestartScheduled: "Installed — auto-restarting in",
	cancelRestart: "Cancel restart",
	autoRestartSkipped: "Auto-restart skipped (current profile only, restart must be available)",
	autoRestartUnavailable: "Restart is unavailable on this host — checking this has no effect",
	autoRestartSingleOnly: "Auto-restart applies in single (current-only) mode only; multi-profile targets are skipped",
	hotReloadButton: "Hot reload (no restart)",
	hotReloading: "Hot reloading…",
	hotReloadFailed: "Hot reload failed",
	desktopNextBoot: "Next desktop boot",
	desktopLastKnownGood: "fallback",
	previewButton: "Preview",
	undoButton: "Undo last change",
	undoing: "Undoing…",
	rolledBack: "Auto-rolled back: {profiles}",
	previewLatest: "latest",
	previewAgeDays: "days since release",
	previewSuggestedPin: "suggested pin",
	undoDone: "snapshot restored",
	packageLabel: "Package",
	packagePlaceholder: "e.g. dshmarket",
	versionLabel: "Version (optional)",
	versionPlaceholder: "e.g. 1.5.1 (empty = pnpm resolves)",
	profilesLabel: "Target profiles",
	currentBadge: "current",
	installButton: "Install",
	installing: "Installing…",
	installDone: "Install finished",
	installPartial: "Some profiles failed to install",
	failed: "failed",
	resolvedAs: "resolved to",
	downgradedNote: "Policy downgrade: requested {requested}, resolved {resolved}",
	retryProfile: "Retry",
	noProfiles: "No installable target profiles.",
	installedAs: "installed as",
	marketSearchLabel: "Market search (same catalog as dshmarket)",
	marketSearchPlaceholder: "Plugin name or keyword, e.g. tts",
	marketFill: "Fill install",
	marketNpmBadge: "npm",
	marketGitBadge: "GitHub",
	marketSource: "Catalog source",
	marketLive: "live",
	marketCache: "cache",
	marketSnapshot: "local snapshot",
	marketError: "Market search failed",
	githubTargetHint: "GitHub targets install the repo HEAD — the version field does not apply."
};
//#endregion
//#region src/client/status-data.ts
/**
* The dual-install pair for the current end (mirror of the host's
* `dualOtherEnd`): `web` pairs with the desktop end, `desktop` pairs with
* `web`, and any other name pairs with the desktop end.
*/
function dualPair(currentName, desktopProfile) {
	if (currentName === "web") return desktopProfile !== void 0 && desktopProfile !== currentName ? [currentName, desktopProfile] : [currentName];
	if (currentName === "desktop") return ["desktop", "web"];
	return desktopProfile !== void 0 && desktopProfile !== currentName ? [currentName, desktopProfile] : [currentName];
}
/**
* Coerce any wire value to a safe array. Host payloads may drift (the
* client-side card code must never throw on a non-array field), so every
* payload list renders through this helper.
*/
function asArray(value) {
	return Array.isArray(value) ? value : [];
}
/**
* Abbreviate an absolute path for display: the home directory plus the
* `profiles` segment collapses to `~/<home>/profiles/...` (the panel never
* leaks more than it must).
*/
function abbreviatePath(dir) {
	const separator = dir.includes("\\") ? "\\" : "/";
	const parts = dir.split(/[\\/]/);
	const index = parts.indexOf("profiles");
	if (index <= 0) return dir;
	return `~${separator}${parts.slice(Math.max(0, index - 1)).join(separator)}`;
}
/** Short change summary for the pending-restart banner. */
function summarizeChanges(changes, t) {
	const parts = [];
	if (changes.addedBundles.length > 0) parts.push(t("addedBundles") + ": " + changes.addedBundles.join(", "));
	if (changes.removedBundles.length > 0) parts.push(t("removedBundles") + ": " + changes.removedBundles.join(", "));
	if (changes.changedFiles.length > 0) parts.push(t("changedFiles") + ": " + changes.changedFiles.join(", "));
	return parts.length > 0 ? parts.join(" · ") : t("restartBanner");
}
/** Read the status endpoint; throws on transport failure or bad payload. */
async function fetchStatus() {
	const response = await fetch("/api/profile-panel/status", { cache: "no-store" });
	if (!response.ok) throw new Error(`status request failed: ${response.status}`);
	return await response.json();
}
/** POST the one-click restart. */
async function postRestart() {
	const response = await fetch("/api/profile-panel/restart", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "{}"
	});
	let payload = null;
	try {
		payload = await response.json();
	} catch {}
	return {
		ok: response.ok,
		status: response.status,
		payload
	};
}
/** POST a sync install into the given profiles (or a resolved mode). */
async function postInstall(body) {
	const response = await fetch("/api/profile-panel/install", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `install request failed: ${response.status}`);
	}
	return await response.json();
}
/** POST the install-preview assistant (F1). */
async function postInstallPreview(body) {
	const response = await fetch("/api/profile-panel/install-preview", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `preview request failed: ${response.status}`);
	}
	return await response.json();
}
/** F17: search the market registry backing dshmarket. */
async function fetchMarketSearch(q, limit = 8) {
	const response = await fetch(`/api/profile-panel/market/search?q=${encodeURIComponent(q)}&limit=${limit}`, { cache: "no-store" });
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `market search failed: ${response.status}`);
	}
	return await response.json();
}
/** POST an undo (F2) restoring the newest manifest snapshot per profile. */
async function postUndo(body) {
	const response = await fetch("/api/profile-panel/undo", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `undo request failed: ${response.status}`);
	}
	return await response.json();
}
/** F3: read the per-bundle update feed. */
async function fetchUpdates() {
	const response = await fetch("/api/profile-panel/updates", { cache: "no-store" });
	if (!response.ok) throw new Error(`updates request failed: ${response.status}`);
	return await response.json();
}
/** F3: POST an update (an install with an explicit version). */
async function postUpdate(body) {
	const response = await fetch("/api/profile-panel/update", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `update request failed: ${response.status}`);
	}
	return await response.json();
}
/** F3: POST an align (same version across profiles). */
async function postAlign(body) {
	const response = await fetch("/api/profile-panel/align", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `align request failed: ${response.status}`);
	}
	return await response.json();
}
/** F6: read the profile health payload. */
async function fetchHealth() {
	const response = await fetch("/api/profile-panel/health", { cache: "no-store" });
	if (!response.ok) throw new Error(`health request failed: ${response.status}`);
	return await response.json();
}
/** F7: diff two profiles. */
async function fetchDiff(profiles) {
	const response = await fetch(`/api/profile-panel/diff?profiles=${encodeURIComponent(profiles[0])},${encodeURIComponent(profiles[1])}`, { cache: "no-store" });
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `diff request failed: ${response.status}`);
	}
	return await response.json();
}
/** F10: read the audit timeline. */
async function fetchAudit(limit = 50) {
	const response = await fetch(`/api/profile-panel/audit?limit=${limit}`, { cache: "no-store" });
	if (!response.ok) throw new Error(`audit request failed: ${response.status}`);
	return await response.json();
}
/** F9: read the latest boot report. */
async function fetchBootReport() {
	const response = await fetch("/api/profile-panel/boot-report", { cache: "no-store" });
	if (!response.ok) throw new Error(`boot-report request failed: ${response.status}`);
	return await response.json();
}
/** F12: hot-reload a pending, HMR-capable bundle. */
async function postHotReload(body) {
	const response = await fetch("/api/profile-panel/hot-reload", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		let detail = "";
		try {
			detail = (await response.json()).error ?? "";
		} catch {}
		throw new Error(detail || `hot-reload request failed: ${response.status}`);
	}
	return await response.json();
}
/** F13: cancel a scheduled auto-restart. */
async function postCancelRestart(cancelToken) {
	const response = await fetch("/api/profile-panel/cancel-restart", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ cancelToken })
	});
	if (!response.ok) throw new Error(`cancel-restart request failed: ${response.status}`);
	return await response.json();
}
//#endregion
//#region src/client/use-status.ts
/**
* Status hook (F4): SSE-first with a polling fallback. The event stream
* delivers named panel events; any of them triggers a fresh /status read so
* the UI always renders the authoritative snapshot. When EventSource is
* missing (jsdom) or the stream keeps failing (≥2 errors), the hook falls
* back to plain interval polling of /status.
*/
const SSE_EVENT_TYPES = [
	"pending",
	"clean",
	"installing",
	"installed",
	"restarting",
	"updates"
];
function usePanelStatus(intervalMs = 2e3) {
	const [status, setStatus] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(false);
	const tick = (0, react.useRef)(0);
	const load = (0, react.useCallback)(async () => {
		const mine = ++tick.current;
		try {
			const next = await fetchStatus();
			if (mine === tick.current) {
				setStatus(next);
				setError(false);
			}
		} catch {
			if (mine === tick.current) setError(true);
		}
	}, []);
	(0, react.useEffect)(() => {
		load();
		let source = null;
		let streamErrors = 0;
		let poll;
		const startPolling = () => {
			if (poll !== void 0) return;
			poll = setInterval(() => {
				load();
			}, intervalMs);
		};
		if (typeof EventSource === "undefined") startPolling();
		else try {
			source = new EventSource("/api/profile-panel/events");
			const refresh = () => {
				load();
			};
			source.onmessage = refresh;
			for (const type of SSE_EVENT_TYPES) source.addEventListener(type, refresh);
			source.onerror = () => {
				streamErrors += 1;
				if (streamErrors >= 2 && source !== null) {
					source.close();
					source = null;
					startPolling();
				}
			};
		} catch {
			startPolling();
		}
		return () => {
			tick.current += 1;
			source?.close();
			if (poll !== void 0) clearInterval(poll);
		};
	}, [load, intervalMs]);
	return {
		status,
		error,
		refresh: () => void load()
	};
}
//#endregion
//#region src/client/styles.ts
/**
* Panel stylesheet. Uses only the public DSH design tokens
* (--dsw-alias-*) so the panel follows the active theme like every official
* settings section. Injected once as a <style> tag by the Panel component.
*/
const panelCss = `
.dshpp-root { display: flex; flex-direction: column; gap: 16px; }

.dshpp-banner {
  display: flex; flex-direction: column; gap: 6px;
  border: 1px solid var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);
  border-radius: 12px; padding: 12px 14px;
}
.dshpp-bannerTitle { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; line-height: 20px; }
.dshpp-bannerDetail { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.dshpp-bannerAction { display: flex; align-items: center; gap: 8px; margin-top: 4px; }

.dshpp-card {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  border-radius: 12px; overflow: hidden;
}
.dshpp-cardHeader {
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  padding: 10px 14px;
  color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 500; line-height: 18px;
}
.dshpp-cardBody { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }

.dshpp-row { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.dshpp-label { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; flex: none; }
.dshpp-value { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; min-width: 0; overflow-wrap: anywhere; }
.dshpp-mono {
  font-family: var(--ds-font-family-code, ui-monospace, "SF Mono", Menlo, Consolas, "Courier New");
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-markdown-code-block, transparent);
  border-radius: 6px; padding: 2px 6px; overflow-wrap: anywhere;
}
.dshpp-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dshpp-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.dshpp-ok { color: var(--dsw-alias-state-success-primary); }
.dshpp-warn { color: var(--dsw-alias-state-warn-label); }
.dshpp-muted { color: var(--dsw-alias-label-caption); }

.dshpp-bundleRow { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.dshpp-bundleName { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; min-width: 0; overflow-wrap: anywhere; flex: 1; }
.dshpp-bundleState { display: inline-flex; align-items: center; gap: 5px; flex: none; font-size: 12px; line-height: 18px; }
.dshpp-bundleState[data-state='pending'] { color: var(--dsw-alias-state-warn-label); }
.dshpp-bundleState[data-state='loaded'] { color: var(--dsw-alias-state-success-primary); }

.dshpp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.dshpp-field { display: flex; flex-direction: column; gap: 4px; }
.dshpp-fieldLabel { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dshpp-input {
  box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base); height: 30px; min-width: 0;
  color: var(--dsw-alias-label-primary); border-radius: 6px; outline: none;
  padding: 0 8px; font-size: 13px; line-height: 20px; width: 100%;
}
.dshpp-input:focus { border-color: var(--dsw-alias-state-business-primary); }
.dshpp-input::placeholder { color: var(--dsw-alias-label-caption); }

.dshpp-profileList { display: flex; flex-direction: column; gap: 2px; }
.dshpp-profileRow {
  display: flex; align-items: center; gap: 8px; min-height: 28px;
  border-radius: 6px; padding: 2px 6px; cursor: pointer;
}
.dshpp-profileRow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshpp-profileName { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }
.dshpp-currentTag {
  flex: none; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 999px;
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
}

.dshpp-resultRow {
  display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px 10px;
}
.dshpp-resultProfile { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 500; line-height: 18px; flex: none; }
.dshpp-resultDetail { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.dshpp-checkbox {
  width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-state-business-primary);
  flex: none;
}

.dshpp-modeRow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dshpp-mode {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
  font-size: 12px; line-height: 18px; padding: 3px 10px; cursor: pointer;
}
.dshpp-mode:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshpp-mode:disabled { opacity: 0.45; cursor: not-allowed; }
.dshpp-modeActive {
  border-color: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
}

.dshpp-checkRow { display: flex; align-items: center; gap: 8px; min-height: 24px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dshpp-preview {
  display: flex; flex-direction: column; gap: 4px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px 10px;
  font-size: 12px; line-height: 18px; overflow-wrap: anywhere;
}

/* F17: market search results inside the install section. */
.dshpp-marketList { display: flex; flex-direction: column; gap: 6px; }
.dshpp-marketRow {
  display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 10px;
}
.dshpp-marketName { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; min-width: 0; overflow-wrap: anywhere; }
.dshpp-marketBadge {
  flex: none; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-module-platform, rgba(127, 127, 127, 0.14));
}
.dshpp-marketBadge[data-kind='npm'] { color: var(--dsw-alias-state-business-primary); }
.dshpp-marketStars { flex: none; color: var(--dsw-alias-state-warn-label); font-size: 12px; line-height: 20px; }
.dshpp-marketDesc {
  flex-basis: 100%; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px;
  overflow-wrap: anywhere;
}
.dshpp-input:disabled { opacity: 0.55; }
`;
//#endregion
//#region src/client/market-bridge.ts
const PACKAGE_RE = /^(@[A-Za-z0-9-~][A-Za-z0-9._~-]*\/)?[A-Za-z0-9-~][A-Za-z0-9._~-]*$/;
const GITHUB_RE = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#path:\/([A-Za-z0-9_./-]+))?$/;
const SPEC_RE = /^[A-Za-z0-9~^<>=*+-][A-Za-z0-9._~^<>=*+-]*$/;
/** Validate the shape of a pushed install target; null when malformed. */
function normalizeTarget(payload) {
	if (payload === null || typeof payload !== "object") return null;
	const candidate = payload;
	if (typeof candidate.package !== "string") return null;
	const pkg = candidate.package.trim();
	if (pkg === "") return null;
	const github = GITHUB_RE.exec(pkg);
	if (github === null && !PACKAGE_RE.test(pkg)) return null;
	if (github !== null && github[2] !== void 0 && github[2].split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
	let spec;
	if (candidate.spec !== void 0 && candidate.spec !== null && candidate.spec !== "") {
		if (typeof candidate.spec !== "string" || !SPEC_RE.test(candidate.spec) || github !== null) return null;
		spec = candidate.spec;
	}
	return {
		package: pkg,
		...spec !== void 0 ? { spec } : {}
	};
}
/** Parse the `#dshpp-install=<target>` deep link out of a location hash. */
function readHashTarget(hash) {
	if (!hash.startsWith("#dshpp-install=")) return null;
	let decoded;
	try {
		decoded = decodeURIComponent(hash.slice(15));
	} catch {
		return null;
	}
	const at = decoded.lastIndexOf("@");
	if (at > 0) {
		const pkg = decoded.slice(0, at);
		const spec = decoded.slice(at + 1);
		if (spec !== "") return normalizeTarget({
			package: pkg,
			spec
		});
	}
	return normalizeTarget({ package: decoded });
}
let parked = null;
/** Park a target for the InstallSection (module scope, survives unmounts). */
function parkInstallTarget(payload) {
	parked = payload;
}
/** The pending target if one is parked; consumes it (single-shot). */
function consumePendingTarget() {
	const target = parked;
	parked = null;
	return target;
}
const INSTALL_TARGET_EVENT = "dsh-profile-panel:install-target";
/**
* Wire the receive side: window event listener + the initial hash deep
* link. Returns a disposer removing the listener.
*/
function installMarketBridge() {
	const onEvent = (event) => {
		const payload = normalizeTarget(event.detail);
		if (payload !== null) parkInstallTarget(payload);
	};
	window.addEventListener(INSTALL_TARGET_EVENT, onEvent);
	const fromHash = readHashTarget(window.location.hash);
	if (fromHash !== null) parkInstallTarget(fromHash);
	return () => {
		window.removeEventListener(INSTALL_TARGET_EVENT, onEvent);
	};
}
//#endregion
//#region src/client/panel.tsx
/**
* The settings-page panel: profile facts, bundle list with loaded/pending
* badges, the pending-restart banner with one-click restart, and the
* multi-profile sync-install section. Styled exclusively with DSH design
* tokens + the official UI primitives so it follows the active theme.
*/
/** F8: locale key per bundle source. */
const SOURCE_KEYS = {
	inbox: "sourceInbox",
	dependency: "sourceDependency",
	patch: "sourcePatch"
};
const STYLE_ID = "dsh-profile-panel-styles";
function installStyles() {
	if (document.getElementById(STYLE_ID) !== null) return;
	const tag = document.createElement("style");
	tag.id = STYLE_ID;
	tag.textContent = panelCss;
	document.head.appendChild(tag);
}
function interpolate(text, values) {
	let out = text;
	for (const [key, value] of Object.entries(values)) out = out.replace(`{${key}}`, String(value));
	return out;
}
/**
* Per-card error boundary: a single card's render failure (e.g. a drifted
* host payload) degrades to one inline error card instead of unmounting the
* whole settings section.
*/
var CardBoundary = class extends react.Component {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		if (this.state.failed) return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-error" }, "card render failed")));
		return this.props.children;
	}
};
function ProfileCard(props) {
	const { status, t } = props;
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("profileCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-row" }, (0, react.createElement)("span", { className: "dshpp-label" }, t("profileName")), (0, react.createElement)("span", { className: "dshpp-value" }, status.profileName)), (0, react.createElement)("div", { className: "dshpp-row" }, (0, react.createElement)("span", { className: "dshpp-label" }, t("profileDir")), (0, react.createElement)("span", { className: "dshpp-mono" }, abbreviatePath(status.profileDir))), status.manifestError !== void 0 ? (0, react.createElement)(react.Fragment, {}, (0, react.createElement)("div", { className: "dshpp-error" }, t("manifestError")), (0, react.createElement)("div", { className: "dshpp-hint" }, t("manifestErrorHint"))) : null, status.desktopSelection !== void 0 ? (0, react.createElement)("div", { className: "dshpp-row" }, (0, react.createElement)("span", { className: "dshpp-label" }, t("desktopNextBoot")), (0, react.createElement)("span", { className: status.desktopSelection.active !== void 0 && status.desktopSelection.active !== status.profileName ? "dshpp-value dshpp-warn" : "dshpp-value" }, `${status.desktopSelection.active ?? "?"}` + (status.desktopSelection.lastKnownGood !== void 0 ? `（${t("desktopLastKnownGood")}: ${status.desktopSelection.lastKnownGood}）` : ""))) : null));
}
function BundleCard(props) {
	const { status, t } = props;
	const [hotBusy, setHotBusy] = (0, react.useState)(null);
	const [hotError, setHotError] = (0, react.useState)(null);
	const hotReload = async (bundle) => {
		setHotBusy(bundle);
		setHotError(null);
		try {
			await postHotReload({ bundle });
		} catch (cause) {
			setHotError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setHotBusy(null);
		}
	};
	const bundles = asArray(status.bundles);
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("bundleCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, bundles.length === 0 ? (0, react.createElement)("div", { className: "dshpp-hint" }, t("noBundles")) : bundles.map((bundle) => (0, react.createElement)("div", {
		key: bundle.name,
		className: "dshpp-bundleRow"
	}, (0, react.createElement)("span", { className: "dshpp-bundleName" }, bundle.name), bundle.source !== void 0 ? (0, react.createElement)("span", { className: "dshpp-currentTag" }, t(SOURCE_KEYS[bundle.source])) : null, bundle.hotReloadable === true ? (0, react.createElement)("span", { className: "dshpp-currentTag" }, t("hotTag")) : null, (0, react.createElement)("span", {
		className: "dshpp-bundleState",
		"data-state": bundle.state
	}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
		state: bundle.state === "pending" ? "warning" : "done",
		size: 8
	}), bundle.state === "pending" ? t("pending") : t("loaded")), bundle.state === "pending" && bundle.hotReloadable === true ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: hotBusy !== null,
		onClick: () => void hotReload(bundle.name)
	}, hotBusy === bundle.name ? t("hotReloading") : t("hotReloadButton")) : null)), hotError !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, `${t("hotReloadFailed")}: ${hotError}`) : null));
}
function RestartCard(props) {
	const { status, t, busy, message, onRestart } = props;
	const { restart } = status;
	const label = restart.restarting || busy ? t("restarting") : t("restartButton");
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("restartCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, restart.available ? (0, react.createElement)(react.Fragment, {}, (0, react.createElement)("div", { className: "dshpp-hint" }, t("restartAvailableHint")), (0, react.createElement)("div", { className: "dshpp-actions" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "primary",
		size: "sm",
		disabled: restart.restarting || busy,
		onClick: onRestart
	}, label)), message !== null ? (0, react.createElement)("div", { className: "dshpp-warn" }, message) : null) : (0, react.createElement)("div", { className: "dshpp-hint" }, restart.hint || t("unavailableHint"))));
}
function InstallSection(props) {
	const { status, t, onInstalled } = props;
	const profileRows = asArray(status.profiles);
	const [pkg, setPkg] = (0, react.useState)("");
	const [spec, setSpec] = (0, react.useState)("");
	const [selected, setSelected] = (0, react.useState)(/* @__PURE__ */ new Set());
	const [mode, setMode] = (0, react.useState)("single");
	const [modeInitialized, setModeInitialized] = (0, react.useState)(false);
	const [previewChecked, setPreviewChecked] = (0, react.useState)(false);
	const [rollbackChecked, setRollbackChecked] = (0, react.useState)(false);
	const [autoRestartChecked, setAutoRestartChecked] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const [results, setResults] = (0, react.useState)(null);
	const [preview, setPreview] = (0, react.useState)(null);
	const [undoResult, setUndoResult] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [autoRestart, setAutoRestart] = (0, react.useState)(null);
	const [countdown, setCountdown] = (0, react.useState)(0);
	const [marketQ, setMarketQ] = (0, react.useState)("");
	const [marketHits, setMarketHits] = (0, react.useState)([]);
	const [marketMeta, setMarketMeta] = (0, react.useState)(null);
	const [marketBusy, setMarketBusy] = (0, react.useState)(false);
	const [marketError, setMarketError] = (0, react.useState)(null);
	const desktopDetected = status.desktop.detected;
	const currentName = profileRows.find((profile) => profile.current)?.name;
	const otherEnd = status.desktop.profile;
	const dualTargets = (0, react.useMemo)(() => currentName !== void 0 ? dualPair(currentName, otherEnd) : [], [currentName, otherEnd]);
	const dualUsable = desktopDetected && dualTargets.length > 1 && dualTargets.every((name) => profileRows.some((profile) => profile.name === name));
	const restartUsable = status.restart.available && !status.restart.restarting;
	const multiTarget = mode === "dual" ? dualTargets.length > 1 : mode === "custom" ? selected.size > 1 : false;
	(0, react.useEffect)(() => {
		if (modeInitialized || currentName === void 0) return;
		setMode(dualUsable ? "dual" : "single");
		setModeInitialized(true);
	}, [
		dualUsable,
		currentName,
		modeInitialized
	]);
	(0, react.useEffect)(() => {
		if (currentName === void 0) return;
		setSelected((prev) => {
			const next = new Set(prev);
			if (mode === "single") {
				next.clear();
				next.add(currentName);
			} else if (mode === "dual") {
				next.clear();
				for (const name of dualTargets) if (status.profiles.some((profile) => profile.name === name)) next.add(name);
			}
			return next;
		});
	}, [
		mode,
		currentName,
		otherEnd,
		dualTargets,
		status.profiles
	]);
	const toggle = (name) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
		setMode("custom");
	};
	(0, react.useEffect)(() => {
		if (autoRestart === null) return;
		const timer = setInterval(() => {
			setCountdown((previous) => {
				if (previous <= 1) {
					clearInterval(timer);
					return 0;
				}
				return previous - 1;
			});
		}, 1e3);
		return () => clearInterval(timer);
	}, [autoRestart]);
	(0, react.useEffect)(() => {
		const q = marketQ.trim();
		if (q === "") {
			setMarketHits([]);
			setMarketMeta(null);
			setMarketBusy(false);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			setMarketBusy(true);
			setMarketError(null);
			fetchMarketSearch(q).then((payload) => {
				if (cancelled) return;
				setMarketHits(asArray(payload.results));
				setMarketMeta({
					source: payload.source,
					updated: payload.updated,
					...payload.warning !== void 0 ? { warning: payload.warning } : {}
				});
			}).catch((cause) => {
				if (cancelled) return;
				setMarketError(cause instanceof Error ? cause.message : String(cause));
			}).finally(() => {
				if (!cancelled) setMarketBusy(false);
			});
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [marketQ]);
	(0, react.useEffect)(() => {
		const parked = consumePendingTarget();
		if (parked === null) return;
		setPkg(parked.package);
		if (parked.spec !== void 0) setSpec(parked.spec);
		setError(null);
		runPreviewFor(parked.package, parked.spec);
	}, []);
	const runInstall = async (body) => {
		setBusy(true);
		setError(null);
		try {
			const response = await postInstall({
				package: pkg,
				...spec.trim() !== "" ? { spec: spec.trim() } : {},
				...body
			});
			setResults(response);
			if (response.autoRestart?.scheduled === true) {
				setAutoRestart({
					cancelToken: response.autoRestart.cancelToken,
					inMs: response.autoRestart.inMs
				});
				setCountdown(Math.max(1, Math.ceil(response.autoRestart.inMs / 1e3)));
			}
			onInstalled();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	const cancelAutoRestart = async () => {
		if (autoRestart === null) return;
		try {
			await postCancelRestart(autoRestart.cancelToken);
			setAutoRestart(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};
	const submit = () => {
		if (pkg.trim() === "") return;
		runInstall({
			...mode === "custom" ? { profiles: [...selected] } : { mode },
			...previewChecked ? { preview: true } : {},
			...rollbackChecked ? { rollback: true } : {},
			...autoRestartChecked ? { autoRestart: true } : {}
		});
	};
	const retryProfile = (name) => {
		runInstall({
			profiles: [name],
			...rollbackChecked ? { rollback: true } : {}
		});
	};
	const runPreviewFor = async (pkgName, specName) => {
		if (pkgName.trim() === "") return;
		setBusy(true);
		setError(null);
		try {
			setPreview(await postInstallPreview({
				package: pkgName.trim(),
				...specName !== void 0 && specName.trim() !== "" ? { spec: specName.trim() } : {}
			}));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	const runPreview = () => {
		runPreviewFor(pkg, spec);
	};
	const fillFromMarket = (hit) => {
		setPkg(hit.installTarget);
		setSpec("");
		setPreview(null);
		setResults(null);
		setError(null);
		runPreviewFor(hit.installTarget, void 0);
	};
	const runUndo = async () => {
		if (currentName === void 0) return;
		const targets = mode === "custom" ? [...selected] : mode === "dual" && otherEnd !== void 0 ? [currentName, otherEnd] : [currentName];
		if (targets.length === 0) return;
		setBusy(true);
		setError(null);
		try {
			setUndoResult(await postUndo({ profiles: targets }));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	const changed = (0, react.useMemo)(() => results !== null && results.overallOk ? t("installDone") : results !== null ? t("installPartial") : null, [results, t]);
	const githubTarget = pkg.trim().startsWith("github:");
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("installCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-hint" }, t("installHint")), desktopDetected ? (0, react.createElement)(react.Fragment, {}, (0, react.createElement)("div", { className: "dshpp-modeRow" }, (0, react.createElement)("button", {
		type: "button",
		className: `dshpp-mode${mode === "single" ? " dshpp-modeActive" : ""}`,
		onClick: () => setMode("single")
	}, t("modeSingle")), (0, react.createElement)("button", {
		type: "button",
		className: `dshpp-mode${mode === "dual" ? " dshpp-modeActive" : ""}`,
		disabled: !dualUsable,
		onClick: () => setMode("dual")
	}, t("modeDual")), (0, react.createElement)("button", {
		type: "button",
		className: `dshpp-mode${mode === "custom" ? " dshpp-modeActive" : ""}`,
		onClick: () => setMode("custom")
	}, t("modeCustom"))), (0, react.createElement)("div", { className: "dshpp-hint" }, t("desktopDetectedHint")), !dualUsable ? (0, react.createElement)("div", { className: "dshpp-warn" }, t("dualUnavailable")) : null) : null, (0, react.createElement)("div", { className: "dshpp-field" }, (0, react.createElement)("label", { className: "dshpp-fieldLabel" }, t("packageLabel")), (0, react.createElement)("input", {
		className: "dshpp-input",
		placeholder: t("packagePlaceholder"),
		value: pkg,
		onChange: (event) => setPkg(event.target.value),
		spellCheck: false
	})), (0, react.createElement)("div", { className: "dshpp-field" }, (0, react.createElement)("label", { className: "dshpp-fieldLabel" }, t("versionLabel")), (0, react.createElement)("input", {
		className: "dshpp-input",
		placeholder: githubTarget ? t("githubTargetHint") : t("versionPlaceholder"),
		value: spec,
		disabled: githubTarget,
		onChange: (event) => setSpec(event.target.value),
		spellCheck: false
	})), (0, react.createElement)("div", { className: "dshpp-field" }, (0, react.createElement)("label", { className: "dshpp-fieldLabel" }, t("marketSearchLabel")), (0, react.createElement)("input", {
		className: "dshpp-input",
		placeholder: t("marketSearchPlaceholder"),
		value: marketQ,
		onChange: (event) => setMarketQ(event.target.value),
		spellCheck: false
	}), marketMeta !== null ? (0, react.createElement)("div", { className: "dshpp-hint" }, `${t("marketSource")}: ${t(marketMeta.source === "live" ? "marketLive" : marketMeta.source === "cache" ? "marketCache" : "marketSnapshot")}` + (marketMeta.updated !== null ? ` · ${marketMeta.updated.slice(0, 10)}` : "") + (marketMeta.warning !== void 0 ? ` — ${marketMeta.warning}` : "")) : null, marketError !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, `${t("marketError")}: ${marketError}`) : null, marketBusy && marketQ.trim() !== "" && marketHits.length === 0 ? (0, react.createElement)("div", { className: "dshpp-hint" }, "…") : null, marketHits.length > 0 ? (0, react.createElement)("div", { className: "dshpp-marketList" }, marketHits.map((hit) => (0, react.createElement)("div", {
		key: `${hit.name}${hit.installTarget}`,
		className: "dshpp-marketRow"
	}, (0, react.createElement)("span", { className: "dshpp-marketName" }, hit.name), (0, react.createElement)("span", {
		className: "dshpp-marketBadge",
		"data-kind": hit.kind
	}, hit.kind === "npm" ? t("marketNpmBadge") : t("marketGitBadge")), hit.stars !== null && hit.stars > 0 ? (0, react.createElement)("span", { className: "dshpp-marketStars" }, `★ ${hit.stars}`) : null, hit.description !== null ? (0, react.createElement)("div", { className: "dshpp-marketDesc" }, hit.description) : null, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: busy,
		onClick: () => fillFromMarket(hit)
	}, t("marketFill"))))) : null), (0, react.createElement)("div", { className: "dshpp-field" }, (0, react.createElement)("span", { className: "dshpp-fieldLabel" }, t("profilesLabel")), profileRows.length === 0 ? (0, react.createElement)("div", { className: "dshpp-hint" }, t("noProfiles")) : (0, react.createElement)("div", { className: "dshpp-profileList" }, profileRows.map((profile) => (0, react.createElement)("label", {
		key: profile.name,
		className: "dshpp-profileRow"
	}, (0, react.createElement)("input", {
		type: "checkbox",
		className: "dshpp-checkbox",
		checked: selected.has(profile.name),
		onChange: () => toggle(profile.name)
	}), (0, react.createElement)("span", { className: "dshpp-profileName" }, profile.name), profile.current ? (0, react.createElement)("span", { className: "dshpp-currentTag" }, t("currentBadge")) : null)))), (0, react.createElement)("div", { className: "dshpp-field" }, (0, react.createElement)("label", { className: "dshpp-checkRow" }, (0, react.createElement)("input", {
		type: "checkbox",
		className: "dshpp-checkbox",
		checked: previewChecked,
		onChange: () => setPreviewChecked((checked) => !checked)
	}), (0, react.createElement)("span", {}, t("previewCheck"))), (0, react.createElement)("label", { className: "dshpp-checkRow" }, (0, react.createElement)("input", {
		type: "checkbox",
		className: "dshpp-checkbox",
		checked: rollbackChecked,
		onChange: () => setRollbackChecked((checked) => !checked)
	}), (0, react.createElement)("span", {}, t("rollbackCheck"))), (0, react.createElement)("label", { className: "dshpp-checkRow" }, (0, react.createElement)("input", {
		type: "checkbox",
		className: "dshpp-checkbox",
		checked: autoRestartChecked,
		disabled: !restartUsable,
		onChange: () => setAutoRestartChecked((checked) => !checked)
	}), (0, react.createElement)("span", {}, t("autoRestartCheck"))), !restartUsable ? (0, react.createElement)("div", { className: "dshpp-hint" }, `${t("autoRestartUnavailable")}${status.restart.hint !== "" ? ` — ${status.restart.hint}` : ""}`) : multiTarget ? (0, react.createElement)("div", { className: "dshpp-hint" }, t("autoRestartSingleOnly")) : null), (0, react.createElement)("div", { className: "dshpp-actions" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "primary",
		size: "sm",
		disabled: busy || pkg.trim() === "" || mode === "custom" && selected.size === 0,
		onClick: submit
	}, busy ? t("installing") : t("installButton")), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: busy || pkg.trim() === "",
		onClick: () => void runPreview()
	}, t("previewButton")), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: busy,
		onClick: () => void runUndo()
	}, busy && undoResult === null ? t("undoing") : t("undoButton"))), error !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, error) : null, changed !== null ? (0, react.createElement)("div", { className: results?.overallOk ? "dshpp-ok" : "dshpp-warn" }, changed) : null, results?.warnings !== void 0 && results.warnings.length > 0 ? (0, react.createElement)("div", { className: "dshpp-warn" }, results.warnings.map((warning) => `${warning.code}: ${warning.message}`).join(" · ")) : null, results?.rolledBackProfiles !== void 0 && results.rolledBackProfiles.length > 0 ? (0, react.createElement)("div", { className: "dshpp-warn" }, interpolate(t("rolledBack"), { profiles: results.rolledBackProfiles.join(", ") })) : null, results?.autoRestartSkipped === true ? (0, react.createElement)("div", { className: "dshpp-hint" }, t("autoRestartSkipped")) : null, autoRestart !== null ? (0, react.createElement)("div", { className: "dshpp-preview" }, (0, react.createElement)("div", { className: "dshpp-warn" }, `${t("autoRestartScheduled")} ${countdown}s`), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		onClick: () => void cancelAutoRestart()
	}, t("cancelRestart"))) : null, preview !== null ? (0, react.createElement)("div", { className: "dshpp-preview" }, (0, react.createElement)("div", { className: "dshpp-hint" }, `${t("previewLatest")} ${preview.latest ?? "?"}${preview.releaseAgeDays !== null ? ` · ${t("previewAgeDays")} ${preview.releaseAgeDays}` : ""}`), preview.warnings.map((warning) => (0, react.createElement)("div", {
		key: warning.code,
		className: warning.code === "release-age" ? "dshpp-warn" : "dshpp-hint"
	}, warning.message)), preview.suggestedPin !== null ? (0, react.createElement)("div", { className: "dshpp-hint" }, `${t("previewSuggestedPin")} ${preview.suggestedPin}`) : null) : null, undoResult !== null ? (0, react.createElement)("div", { className: "dshpp-preview" }, undoResult.results.map((row) => (0, react.createElement)("div", {
		key: row.profile,
		className: row.ok ? "dshpp-ok" : "dshpp-error"
	}, row.ok ? `${row.profile}: ${t("undoDone")}${row.hint !== void 0 ? ` (${row.hint})` : ""}` : `${row.profile}: ${row.error ?? "unknown error"}`))) : null, results !== null ? results.results.map((row) => (0, react.createElement)("div", {
		key: row.profile,
		className: "dshpp-resultRow"
	}, (0, react.createElement)("span", { className: "dshpp-resultProfile" }, row.profile), row.ok ? (0, react.createElement)(react.Fragment, {}, (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-ok" }, `${t("resolvedAs")} ${row.resolvedVersion ?? "?"}`), row.installedAs !== void 0 && row.installedAs.length > 0 ? (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-hint" }, `${t("installedAs")}: ${row.installedAs.join(", ")}`) : null, row.downgraded === true ? (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-warn" }, interpolate(t("downgradedNote"), {
		requested: row.requestedVersion ?? "?",
		resolved: row.resolvedVersion ?? "?"
	})) : null) : (0, react.createElement)(react.Fragment, {}, (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-error" }, `${t("failed")}: ${row.error ?? "unknown error"}`), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: busy,
		onClick: () => retryProfile(row.profile)
	}, t("retryProfile"))))) : null));
}
function UpdatesCard(props) {
	const { status, t, onInstalled } = props;
	const [updates, setUpdates] = (0, react.useState)(null);
	const [results, setResults] = (0, react.useState)([]);
	const [busy, setBusy] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const load = (0, react.useCallback)(async () => {
		setError(null);
		try {
			setUpdates(await fetchUpdates());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, []);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	const rows = asArray(updates?.updates);
	const warnings = asArray(updates?.warnings);
	const outdated = rows.filter((row) => row.outdated);
	const updateOne = async (row) => {
		setBusy(row.bundle);
		setError(null);
		try {
			const response = await postUpdate({
				package: row.bundle,
				...row.latest !== null ? { spec: row.latest } : {}
			});
			setResults(response.results);
			onInstalled();
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(null);
		}
	};
	const updateAll = async () => {
		setBusy("__all__");
		setError(null);
		try {
			const all = [];
			for (const row of outdated) {
				const response = await postUpdate({
					package: row.bundle,
					...row.latest !== null ? { spec: row.latest } : {}
				});
				all.push(...response.results);
			}
			setResults(all);
			onInstalled();
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(null);
		}
	};
	const alignOne = async (row) => {
		const names = asArray(status.profiles).map((profile) => profile.name);
		if (names.length === 0) return;
		setBusy(row.bundle);
		setError(null);
		try {
			const response = await postAlign({
				package: row.bundle,
				profiles: names,
				...row.latest !== null ? { version: row.latest } : {}
			});
			setResults(response.results);
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(null);
		}
	};
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("updatesCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-hint" }, t("updatesHint")), error !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, error) : null, updates === null && error === null ? (0, react.createElement)("div", { className: "dshpp-hint" }, "…") : null, updates !== null && outdated.length === 0 ? (0, react.createElement)("div", { className: "dshpp-ok" }, t("allUpToDate")) : null, updates?.warnings !== void 0 ? warnings.map((warning) => (0, react.createElement)("div", {
		key: warning.code + warning.message,
		className: "dshpp-warn"
	}, `${warning.code}: ${warning.message}`)) : null, outdated.length > 0 ? (0, react.createElement)("div", { className: "dshpp-actions" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: busy !== null,
		onClick: () => void updateAll()
	}, busy === "__all__" ? t("updating") : t("updateAllButton"))) : null, outdated.map((row) => (0, react.createElement)("div", {
		key: row.bundle,
		className: "dshpp-resultRow"
	}, (0, react.createElement)("span", { className: "dshpp-bundleName" }, row.bundle), (0, react.createElement)("span", { className: "dshpp-resultDetail" }, `${row.installed ?? "?"} → ${row.latest ?? "?"}${row.releaseAgeDays !== null ? ` (${row.releaseAgeDays}d)` : ""}`), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: busy !== null,
		onClick: () => void updateOne(row)
	}, busy === row.bundle ? t("updating") : t("updateButton")), asArray(status.profiles).length > 1 ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		disabled: busy !== null,
		onClick: () => void alignOne(row)
	}, t("alignButton")) : null)), results.length > 0 ? results.map((row) => (0, react.createElement)("div", {
		key: row.profile,
		className: "dshpp-resultRow"
	}, (0, react.createElement)("span", { className: "dshpp-resultProfile" }, row.profile), row.ok ? (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-ok" }, `${t("resolvedAs")} ${row.resolvedVersion ?? "?"}`) : (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-error" }, `${t("failed")}: ${row.error ?? "unknown error"}`))) : null));
}
function HealthCard(props) {
	const { t } = props;
	const [health, setHealth] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const load = (0, react.useCallback)(async () => {
		setError(null);
		try {
			setHealth(await fetchHealth());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, []);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	const severityClass = (severity) => severity === "error" ? "dshpp-error" : severity === "warning" ? "dshpp-warn" : "dshpp-hint";
	const issues = asArray(health?.issues);
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("healthCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-hint" }, t("healthHint")), error !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, error) : null, health === null && error === null ? (0, react.createElement)("div", { className: "dshpp-hint" }, "…") : null, health !== null && issues.length === 0 ? (0, react.createElement)("div", { className: "dshpp-ok" }, t("healthOk")) : null, issues.map((issue, index) => (0, react.createElement)("div", {
		key: `${issue.code}-${index}`,
		className: severityClass(issue.severity)
	}, issue.message)), health !== null ? (0, react.createElement)(react.Fragment, {}, (0, react.createElement)("div", { className: "dshpp-fieldLabel" }, t("nextBundlesLabel")), (0, react.createElement)("div", { className: "dshpp-mono" }, asArray(health?.nextBundles).join(" → "))) : null));
}
function CompareCard(props) {
	const { status, t } = props;
	const names = asArray(status.profiles).map((profile) => profile.name);
	const [left, setLeft] = (0, react.useState)(names[0] ?? "");
	const [right, setRight] = (0, react.useState)(names[1] ?? names[0] ?? "");
	const [diff, setDiff] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const load = (0, react.useCallback)(async (a, b) => {
		setError(null);
		try {
			setDiff(await fetchDiff([a, b]));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, []);
	(0, react.useEffect)(() => {
		if (left !== "" && right !== "") load(left, right);
	}, [
		left,
		right,
		load
	]);
	if (names.length < 2) return null;
	const onlyInA = asArray(diff?.onlyInA);
	const onlyInB = asArray(diff?.onlyInB);
	const versionDiffers = asArray(diff?.versionDiffers);
	const diffProfiles = asArray(diff?.profiles);
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("compareCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-hint" }, t("compareHint")), (0, react.createElement)("div", { className: "dshpp-modeRow" }, (0, react.createElement)("select", {
		className: "dshpp-input",
		value: left,
		onChange: (event) => setLeft(event.target.value)
	}, names.map((name) => (0, react.createElement)("option", {
		key: name,
		value: name
	}, name))), (0, react.createElement)("span", { className: "dshpp-hint" }, "↔"), (0, react.createElement)("select", {
		className: "dshpp-input",
		value: right,
		onChange: (event) => setRight(event.target.value)
	}, names.map((name) => (0, react.createElement)("option", {
		key: name,
		value: name
	}, name)))), error !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, error) : null, diff !== null ? (0, react.createElement)(react.Fragment, {}, onlyInA.length > 0 ? (0, react.createElement)("div", { className: "dshpp-hint" }, interpolate(t("compareOnlyInA"), { profile: diffProfiles[0] ?? "A" }) + ": " + onlyInA.join(", ")) : null, onlyInB.length > 0 ? (0, react.createElement)("div", { className: "dshpp-hint" }, interpolate(t("compareOnlyInB"), { profile: diffProfiles[1] ?? "B" }) + ": " + onlyInB.join(", ")) : null, versionDiffers.map((row) => (0, react.createElement)("div", {
		key: row.bundle,
		className: "dshpp-resultRow"
	}, (0, react.createElement)("span", { className: "dshpp-bundleName" }, row.bundle), (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-warn" }, `${row.a ?? "?"} ↔ ${row.b ?? "?"}`))), onlyInA.length === 0 && onlyInB.length === 0 && versionDiffers.length === 0 ? (0, react.createElement)("div", { className: "dshpp-ok" }, t("compareSame")) : null) : null));
}
function BootReportCard(props) {
	const { t } = props;
	const [report, setReport] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const load = (0, react.useCallback)(async () => {
		setError(null);
		try {
			setReport(await fetchBootReport());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, []);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	const failed = asArray(report?.entries).filter((entry) => entry.phase === "failed");
	const entryCount = asArray(report?.entries).length;
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("bootReportCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-hint" }, t("bootReportHint")), error !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, error) : null, report === null && error === null ? (0, react.createElement)("div", { className: "dshpp-hint" }, "…") : null, report !== null && failed.length === 0 ? (0, react.createElement)("div", { className: "dshpp-ok" }, t("bootAllActive")) : null, failed.map((entry) => (0, react.createElement)("div", {
		key: entry.id,
		className: "dshpp-resultRow"
	}, (0, react.createElement)("span", { className: "dshpp-resultProfile" }, entry.module ?? entry.id), (0, react.createElement)("span", { className: "dshpp-resultDetail dshpp-error" }, entry.error ?? t("bootFailedNoError")))), report !== null ? (0, react.createElement)("div", { className: "dshpp-hint" }, interpolate(t("bootEntryCount"), { total: entryCount })) : null));
}
function AuditCard(props) {
	const { t } = props;
	const [audit, setAudit] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const load = (0, react.useCallback)(async () => {
		setError(null);
		try {
			setAudit(await fetchAudit());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, []);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	const auditEntries = asArray(audit?.entries);
	return (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("auditCard")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-hint" }, t("auditHint")), error !== null ? (0, react.createElement)("div", { className: "dshpp-error" }, error) : null, audit === null && error === null ? (0, react.createElement)("div", { className: "dshpp-hint" }, "…") : null, audit !== null && auditEntries.length === 0 ? (0, react.createElement)("div", { className: "dshpp-hint" }, t("auditEmpty")) : null, auditEntries.map((entry) => (0, react.createElement)("div", {
		key: `${entry.ts}-${entry.action}-${entry.profile}`,
		className: entry.ok ? "dshpp-ok" : "dshpp-error"
	}, [
		new Date(entry.ts).toLocaleString(),
		entry.action,
		entry.profile,
		entry.package ?? "",
		entry.spec !== void 0 ? `@${entry.spec}` : "",
		entry.resolved !== void 0 ? `→ ${entry.resolved}` : ""
	].filter((part) => part !== "").join(" "), entry.error !== null && entry.error !== void 0 ? ` (${entry.error})` : ""))));
}
function Panel(props) {
	const { t } = props;
	const { status, error, refresh } = usePanelStatus();
	const [restartBusy, setRestartBusy] = (0, react.useState)(false);
	const [restartMessage, setRestartMessage] = (0, react.useState)(null);
	(0, react.useEffect)(() => {
		installStyles();
	}, []);
	const requestRestart = async () => {
		setRestartBusy(true);
		setRestartMessage(null);
		try {
			const response = await postRestart();
			if (response.ok) {
				setRestartMessage(t("restartRequested"));
				return;
			}
			const payload = response.payload;
			setRestartMessage(payload?.hint ?? payload?.error ?? `restart failed: ${response.status}`);
		} catch (cause) {
			setRestartMessage(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setRestartBusy(false);
			refresh();
		}
	};
	if (status === null) return (0, react.createElement)("div", { className: "dshpp-root" }, (0, react.createElement)("section", { className: "dshpp-card" }, (0, react.createElement)("div", { className: "dshpp-cardHeader" }, t("nav")), (0, react.createElement)("div", { className: "dshpp-cardBody" }, (0, react.createElement)("div", { className: "dshpp-warn" }, error ? t("unavailable") : "…"), error ? (0, react.createElement)(react.Fragment, {}, (0, react.createElement)("div", { className: "dshpp-hint" }, t("unavailableHint")), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "outline",
		size: "sm",
		onClick: () => refresh()
	}, t("retry"))) : null)));
	return (0, react.createElement)("div", { className: "dshpp-root" }, status.pendingRestart ? (0, react.createElement)("section", { className: "dshpp-banner" }, (0, react.createElement)("div", { className: "dshpp-bannerTitle" }, t("restartBanner")), (0, react.createElement)("div", { className: "dshpp-bannerDetail" }, status.changes !== null ? summarizeChanges(status.changes, t) : t("restartBannerHint")), status.restart.available ? (0, react.createElement)("div", { className: "dshpp-bannerAction" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "primary",
		size: "sm",
		disabled: restartBusy || status.restart.restarting,
		onClick: () => void requestRestart()
	}, restartBusy || status.restart.restarting ? t("restarting") : t("restartButton")), restartMessage !== null ? (0, react.createElement)("span", { className: "dshpp-warn" }, restartMessage) : null) : (0, react.createElement)("div", { className: "dshpp-hint" }, status.restart.hint)) : asArray(status.profilesPending).length > 0 ? (0, react.createElement)("section", { className: "dshpp-banner" }, (0, react.createElement)("div", { className: "dshpp-bannerTitle" }, t("othersPending")), (0, react.createElement)("div", { className: "dshpp-bannerDetail" }, asArray(status.profilesPending).map((row) => row.profile).join(", "))) : null, (0, react.createElement)(ProfileCard, {
		status,
		t
	}), (0, react.createElement)(BundleCard, {
		status,
		t
	}), (0, react.createElement)(CardBoundary, null, (0, react.createElement)(UpdatesCard, {
		status,
		t,
		onInstalled: refresh
	})), (0, react.createElement)(CardBoundary, null, (0, react.createElement)(HealthCard, {
		status,
		t
	})), (0, react.createElement)(CardBoundary, null, (0, react.createElement)(CompareCard, {
		status,
		t
	})), (0, react.createElement)(CardBoundary, null, (0, react.createElement)(BootReportCard, {
		status,
		t
	})), (0, react.createElement)(CardBoundary, null, (0, react.createElement)(AuditCard, {
		status,
		t
	})), (0, react.createElement)(RestartCard, {
		status,
		t,
		busy: restartBusy,
		message: restartMessage,
		onRestart: () => void requestRestart()
	}), (0, react.createElement)(InstallSection, {
		status,
		t,
		onInstalled: refresh
	}));
}
//#endregion
//#region src/client/index.tsx
/**
* dsh-profile-panel client: registers the "Profile / Plugins" settings
* section rendering the status panel. Built by tsdown into the
* __ModuleLoader__ factory bundle at client/client.js; the only externals
* are the loader module table's react and ui-primitives entries.
*/
const NS = "dsh-profile-panel";
const name = "dsh-profile-panel";
const inject = ["slots", "locale"];
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "dsh-profile-panel: dictionaries");
	const t = ctx.locale.bind(NS);
	ctx.effect(() => installMarketBridge(), "dsh-profile-panel: market bridge");
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "profile-panel",
		order: 35,
		label: () => t("nav"),
		inject: () => ({ t })
	}, () => (0, react.createElement)(Panel, { t })));
}
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
	return module.exports;
	}
});
//# sourceMappingURL=client.js.map
