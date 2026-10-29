/**
 * Client half of DSH WorkBuddy Subscription.
 *
 * Renders one page inside Settings → WorkBuddy, shaped like the Codex
 * subscription page: the account and its sign-in state first, then the credit
 * the account has left, then the model roster the sign-in actually unlocked.
 *
 * Everything it shows comes from the Host over the `workbuddy-subscription`
 * endpoints on the shared `/api` channel; the browser never sees a token.
 *
 * @module dsh-workbuddy-subscription/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-workbuddy-subscription',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace this page registers its copy under. */
    const NS = 'workbuddy-subscription'
    /** RPC channel the Host intercepts. */
    const CHANNEL = 'workbuddy-subscription'
    /** How often a pending sign-in is re-checked. */
    const LOGIN_POLL_MS = 2000

    const ZH = {
      nav: 'WorkBuddy',
      title: 'WorkBuddy 订阅',
      subtitle:
        '用 WorkBuddy 账号登录，即可在此查看剩余积分与账号可用的模型；登录后这些模型会出现在对话的模型选择器里。',
      tabCn: '国内版',
      tabAi: '国际版',
      account: '账号',
      signedIn: '已登录',
      signedOut: '未登录',
      signedInAs: '当前账号',
      anonymous: '（账号名未知）',
      enterprise: '企业账号',
      tokenExpiry: '令牌有效期',
      refreshExpiry: '刷新令牌有效期',
      source: '来源',
      sourceDesktop: '桌面端登录',
      sourceDsh: '本插件登录',
      credentialFile: '凭据文件',
      notSignedInHint:
        '点下面的按钮会把腾讯的授权页开在新的浏览器标签里，登录完成后这里会自动更新——不需要回到本页粘贴任何东西。',
      login: '在浏览器中登录',
      waiting: '等待浏览器完成登录…',
      reopen: '重新打开授权页',
      copyLink: '复制链接',
      copied: '已复制',
      cancel: '取消',
      cancelHint: '取消只是停止等待，不会退出已经完成的登录。',
      pasteTitle: '改用令牌登录',
      pasteHint:
        '如果浏览器登录不方便（例如授权页打不开），可以把 WorkBuddy 的凭据 JSON 粘贴到这里：既接受面板的平铺格式，也接受带 auth / account 的嵌套格式。',
      pastePlaceholder: '{ "accessToken": "…", "refreshToken": "…", "domain": "…", "uid": "…" }',
      pasteSubmit: '使用令牌登录',
      logout: '退出登录',
      logoutHint: '只删除本插件保存的凭据；你自己装的 WorkBuddy 桌面端登录不受影响。',
      refresh: '刷新',
      quota: '积分',
      quotaTotal: '剩余积分',
      quotaUnlimited: '不限量',
      quotaCycleReset: '本周期重置',
      quotaPackages: '套餐明细',
      quotaPackage: '套餐',
      quotaRemaining: '剩余',
      quotaExpires: '到期',
      quotaNone: '账号没有返回任何积分包。',
      quotaUnsigned: '登录后才能读取积分。',
      quotaExpiring: '有积分即将过期',
      models: '模型',
      modelsCount: '共 {n} 个模型',
      modelsSourceUpstream: '来自上游',
      modelsSourceFallback: '内置占位目录',
      modelsSourceSaved: '上次成功保存的目录',
      modelsEmpty: '上游没有返回任何模型；登录后请刷新目录。',
      modelsRefresh: '刷新目录',
      modelsContext: '上下文',
      modelsMaxOut: '输出上限',
      modelsFree: '免费',
      modelsReasoning: '推理档位',
      modelsColModel: '模型',
      modelsColRate: '倍率',
      modelsFilter: '筛选模型',
      modelsNoMatch: '没有匹配的模型。',
      modelsRateUnknown: '未知',
      modelsReasoningHint: '上游为该模型声明了推理能力；可选档位以上游目录给出的为准。',
      checkinTitle: '每日签到',
      checkinStreak: '已连续 {n} 天',
      checkinToday: '今日可得 {n} 积分',
      checkinClaimed: '今日已签到',
      checkinClaim: '签到',
      checkinClaiming: '签到中…',
      checkinDone: '签到成功，+{n} 积分',
      checkinAlready: '今天已经签到过了。',
      checkinInactive: '签到活动当前未开放',
      checkinBonus: '{n} 天后额外奖励 {b} 积分',
      loading: '读取中…',
      retry: '重试',
      errorTitle: '读取失败',
      secureNote: '令牌只保存在宿主机上，不会发送到浏览器页面。',
      libraryFailed: '上游组件未加载',
    }

    const EN = {
      nav: 'WorkBuddy',
      title: 'WorkBuddy subscription',
      subtitle:
        'Sign in with a WorkBuddy account to see the credit it has left and the models it unlocks; those models then appear in the composer’s model picker.',
      tabCn: 'China build',
      tabAi: 'International build',
      account: 'Account',
      signedIn: 'Signed in',
      signedOut: 'Signed out',
      signedInAs: 'Signed in as',
      anonymous: '(account name unavailable)',
      enterprise: 'Team account',
      tokenExpiry: 'Token expires',
      refreshExpiry: 'Refresh token expires',
      source: 'Source',
      sourceDesktop: 'desktop app sign-in',
      sourceDsh: 'this plugin',
      credentialFile: 'Credential file',
      notSignedInHint:
        'The button opens Tencent’s authorization page in a new browser tab. Signing in there updates this page by itself — nothing has to be pasted back here.',
      login: 'Sign in in the browser',
      waiting: 'Waiting for the browser to finish…',
      reopen: 'Reopen authorization page',
      copyLink: 'Copy link',
      copied: 'Copied',
      cancel: 'Cancel',
      cancelHint: 'Cancelling stops the wait; a sign-in that already finished is unaffected.',
      pasteTitle: 'Sign in with a token instead',
      pasteHint:
        'If the browser flow is inconvenient — the authorization page cannot open, say — paste a WorkBuddy credential JSON here. Both the flat panel form and the nested auth/account form are accepted.',
      pastePlaceholder: '{ "accessToken": "…", "refreshToken": "…", "domain": "…", "uid": "…" }',
      pasteSubmit: 'Sign in with this token',
      logout: 'Sign out',
      logoutHint: 'Removes only the credential this plugin stores; a desktop app’s own sign-in is untouched.',
      refresh: 'Refresh',
      quota: 'Credit',
      quotaTotal: 'Remaining credit',
      quotaUnlimited: 'Unlimited',
      quotaCycleReset: 'Cycle resets',
      quotaPackages: 'Packages',
      quotaPackage: 'Package',
      quotaRemaining: 'Left',
      quotaExpires: 'Expires',
      quotaNone: 'The account returned no credit packages.',
      quotaUnsigned: 'Sign in to read the credit.',
      quotaExpiring: 'Credit is about to expire',
      models: 'Models',
      modelsCount: '{n} models',
      modelsSourceUpstream: 'from upstream',
      modelsSourceFallback: 'built-in placeholder roster',
      modelsSourceSaved: 'last saved catalog',
      modelsEmpty: 'The upstream returned no models; refresh the catalog after signing in.',
      modelsRefresh: 'Refresh catalog',
      modelsContext: 'Context',
      modelsMaxOut: 'Max output',
      modelsFree: 'Free',
      modelsReasoning: 'Reasoning',
      modelsColModel: 'Model',
      modelsColRate: 'Rate',
      modelsFilter: 'Filter models',
      modelsNoMatch: 'No model matches.',
      modelsRateUnknown: 'unknown',
      modelsReasoningHint: 'The upstream declares reasoning for this model; the selectable levels are the ones its catalog reports.',
      checkinTitle: 'Daily check-in',
      checkinStreak: '{n}-day streak',
      checkinToday: '{n} credits today',
      checkinClaimed: 'Checked in today',
      checkinClaim: 'Check in',
      checkinClaiming: 'Checking in…',
      checkinDone: 'Checked in, +{n} credits',
      checkinAlready: 'Already checked in today.',
      checkinInactive: 'The check-in activity is closed',
      checkinBonus: 'Bonus {b} credits in {n} days',
      loading: 'Reading…',
      retry: 'Retry',
      errorTitle: 'Could not read',
      secureNote: 'The token stays on the Host; it is never sent to this page.',
      libraryFailed: 'Upstream library failed to load',
    }

    /** Interpolate `{name}` placeholders. */
    function format(template, values) {
      return template.replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
      )
    }

    /** Thousands separators, matching how WorkBuddy's own surfaces print credit. */
    function formatNumber(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return value.toLocaleString('en-US')
    }

    /** A local date-time, or a dash when the field is absent or unusable. */
    function formatTime(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—'
      const date = new Date(ms)
      if (Number.isNaN(date.getTime())) return '—'
      const pad = (part) => String(part).padStart(2, '0')
      return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(
        date.getMinutes(),
      )}`
    }

    /**
     * A context window in the form a reader already knows it.
     *
     * Windows arrive in both spellings: decimal round numbers (WorkBuddy's own
     * `1000000`, `512000`, `192000`) and binary ones (`1048576`, `131072`,
     * `65536`). Dividing everything by 1000 calls `65536` "66K" — not the 64K
     * anyone would recognise — and dividing everything by 1024 turns `512000`
     * into "500K", discarding a round number the upstream really meant. So the
     * base follows the value: a binary multiple uses 1024, and a number that is
     * also a round decimal keeps 1000.
     */
    function formatWindow(tokens) {
      if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return null
      const binary = tokens % 1024 === 0 && tokens % 1000 !== 0
      const unit = binary ? 1024 : 1000
      const round = (value) => Math.round(value * 100) / 100
      if (tokens >= unit * unit) return `${round(tokens / (unit * unit))}M`
      if (tokens >= unit) return `${round(tokens / unit)}K`
      return String(tokens)
    }

    /**
     * The credits multiplier in its language-neutral display form.
     *
     * The upstream spells one field two ways — the China roster sends
     * `x0.29 credits` and the international one sends `x0.29` — and a unit word
     * would pin an otherwise symbolic label to English. Dropping a trailing
     * `credits` leaves the one spelling that reads the same in every language.
     * It lives here as well as in the Host so this page renders correctly
     * against either Host build; a multiplier is a display value either way.
     */
    function formatRate(credits) {
      if (typeof credits !== 'string') return null
      const trimmed = credits.replace(/\s*credits?\s*$/i, '').trim()
      return trimmed === '' ? null : trimmed
    }

    /* Every value here follows the host's own settings pages: the type scale
     * (16/24 title, 14/22 body, 11/16 annotation), 0.5px hairlines, radius
     * tokens, and `tabular-nums` wherever digits must line up. `box-sizing` is
     * set explicitly because the app ships no global border-box reset — without
     * it an outlined control stands 2px taller than the filled one beside it. */
    const STYLE = `
.wbs-page{display:flex;flex-direction:column;gap:12px;max-width:720px;padding:4px 0 32px}
.wbs-head{display:flex;flex-direction:column;gap:4px}
.wbs-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.wbs-subtitle{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}
.wbs-tabs{display:flex;gap:4px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.wbs-tab{box-sizing:border-box;appearance:none;border:0;background:transparent;padding:8px 12px;margin-bottom:-0.5px;font:inherit;font-size:14px;line-height:22px;cursor:pointer;color:var(--dsw-alias-label-secondary);border-bottom:2px solid transparent}
.wbs-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.wbs-tab[aria-selected="true"]{color:var(--dsw-alias-label-primary);font-weight:500;border-bottom-color:var(--dsw-alias-brand-primary)}
.wbs-card{display:flex;flex-direction:column;gap:12px;padding:12px 14px;border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);border:0.5px solid var(--dsw-alias-settings-card-stroke)}
.wbs-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.wbs-card-title{margin:0;font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}
.wbs-row{display:flex;gap:10px;align-items:baseline;font-size:14px;line-height:22px}
.wbs-key{flex:0 0 132px;color:var(--dsw-alias-label-tertiary)}
.wbs-value{min-width:0;color:var(--dsw-alias-label-primary);word-break:break-all}
.wbs-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.wbs-pill{display:inline-flex;align-items:center;gap:6px;padding:1px 8px;border-radius:var(--dsw-radius-xs);border:0.5px solid var(--dsw-alias-border-l3);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.wbs-pill-warn{border-color:transparent;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}
.wbs-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.wbs-dot[data-on="true"]{background:var(--dsw-alias-state-success-primary)}
.wbs-dot[data-on="false"]{background:var(--dsw-alias-state-error-primary)}
.wbs-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wbs-btn{box-sizing:border-box;appearance:none;display:inline-flex;align-items:center;gap:6px;border-radius:var(--dsw-radius-sm);padding:5px 12px;font:inherit;font-size:14px;line-height:22px;cursor:pointer;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.wbs-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.wbs-btn:disabled{opacity:.5;cursor:default}
.wbs-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted)}
.wbs-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.wbs-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wbs-alert{font-size:12px;line-height:18px;padding:6px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.wbs-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wbs-total{font-size:24px;line-height:32px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.wbs-total small{font-size:12px;line-height:18px;font-weight:400;color:var(--dsw-alias-label-tertiary);margin-left:6px}
.wbs-table{width:100%;border-collapse:collapse;border-block:0.5px solid var(--dsw-alias-border-l2);font:inherit;text-align:left}
.wbs-table th{padding:6px 8px;font-size:11px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.wbs-table td{padding:6px 8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);vertical-align:top}
.wbs-table tr + tr{border-top:0.5px solid var(--dsw-alias-border-l2)}
.wbs-mtable{width:100%;border-collapse:collapse;border-block:0.5px solid var(--dsw-alias-border-l2);font:inherit;text-align:left}
.wbs-mtable th{padding:6px 8px;font-size:11px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.wbs-mtable td{padding:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);vertical-align:top}
.wbs-mtable tbody tr + tr{border-top:0.5px solid var(--dsw-alias-border-l2)}
.wbs-mtable tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}
/* The identity column absorbs the slack; the numeric columns then size to their
   own content instead of being stretched, which is what makes them line up. */
.wbs-mtable th:first-child,.wbs-mtable td:first-child{width:100%}
.wbs-mtable th:not(:first-child),.wbs-mtable td:not(:first-child){text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.wbs-mname{font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:normal}
.wbs-mid{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:normal}
.wbs-mtags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.wbs-tag{display:inline-block;padding:1px 6px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-xs);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:normal;white-space:nowrap}
.wbs-tag-free{border-color:transparent;background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}
.wbs-tag-rate{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.wbs-filter{box-sizing:border-box;flex:1 1 140px;min-width:110px;max-width:220px;margin-left:auto;padding:3px 8px;border-radius:var(--dsw-radius-sm);font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l2)}
.wbs-filter::placeholder{color:var(--dsw-alias-label-tertiary)}
.wbs-url{font-size:12px;line-height:18px;word-break:break-all;color:var(--dsw-alias-link)}
.wbs-details{font-size:14px;line-height:22px}
.wbs-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}
.wbs-textarea{box-sizing:border-box;width:100%;min-height:96px;margin-top:8px;padding:8px 10px;border-radius:var(--dsw-radius-sm);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l2);resize:vertical}
.wbs-empty{font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}
.wbs-checkin{display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.wbs-checkin-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wbs-checkin-title{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}
.wbs-checkin-body{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wbs-checkin-copy{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
/* Narrow panels drop the least load-bearing column rather than scrolling
   sideways; the header and body stay in step because both lose the same cell. */
@media (max-width: 560px){
  .wbs-mtable th:nth-child(3),.wbs-mtable td:nth-child(3){display:none}
  .wbs-key{flex-basis:104px}
}
`

    /** Call one Host endpoint and unwrap the RPC result. */
    function createRpc(connection) {
      return {
        async call(endpoint, payload, signal) {
          const result = await connection.rpc.call('/api', `${CHANNEL}/${endpoint}`, payload, signal)
          if (!result || result.ok !== true) {
            throw new Error(result?.error?.message ?? `WorkBuddy RPC ${endpoint} failed`)
          }
          return result.value
        },
      }
    }

    /** One product's page: its status plus the readings the user asked for. */
    function useVariant(rpc, variantId, signedIn) {
      const [usage, setUsage] = React.useState(undefined)
      const [usageError, setUsageError] = React.useState(undefined)
      const [usageLoading, setUsageLoading] = React.useState(false)
      const [models, setModels] = React.useState(undefined)
      const [modelsError, setModelsError] = React.useState(undefined)
      const [modelsLoading, setModelsLoading] = React.useState(false)

      const loadUsage = React.useCallback(
        async (force) => {
          setUsageLoading(true)
          setUsageError(undefined)
          try {
            const value = await rpc.call('usage', { variant: variantId, force: force === true })
            setUsage(value.credits)
          } catch (error) {
            setUsageError(error instanceof Error ? error.message : String(error))
            setUsage(undefined)
          } finally {
            setUsageLoading(false)
          }
        },
        [rpc, variantId],
      )

      const loadModels = React.useCallback(
        async (refresh) => {
          setModelsLoading(true)
          setModelsError(undefined)
          try {
            const value = await rpc.call('models', { variant: variantId, refresh: refresh === true })
            setModels(value)
          } catch (error) {
            setModelsError(error instanceof Error ? error.message : String(error))
          } finally {
            setModelsLoading(false)
          }
        },
        [rpc, variantId],
      )

      React.useEffect(() => {
        // A signed-in account is what makes either reading meaningful, and both
        // cost an upstream request, so nothing is asked while signed out.
        setUsage(undefined)
        setModels(undefined)
        setUsageError(undefined)
        setModelsError(undefined)
        if (!signedIn) return undefined
        let live = true
        void (async () => {
          try {
            const value = await rpc.call('models', { variant: variantId })
            if (live) setModels(value)
          } catch (error) {
            if (live) setModelsError(error instanceof Error ? error.message : String(error))
          }
          try {
            const value = await rpc.call('usage', { variant: variantId })
            if (live) setUsage(value.credits)
          } catch (error) {
            if (live) setUsageError(error instanceof Error ? error.message : String(error))
          }
        })()
        return () => {
          live = false
        }
      }, [rpc, variantId, signedIn])

      return {
        usage,
        usageError,
        usageLoading,
        loadUsage,
        models,
        modelsError,
        modelsLoading,
        loadModels,
      }
    }

    /** The sign-in controls for one product, including the paste fallback. */
    function LoginPanel({ t, rpc, variantId, status, onSignedIn }) {
      const [pending, setPending] = React.useState(undefined)
      const [loginError, setLoginError] = React.useState(undefined)
      const [starting, setStarting] = React.useState(false)
      const [pasted, setPasted] = React.useState('')
      const [submitting, setSubmitting] = React.useState(false)
      const [copied, setCopied] = React.useState(false)

      const finish = React.useCallback(() => {
        setPending(undefined)
        setLoginError(undefined)
        setStarting(false)
        onSignedIn()
      }, [onSignedIn])

      // Poll only while this page is the one waiting, so a sign-in started for
      // the other product is not reported here.
      React.useEffect(() => {
        if (pending === undefined || pending.state !== 'pending') return undefined
        let live = true
        const timer = setInterval(async () => {
          try {
            const value = await rpc.call('login/status', { variant: variantId })
            if (!live) return
            if (value.state === 'signed-in') finish()
            else if (value.state === 'failed') {
              setLoginError(value.error ?? t('errorTitle'))
              setPending(undefined)
            } else if (value.state === 'cancelled' || value.state === 'idle') setPending(undefined)
          } catch (error) {
            if (live) setLoginError(error instanceof Error ? error.message : String(error))
          }
        }, LOGIN_POLL_MS)
        return () => {
          live = false
          clearInterval(timer)
        }
      }, [pending, rpc, variantId, finish, t])

      // The Host may already be waiting on a sign-in this page reloaded away
      // from; adopt it instead of starting a second one.
      React.useEffect(() => {
        if (status?.login?.state !== 'pending' || pending !== undefined) return
        setPending({ state: 'pending', url: status.login.url })
      }, [status, pending])

      const start = React.useCallback(async () => {
        setStarting(true)
        setLoginError(undefined)
        try {
          const value = await rpc.call('login/start', { variant: variantId })
          setPending({ state: value.state, url: value.url })
          if (typeof value.url === 'string' && value.url !== '') {
            window.open(value.url, '_blank', 'noopener,noreferrer')
          }
        } catch (error) {
          setLoginError(error instanceof Error ? error.message : String(error))
        } finally {
          setStarting(false)
        }
      }, [rpc, variantId])

      const cancel = React.useCallback(async () => {
        try {
          await rpc.call('login/cancel', { variant: variantId })
        } catch {
          // Cancelling is best-effort; the pending state is cleared locally anyway.
        }
        setPending(undefined)
      }, [rpc, variantId])

      const submit = React.useCallback(async () => {
        setSubmitting(true)
        setLoginError(undefined)
        try {
          await rpc.call('login/submit', { variant: variantId, document: pasted })
          setPasted('')
          finish()
        } catch (error) {
          setLoginError(error instanceof Error ? error.message : String(error))
        } finally {
          setSubmitting(false)
        }
      }, [rpc, variantId, pasted, finish])

      const copy = React.useCallback(async () => {
        const url = pending?.url
        if (typeof url !== 'string' || url === '') return
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard access can be refused; the link below stays clickable.
        }
      }, [pending])

      if (status?.signedIn === true) {
        return h(
          'div',
          { className: 'wbs-card' },
          h(
            'div',
            { className: 'wbs-card-head' },
            h('h3', { className: 'wbs-card-title' }, t('account')),
            h(
              'span',
              { className: 'wbs-pill' },
              h('span', { className: 'wbs-dot', 'data-on': 'true' }),
              t('signedIn'),
            ),
          ),
          h(Row, { label: t('signedInAs'), value: status.nickname || status.uid || t('anonymous') }),
          status.enterpriseId
            ? h(Row, { label: t('enterprise'), value: status.enterpriseId, mono: true })
            : null,
          h(Row, { label: t('tokenExpiry'), value: formatTime(status.expiresAtMs) }),
          status.refreshExpiresAtMs
            ? h(Row, { label: t('refreshExpiry'), value: formatTime(status.refreshExpiresAtMs) })
            : null,
          h(Row, {
            label: t('source'),
            value: status.source === 'desktop' ? t('sourceDesktop') : t('sourceDsh'),
          }),
          h(Row, { label: t('credentialFile'), value: status.authPath, mono: true }),
        )
      }

      if (pending !== undefined) {
        return h(
          'div',
          { className: 'wbs-card' },
          h('h3', { className: 'wbs-card-title' }, t('waiting')),
          h('p', { className: 'wbs-hint' }, t('notSignedInHint')),
          pending.url
            ? h(
                'a',
                { className: 'wbs-url', href: pending.url, target: '_blank', rel: 'noopener noreferrer' },
                pending.url,
              )
            : null,
          loginError ? h('div', { className: 'wbs-alert' }, loginError) : null,
          h(
            'div',
            { className: 'wbs-actions' },
            pending.url
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'wbs-btn',
                    onClick: () => window.open(pending.url, '_blank', 'noopener,noreferrer'),
                  },
                  t('reopen'),
                )
              : null,
            pending.url
              ? h('button', { type: 'button', className: 'wbs-btn', onClick: copy }, copied ? t('copied') : t('copyLink'))
              : null,
            h('button', { type: 'button', className: 'wbs-btn', onClick: cancel }, t('cancel')),
          ),
          h('p', { className: 'wbs-hint' }, t('cancelHint')),
        )
      }

      return h(
        'div',
        { className: 'wbs-card' },
        h(
          'div',
          { className: 'wbs-card-head' },
          h('h3', { className: 'wbs-card-title' }, t('account')),
          h(
            'span',
            { className: 'wbs-pill' },
            h('span', { className: 'wbs-dot', 'data-on': 'false' }),
            t('signedOut'),
          ),
        ),
        h('p', { className: 'wbs-hint' }, t('notSignedInHint')),
        status?.reason ? h('div', { className: 'wbs-alert' }, status.reason) : null,
        loginError ? h('div', { className: 'wbs-alert' }, loginError) : null,
        h(
          'div',
          { className: 'wbs-actions' },
          h(
            'button',
            { type: 'button', className: 'wbs-btn wbs-btn-primary', onClick: start, disabled: starting },
            starting ? t('loading') : t('login'),
          ),
        ),
        h(
          'details',
          { className: 'wbs-details' },
          h('summary', null, t('pasteTitle')),
          h('p', { className: 'wbs-hint' }, t('pasteHint')),
          h('textarea', {
            className: 'wbs-textarea',
            placeholder: t('pastePlaceholder'),
            value: pasted,
            spellCheck: false,
            onChange: (event) => setPasted(event.target.value),
          }),
          h(
            'div',
            { className: 'wbs-actions', style: { marginTop: '8px' } },
            h(
              'button',
              {
                type: 'button',
                className: 'wbs-btn',
                onClick: submit,
                disabled: submitting || pasted.trim() === '',
              },
              submitting ? t('loading') : t('pasteSubmit'),
            ),
          ),
        ),
        h('p', { className: 'wbs-note' }, t('secureNote')),
      )
    }

    /**
     * The China build's daily check-in.
     *
     * Reading the state is free, claiming grants a real reward — so the button
     * is the only way in, and the Host re-reads the status right before writing.
     * The row renders only where the activity exists; the caller decides that.
     */
    function CheckinRow({ t, rpc, variantId, onClaimed }) {
      const [state, setState] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(undefined)
      const [error, setError] = React.useState(undefined)

      const load = React.useCallback(async () => {
        try {
          setState(await rpc.call('checkin/status', { variant: variantId }))
          setError(undefined)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }, [rpc, variantId])

      React.useEffect(() => {
        setState(undefined)
        setNotice(undefined)
        setError(undefined)
        void load()
      }, [load])

      const claim = React.useCallback(async () => {
        setBusy(true)
        setNotice(undefined)
        setError(undefined)
        try {
          const result = await rpc.call('checkin/claim', { variant: variantId })
          if (result?.state === 'claimed') {
            setNotice(format(t('checkinDone'), { n: formatNumber(result.credit ?? 0) }))
            if (result.after !== undefined) setState({ supported: true, ...result.after })
            else await load()
            onClaimed?.()
          } else if (result?.state === 'already') {
            setNotice(t('checkinAlready'))
            if (result.before !== undefined) setState({ supported: true, ...result.before })
          } else {
            setNotice(t('checkinClaiming'))
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setBusy(false)
        }
      }, [rpc, variantId, load, onClaimed, t])

      if (state === undefined) return error === undefined ? null : h('div', { className: 'wbs-alert' }, error)
      if (state.supported === false) return null

      const done = state.todayCheckedIn === true
      const closed = state.active === false
      const copy = done
        ? t('checkinClaimed')
        : closed
          ? t('checkinInactive')
          : format(t('checkinToday'), { n: formatNumber(state.todayCredit ?? state.dailyCredit ?? 0) })

      return h(
        'div',
        { className: 'wbs-checkin' },
        h(
          'div',
          { className: 'wbs-checkin-head' },
          h('span', { className: 'wbs-checkin-title' }, t('checkinTitle')),
          state.streakDays > 0
            ? h('span', { className: 'wbs-tag' }, format(t('checkinStreak'), { n: formatNumber(state.streakDays) }))
            : null,
          state.streakBonusDays > 0 && state.streakBonusCredit > 0
            ? h(
                'span',
                { className: 'wbs-tag' },
                format(t('checkinBonus'), {
                  n: formatNumber(state.streakBonusDays),
                  b: formatNumber(state.streakBonusCredit),
                }),
              )
            : null,
        ),
        h(
          'div',
          { className: 'wbs-checkin-body' },
          h('span', { className: 'wbs-checkin-copy' }, copy),
          h(
            'button',
            {
              type: 'button',
              className: 'wbs-btn wbs-btn-primary',
              onClick: claim,
              disabled: busy || done || closed,
            },
            busy ? t('checkinClaiming') : state.claimButtonText || t('checkinClaim'),
          ),
        ),
        notice !== undefined ? h('p', { className: 'wbs-hint' }, notice) : null,
        error !== undefined ? h('div', { className: 'wbs-alert' }, error) : null,
      )
    }

    /** One credit reading: total, cycle reset, and the packages behind it. */
    function QuotaCard({ t, signedIn, usage, error, loading, onRefresh, rpc, variantId, region, onClaimed }) {
      const body = []
      if (!signedIn) {
        body.push(h('p', { className: 'wbs-empty', key: 'unsigned' }, t('quotaUnsigned')))
      } else if (loading && usage === undefined) {
        body.push(h('p', { className: 'wbs-empty', key: 'loading' }, t('loading')))
      } else if (error !== undefined) {
        body.push(h('div', { className: 'wbs-alert', key: 'error' }, error))
      } else if (usage === undefined) {
        body.push(h('p', { className: 'wbs-empty', key: 'empty' }, t('quotaNone')))
      } else {
        body.push(
          h(
            'div',
            { key: 'total' },
            h(
              'div',
              { className: 'wbs-total' },
              usage.unlimited === true ? t('quotaUnlimited') : formatNumber(usage.total),
              h('small', null, t('quotaTotal')),
            ),
            usage.cycleResetTime
              ? h(Row, { label: t('quotaCycleReset'), value: usage.cycleResetTime })
              : null,
          ),
        )
        const accounts = Array.isArray(usage.accounts) ? usage.accounts : []
        if (accounts.length > 0) {
          body.push(
            h(
              'table',
              { className: 'wbs-table', key: 'accounts' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', null, t('quotaPackage')),
                  h('th', null, t('quotaRemaining')),
                  h('th', null, t('quotaExpires')),
                ),
              ),
              h(
                'tbody',
                null,
                accounts.map((account, index) =>
                  h(
                    'tr',
                    { key: `${account.packageName ?? 'package'}-${index}` },
                    h('td', null, account.packageName ?? '—'),
                    h(
                      'td',
                      null,
                      account.unlimited === true
                        ? t('quotaUnlimited')
                        : `${formatNumber(account.remain)} / ${formatNumber(account.size)}`,
                    ),
                    h('td', null, formatTime(account.endTimeMs)),
                  ),
                ),
              ),
            ),
          )
        } else if (usage.unlimited !== true) {
          body.push(h('p', { className: 'wbs-empty', key: 'noaccounts' }, t('quotaNone')))
        }
      }
      return h(
        'div',
        { className: 'wbs-card' },
        h(
          'div',
          { className: 'wbs-card-head' },
          h('h3', { className: 'wbs-card-title' }, t('quota')),
          h(
            'button',
            { type: 'button', className: 'wbs-btn', onClick: () => onRefresh(true), disabled: !signedIn || loading },
            loading ? t('loading') : t('refresh'),
          ),
        ),
        ...body,
        signedIn && region === 'cn' ? h(CheckinRow, { t, rpc, variantId, onClaimed }) : null,
      )
    }

    /**
     * The model roster the sign-in unlocked.
     *
     * Laid out as a real table so the capacity columns line up and can be
     * scanned *down* a column; the previous single flowed line made "which model
     * has the largest window" unanswerable at a glance. The identity cell keeps
     * its annotations (free, promotion, reasoning) beside the name, the way the
     * host's own provider rows carry their tags, and the model id drops to a
     * caption line where it stays available without competing with the name.
     */
    function ModelsCard({ t, signedIn, value, error, loading, onRefresh, catalogError }) {
      const models = value?.models ?? []
      const [filter, setFilter] = React.useState('')
      const needle = filter.trim().toLowerCase()
      const shown =
        needle === ''
          ? models
          : models.filter((model) => `${model.name ?? ''} ${model.id}`.toLowerCase().includes(needle))
      const source =
        value?.source === 'upstream'
          ? t('modelsSourceUpstream')
          : value?.source === 'saved'
            ? t('modelsSourceSaved')
            : t('modelsSourceFallback')
      const countLabel =
        needle === ''
          ? format(t('modelsCount'), { n: formatNumber(models.length) })
          : `${formatNumber(shown.length)} / ${formatNumber(models.length)}`

      const body =
        loading && value === undefined
          ? h('p', { className: 'wbs-empty' }, t('loading'))
          : models.length === 0
            ? h('p', { className: 'wbs-empty' }, t('modelsEmpty'))
            : h(
                'table',
                { className: 'wbs-mtable' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', null, t('modelsColModel')),
                    h('th', null, t('modelsContext')),
                    h('th', null, t('modelsMaxOut')),
                    h('th', null, t('modelsColRate')),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  shown.map((model) => {
                    const contextText = formatWindow(model.contextWindow)
                    const maxOutText = formatWindow(model.maxTokens)
                    const free = model.billing?.free === true
                    const rate = free ? null : formatRate(model.billing?.credits)
                    const rateUnknown = rate === null && !free && model.billing?.rateUnknown === true
                    const efforts =
                      model.reasoning?.supports === true && Array.isArray(model.reasoning.supportedEfforts)
                        ? model.reasoning.supportedEfforts
                        : []
                    return h(
                      'tr',
                      { key: model.id },
                      h(
                        'td',
                        null,
                        h('span', { className: 'wbs-mname' }, model.name || model.id),
                        h('span', { className: 'wbs-mid', title: model.id }, model.id),
                        h(
                          'div',
                          { className: 'wbs-mtags' },
                          ...(model.billing?.badges ?? []).map((badge, index) =>
                            h('span', { className: 'wbs-tag', key: `badge-${String(index)}` }, badge),
                          ),
                          model.reasoning?.supports === true
                            ? h(
                                'span',
                                { className: 'wbs-tag', title: t('modelsReasoningHint') },
                                efforts.length > 0
                                  ? `${t('modelsReasoning')} ${efforts.join(' / ')}`
                                  : t('modelsReasoning'),
                              )
                            : null,
                        ),
                      ),
                      h('td', null, contextText ?? '—'),
                      h('td', null, maxOutText ?? '—'),
                      h(
                        'td',
                        null,
                        // "Free" belongs in the rate column, not beside the name:
                        // it is a price, and a dash there would read as unknown.
                        free
                          ? h('span', { className: 'wbs-tag wbs-tag-free' }, t('modelsFree'))
                          : rate !== null
                            ? h('span', { className: 'wbs-tag wbs-tag-rate' }, rate)
                            : rateUnknown
                              ? h('span', { className: 'wbs-tag' }, t('modelsRateUnknown'))
                              : '—',
                      ),
                    )
                  }),
                ),
              )

      return h(
        'div',
        { className: 'wbs-card' },
        h(
          'div',
          { className: 'wbs-card-head' },
          h('h3', { className: 'wbs-card-title' }, t('models')),
          h(
            'button',
            { type: 'button', className: 'wbs-btn', onClick: () => onRefresh(true), disabled: !signedIn || loading },
            loading ? t('loading') : t('modelsRefresh'),
          ),
        ),
        h(
          'div',
          { className: 'wbs-actions' },
          h('span', { className: 'wbs-pill' }, countLabel),
          // A fallback roster is not the account's real catalog, so it is toned
          // as a caution rather than as plain provenance.
          h(
            'span',
            { className: value?.source === 'upstream' ? 'wbs-pill' : 'wbs-pill wbs-pill-warn' },
            source,
          ),
          models.length > 8
            ? h('input', {
                className: 'wbs-filter',
                type: 'search',
                value: filter,
                placeholder: t('modelsFilter'),
                'aria-label': t('modelsFilter'),
                onChange: (event) => setFilter(event.target.value),
              })
            : null,
        ),
        error !== undefined ? h('div', { className: 'wbs-alert' }, error) : null,
        catalogError !== undefined && error === undefined ? h('div', { className: 'wbs-alert' }, catalogError) : null,
        shown.length === 0 && models.length > 0 ? h('p', { className: 'wbs-empty' }, t('modelsNoMatch')) : body,
      )
    }

    /** One label/value line. */
    function Row({ label, value, mono }) {
      return h(
        'div',
        { className: 'wbs-row' },
        h('span', { className: 'wbs-key' }, label),
        h('span', { className: mono === true ? 'wbs-value wbs-mono' : 'wbs-value' }, value),
      )
    }

    /** The settings page itself. */
    function WorkBuddySection({ t, rpc }) {
      const [snapshot, setSnapshot] = React.useState(undefined)
      const [error, setError] = React.useState(undefined)
      const [loading, setLoading] = React.useState(true)
      const [tab, setTab] = React.useState('workbuddy')
      const [busy, setBusy] = React.useState(false)

      const load = React.useCallback(async () => {
        setLoading(true)
        try {
          setSnapshot(await rpc.call('status', {}))
          setError(undefined)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setLoading(false)
        }
      }, [rpc])

      React.useEffect(() => {
        void load()
      }, [load])

      const variants = snapshot?.variants ?? []
      const active = variants.find((entry) => entry.id === tab) ?? variants[0]
      const variantId = active?.id ?? tab
      const state = useVariant(rpc, variantId, active?.signedIn === true)

      const logout = React.useCallback(async () => {
        setBusy(true)
        try {
          await rpc.call('logout', { variant: variantId })
          await load()
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setBusy(false)
        }
      }, [rpc, variantId, load])

      if (loading && snapshot === undefined) {
        return h('div', { className: 'wbs-page' }, h('p', { className: 'wbs-empty' }, t('loading')))
      }

      if (error !== undefined && snapshot === undefined) {
        return h(
          'div',
          { className: 'wbs-page' },
          h('h2', { className: 'wbs-title' }, t('title')),
          h('div', { className: 'wbs-card' }, h('div', { className: 'wbs-alert' }, error)),
          h(
            'div',
            { className: 'wbs-actions' },
            h('button', { type: 'button', className: 'wbs-btn', onClick: () => void load() }, t('retry')),
          ),
        )
      }

      return h(
        'div',
        { className: 'wbs-page' },
        h(
          'div',
          { className: 'wbs-head' },
          h('h2', { className: 'wbs-title' }, t('title')),
          h('p', { className: 'wbs-subtitle' }, t('subtitle')),
        ),
        h(
          'nav',
          { className: 'wbs-tabs', role: 'tablist' },
          variants.map((entry) =>
            h(
              'button',
              {
                key: entry.id,
                type: 'button',
                role: 'tab',
                'aria-selected': entry.id === variantId ? 'true' : 'false',
                className: 'wbs-tab',
                onClick: () => setTab(entry.id),
              },
              entry.id === 'workbuddy-ai' ? t('tabAi') : t('tabCn'),
              ` · ${entry.displayName}`,
            ),
          ),
        ),
        error !== undefined ? h('div', { className: 'wbs-card' }, h('div', { className: 'wbs-alert' }, error)) : null,
        active?.provider !== undefined && active.provider !== 'registered'
          ? h(
              'div',
              { className: 'wbs-card' },
              h('h3', { className: 'wbs-card-title' }, t('libraryFailed')),
              h('p', { className: 'wbs-hint' }, String(active.provider)),
            )
          : null,
        h(LoginPanel, { t, rpc, variantId, status: active, onSignedIn: load }),
        h(QuotaCard, {
          t,
          signedIn: active?.signedIn === true,
          usage: state.usage,
          error: state.usageError,
          loading: state.usageLoading,
          onRefresh: state.loadUsage,
          rpc,
          variantId,
          region: active?.region,
          onClaimed: () => void state.loadUsage(true),
        }),
        h(ModelsCard, {
          t,
          signedIn: active?.signedIn === true,
          value: state.models,
          error: state.modelsError,
          catalogError: active?.catalogError,
          loading: state.modelsLoading,
          onRefresh: state.loadModels,
        }),
        active?.signedIn === true
          ? h(
              'div',
              { className: 'wbs-actions' },
              h(
                'button',
                { type: 'button', className: 'wbs-btn', onClick: logout, disabled: busy },
                t('logout'),
              ),
              h('span', { className: 'wbs-hint' }, t('logoutHint')),
            )
          : null,
      )
    }

    return {
      inject: ['slots', 'locale', 'connection'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { zh: ZH, en: EN }),
          'workbuddy-subscription: copy',
        )
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-workbuddy-subscription'
          tag.textContent = STYLE
          document.head.append(tag)
          return () => tag.remove()
        }, 'workbuddy-subscription: style')

        const connection = ctx.get('connection')
        const rpc = createRpc(connection)
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'workbuddy-subscription',
              order: 16,
              label: () => t('nav'),
              locale: NS,
              inject: () => ({ t, rpc }),
            },
            WorkBuddySection,
          ),
        )
      },
    }
  },
})
