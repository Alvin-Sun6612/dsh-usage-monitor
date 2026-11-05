/**
 * dsh-usage-monitor —— 插件浏览器半（面板）。
 *
 * 面板数据来自 Host 半在 127.0.0.1 上起的只读服务（默认端口 46850）：
 *   GET  /summary  按天聚合的 token 用量
 *   GET  /balance  DeepSeek 余额（需要 API Key）
 *   POST /config   保存 API Key（写入 ~/.dsh/dsh-usage-monitor.json）
 *
 * 这里不直接读任何磁盘文件，也拿不到 API Key —— 面板只显示金额。
 */
window.__ModuleLoader__.load({
  id: 'dsh-usage-monitor',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'usageMonitor'
    const PANEL_ID = 'usage-monitor'
    const DEFAULT_PORT = 46850
    const PORT_KEY = 'dsh.usageMonitor.port'

    const zh = {
      panel: '用量与余额',
      title: '用量与余额',
      subtitle: '按天统计 token 用量，并查看 DeepSeek 账号余额',
      refresh: '刷新',
      loading: '正在读取本机会话日志…',
      today: '今日',
      last7: '近 7 天',
      last30: '近 30 天',
      requests: '次调用',
      tokens: 'tokens',
      cacheHit: '缓存命中率',
      breakdown: '今日明细',
      input: '未缓存输入',
      cacheRead: '缓存命中',
      output: '输出',
      chart: '近 30 天',
      balance: '账号余额',
      balanceLoading: '正在查询余额…',
      balanceEmpty: '未配置 API Key',
      balanceHint: '余额来自 DeepSeek 官方 /user/balance，需要 API Key（在 platform.deepseek.com 创建）。填入后只保存在本机 ~/.dsh/dsh-usage-monitor.json。',
      keyPlaceholder: 'sk-...',
      save: '保存并查询',
      saving: '保存中…',
      saved: '已保存',
      invalidKey: 'API Key 格式不对，应以 sk- 开头',
      available: '可用',
      unavailable: '余额不足或已停用',
      port: '端口',
      portHint: 'Host 半监听的本地端口，改完点刷新',
      errorHost: '读不到本地服务的数据。请确认插件已随 DSH 重启加载；若端口被占用，可在下方改端口。',
      privacy: '只在本机读取 ~/.dsh/sessions 下的会话日志；不联网，除非你配置了余额查询。',
      days: '天',
      noData: '还没有可统计的会话记录',
      generated: '更新于',
    }

    const en = {
      panel: 'Usage & Balance',
      title: 'Usage & Balance',
      subtitle: 'Daily token usage and your DeepSeek account balance',
      refresh: 'Refresh',
      loading: 'Reading local session logs…',
      today: 'Today',
      last7: 'Last 7 days',
      last30: 'Last 30 days',
      requests: 'calls',
      tokens: 'tokens',
      cacheHit: 'Cache hit rate',
      breakdown: 'Today breakdown',
      input: 'Uncached input',
      cacheRead: 'Cache hits',
      output: 'Output',
      chart: 'Last 30 days',
      balance: 'Balance',
      balanceLoading: 'Checking balance…',
      balanceEmpty: 'No API key configured',
      balanceHint: 'Balance comes from DeepSeek /user/balance and needs an API key (create one at platform.deepseek.com). It is stored only on this machine in ~/.dsh/dsh-usage-monitor.json.',
      keyPlaceholder: 'sk-...',
      save: 'Save & check',
      saving: 'Saving…',
      saved: 'Saved',
      invalidKey: 'API key should start with sk-',
      available: 'Available',
      unavailable: 'Insufficient or disabled',
      port: 'Port',
      portHint: 'Local port used by the host half; refresh after changing',
      errorHost: 'Cannot reach the local service. Make sure the plugin is loaded after a DSH restart; if the port is taken, change it below.',
      privacy: 'Reads session logs under ~/.dsh/sessions on this machine only. No network unless you configure the balance check.',
      days: 'days',
      noData: 'No sessions to count yet',
      generated: 'Updated',
    }

    const css = `
.dsh-um-root{display:flex;flex-direction:column;gap:14px;padding:20px 22px;height:100%;overflow:auto;box-sizing:border-box;font-size:13px}
.dsh-um-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dsh-um-head h2{margin:0;font-size:17px;font-weight:600;color:var(--dsw-alias-text-primary,#111827)}
.dsh-um-sub{margin:4px 0 0;color:var(--dsw-alias-text-secondary,#6b7280);font-size:12px}
.dsh-um-btn{border:1px solid var(--dsw-alias-border,#e5e7eb);background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-text-primary,#111827);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer}
.dsh-um-btn:hover{background:var(--dsw-alias-bg-hover,#f3f4f6)}
.dsh-um-btn[disabled]{opacity:.55;cursor:progress}
.dsh-um-btn-primary{background:#22c55e;border-color:#22c55e;color:#fff}
.dsh-um-btn-primary:hover{background:#16a34a}
.dsh-um-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dsh-um-card{border:1px solid var(--dsw-alias-border,#e5e7eb);border-radius:12px;padding:12px 14px;background:var(--dsw-alias-bg-elevated,#fff);display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-um-card-label{font-size:12px;color:var(--dsw-alias-text-secondary,#6b7280)}
.dsh-um-card-value{font-size:22px;font-weight:650;letter-spacing:-.3px;color:var(--dsw-alias-text-primary,#111827);white-space:nowrap}
.dsh-um-card-meta{font-size:11px;color:var(--dsw-alias-text-secondary,#6b7280);display:flex;gap:10px;flex-wrap:wrap}
.dsh-um-section{border:1px solid var(--dsw-alias-border,#e5e7eb);border-radius:12px;padding:12px 14px;background:var(--dsw-alias-bg-elevated,#fff)}
.dsh-um-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-text-secondary,#6b7280);margin-bottom:10px}
.dsh-um-bars{display:flex;flex-direction:column;gap:8px}
.dsh-um-bar-row{display:grid;grid-template-columns:86px 1fr 78px;align-items:center;gap:10px;font-size:12px;color:var(--dsw-alias-text-secondary,#6b7280)}
.dsh-um-bar-track{height:8px;border-radius:999px;background:var(--dsw-alias-bg-subtle,#f3f4f6);overflow:hidden}
.dsh-um-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#22c55e,#0ea5e9)}
.dsh-um-bar-num{text-align:right;color:var(--dsw-alias-text-primary,#111827);font-variant-numeric:tabular-nums}
.dsh-um-chart{display:flex;align-items:flex-end;gap:4px;height:104px;padding-top:6px}
.dsh-um-col{flex:1;min-width:2px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative}
.dsh-um-col-inner{width:100%;border-radius:4px 4px 2px 2px;background:#60a5fa;min-height:2px}
.dsh-um-col:hover .dsh-um-tip{opacity:1}
.dsh-um-tip{position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:#111827;color:#fff;font-size:11px;padding:3px 6px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;z-index:3}
.dsh-um-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--dsw-alias-text-secondary,#9ca3af);margin-top:4px}
.dsh-um-balance{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.dsh-um-amount{font-size:24px;font-weight:650;color:var(--dsw-alias-text-primary,#111827)}
.dsh-um-pill{font-size:11px;border-radius:999px;padding:2px 8px;background:#dcfce7;color:#166534}
.dsh-um-pill-warn{background:#fef3c7;color:#92400e}
.dsh-um-keyrow{display:flex;gap:8px;margin-top:10px}
.dsh-um-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border,#e5e7eb);border-radius:8px;padding:6px 10px;font-size:12px;background:var(--dsw-alias-bg,#fff);color:var(--dsw-alias-text-primary,#111827)}
.dsh-um-hint{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-text-secondary,#6b7280);margin:8px 0 0}
.dsh-um-error{border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.6}
.dsh-um-foot{font-size:11px;color:var(--dsw-alias-text-secondary,#9ca3af);line-height:1.6;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dsh-um-port{display:flex;align-items:center;gap:6px}
.dsh-um-port input{width:72px;border:1px solid var(--dsw-alias-border,#e5e7eb);border-radius:6px;padding:3px 6px;font-size:11px;background:var(--dsw-alias-bg,#fff);color:var(--dsw-alias-text-primary,#111827)}
`

    function fmtNum(n) {
      const v = Number(n) || 0
      if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
      if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
      if (v >= 1e4) return (v / 1e3).toFixed(1) + 'K'
      return v.toLocaleString('en-US')
    }

    function pct(x) {
      return ((Number(x) || 0) * 100).toFixed(1) + '%'
    }

    function useStoredPort() {
      const [port, setPort] = React.useState(() => {
        try {
          return Number(window.localStorage.getItem(PORT_KEY)) || DEFAULT_PORT
        } catch {
          return DEFAULT_PORT
        }
      })
      const update = React.useCallback((next) => {
        const value = Math.max(1, Math.min(65535, Number(next) || DEFAULT_PORT))
        setPort(value)
        try {
          window.localStorage.setItem(PORT_KEY, String(value))
        } catch {
          /* ignore */
        }
      }, [])
      return [port, update]
    }

    function Card(props) {
      return h(
        'div',
        { className: 'dsh-um-card' },
        h('div', { className: 'dsh-um-card-label' }, props.label),
        h('div', { className: 'dsh-um-card-value' }, props.value),
        h(
          'div',
          { className: 'dsh-um-card-meta' },
          h('span', null, props.requests + ' ' + props.callsLabel),
          h('span', null, props.t('cacheHit') + ' ' + props.hit),
        ),
      )
    }

    function BarRow(props) {
      const value = Number(props.value) || 0
      const ratio = props.max > 0 ? Math.max(0.02, value / props.max) : 0
      return h(
        'div',
        { className: 'dsh-um-bar-row' },
        h('span', null, props.label),
        h('div', { className: 'dsh-um-bar-track' }, h('div', { className: 'dsh-um-bar-fill', style: { width: ratio * 100 + '%' } })),
        h('span', { className: 'dsh-um-bar-num' }, fmtNum(value)),
      )
    }

    function Panel(props) {
      const t = props.t
      const [port, setPort] = useStoredPort()
      const [portDraft, setPortDraft] = React.useState(String(port))
      const [state, setState] = React.useState({ loading: true, error: null, summary: null, balance: null })
      const [keyDraft, setKeyDraft] = React.useState('')
      const [keyState, setKeyState] = React.useState({ saving: false, message: '', tone: 'info' })

      const base = 'http://127.0.0.1:' + port

      const load = React.useCallback(
        async (force) => {
          setState((prev) => ({ ...prev, loading: !prev.summary, error: null }))
          const suffix = force ? '?force=1' : ''
          try {
            const summaryRes = await fetch(base + '/summary' + suffix, { headers: { Accept: 'application/json' } })
            if (!summaryRes.ok) throw new Error('HTTP ' + summaryRes.status)
            const summary = await summaryRes.json()
            setState((prev) => ({ ...prev, loading: false, error: null, summary }))
            try {
              const balanceRes = await fetch(base + '/balance' + suffix, { headers: { Accept: 'application/json' } })
              if (balanceRes.ok) {
                const balance = await balanceRes.json()
                setState((prev) => ({ ...prev, balance }))
              }
            } catch {
              /* 余额失败不影响用量 */
            }
          } catch (error) {
            setState((prev) => ({ ...prev, loading: false, error: error.message || String(error) }))
          }
        },
        [base],
      )

      React.useEffect(() => {
        load(false)
      }, [load])

      const saveKey = async () => {
        const value = keyDraft.trim()
        if (value && !/^sk-[A-Za-z0-9._-]{8,}$/.test(value)) {
          setKeyState({ saving: false, message: t('invalidKey'), tone: 'warn' })
          return
        }
        setKeyState({ saving: true, message: '', tone: 'info' })
        try {
          const res = await fetch(base + '/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: value }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(body.hint || body.error || 'HTTP ' + res.status)
          setKeyState({ saving: false, message: t('saved'), tone: 'info' })
          setKeyDraft('')
          load(true)
        } catch (error) {
          setKeyState({ saving: false, message: error.message || String(error), tone: 'warn' })
        }
      }

      const summary = state.summary
      const balance = state.balance
      const t2 = summary ? summary.today : null
      const cards = []
      if (summary) {
        cards.push(
          h(Card, {
            key: 'today',
            label: t('today'),
            value: fmtNum(t2.totalTokens),
            requests: t2.requests,
            callsLabel: t('requests'),
            hit: pct(t2.cacheHitRate),
            t,
          }),
          h(Card, {
            key: 'd7',
            label: t('last7'),
            value: fmtNum(summary.last7.totalTokens),
            requests: summary.last7.requests,
            callsLabel: t('requests'),
            hit: pct(summary.last7.cacheHitRate),
            t,
          }),
          h(Card, {
            key: 'd30',
            label: t('last30'),
            value: fmtNum(summary.last30.totalTokens),
            requests: summary.last30.requests,
            callsLabel: t('requests'),
            hit: pct(summary.last30.cacheHitRate),
            t,
          }),
        )
      }

      const todayMax = t2 ? Math.max(t2.input, t2.cacheRead, t2.output, 1) : 1

      const series = summary && summary.series ? summary.series.slice(-30) : []
      const seriesMax = series.reduce((max, item) => Math.max(max, item.totalTokens), 1)
      const chart = h(
        'div',
        { className: 'dsh-um-chart' },
        series.length
          ? series.map((item) =>
              h(
                'div',
                { className: 'dsh-um-col', key: item.date },
                h('div', { className: 'dsh-um-col-inner', style: { height: Math.max(3, (item.totalTokens / seriesMax) * 100) + '%' } }),
                h('div', { className: 'dsh-um-tip' }, item.date + ' · ' + fmtNum(item.totalTokens)),
              ),
            )
          : h('div', { className: 'dsh-um-sub' }, t('noData')),
      )

      const balanceNode = (() => {
        if (!balance) return h('div', { className: 'dsh-um-sub' }, t('balanceLoading'))
        if (!balance.configured) {
          return h(
            'div',
            null,
            h('div', { className: 'dsh-um-sub' }, t('balanceEmpty')),
            h('div', { className: 'dsh-um-keyrow' }, h('input', {
              className: 'dsh-um-input',
              placeholder: t('keyPlaceholder'),
              value: keyDraft,
              spellCheck: false,
              onChange: (event) => setKeyDraft(event.target.value),
            }), h('button', { className: 'dsh-um-btn dsh-um-btn-primary', disabled: keyState.saving, onClick: saveKey }, keyState.saving ? t('saving') : t('save'))),
            h('p', { className: 'dsh-um-hint' }, t('balanceHint')),
            keyState.message ? h('p', { className: 'dsh-um-hint', style: { color: keyState.tone === 'warn' ? '#b45309' : '#15803d' } }, keyState.message) : null,
          )
        }
        if (!balance.ok) {
          return h(
            'div',
            null,
            h('div', { className: 'dsh-um-balance' }, h('span', { className: 'dsh-um-amount' }, '—'), h('span', { className: 'dsh-um-pill dsh-um-pill-warn' }, balance.hint || balance.reason || 'error')),
            balance.detail ? h('p', { className: 'dsh-um-hint' }, String(balance.detail).slice(0, 200)) : null,
          )
        }
        const first = (balance.balances && balance.balances[0]) || { currency: 'CNY', total: '0' }
        return h(
          'div',
          null,
          h(
            'div',
            { className: 'dsh-um-balance' },
            h('span', { className: 'dsh-um-amount' }, (first.currency === 'USD' ? '$' : '¥') + first.total),
            h('span', { className: 'dsh-um-pill' + (balance.available ? '' : ' dsh-um-pill-warn') }, balance.available ? t('available') : t('unavailable')),
            h('span', { className: 'dsh-um-sub' }, first.currency),
          ),
          h('p', { className: 'dsh-um-hint' }, t('balanceHint')),
        )
      })()

      return h(
        'div',
        { className: 'dsh-um-root' },
        h(
          'div',
          { className: 'dsh-um-head' },
          h(
            'div',
            null,
            h('h2', null, t('title')),
            h('p', { className: 'dsh-um-sub' }, t('subtitle')),
          ),
          h('button', { className: 'dsh-um-btn', onClick: () => load(true), disabled: state.loading }, state.loading ? t('loading') : t('refresh')),
        ),

        state.error
          ? h(
              'div',
              { className: 'dsh-um-error' },
              t('errorHost'),
              h('div', { style: { marginTop: 6, opacity: 0.8 } }, state.error + ' · http://127.0.0.1:' + port),
            )
          : null,

        cards.length ? h('div', { className: 'dsh-um-cards' }, cards) : null,

        t2
          ? h(
              'div',
              { className: 'dsh-um-section' },
              h('div', { className: 'dsh-um-section-title' }, t('breakdown')),
              h(
                'div',
                { className: 'dsh-um-bars' },
                h(BarRow, { label: t('input'), value: t2.input, max: todayMax }),
                h(BarRow, { label: t('cacheRead'), value: t2.cacheRead, max: todayMax }),
                h(BarRow, { label: t('output'), value: t2.output, max: todayMax }),
              ),
            )
          : null,

        h(
          'div',
          { className: 'dsh-um-section' },
          h('div', { className: 'dsh-um-section-title' }, t('chart')),
          chart,
          series.length
            ? h(
                'div',
                { className: 'dsh-um-axis' },
                h('span', null, series[0].date),
                h('span', null, series[series.length - 1].date),
              )
            : null,
        ),

        h(
          'div',
          { className: 'dsh-um-section' },
          h('div', { className: 'dsh-um-section-title' }, t('balance')),
          balanceNode,
        ),

        h(
          'div',
          { className: 'dsh-um-foot' },
          h('span', null, t('privacy')),
          h(
            'span',
            { className: 'dsh-um-port' },
            t('port'),
            h('input', {
              value: portDraft,
              inputMode: 'numeric',
              onChange: (event) => setPortDraft(event.target.value),
              onBlur: () => {
                setPort(portDraft)
                setPortDraft(String(Math.max(1, Math.min(65535, Number(portDraft) || DEFAULT_PORT))))
              },
            }),
            h('button', { className: 'dsh-um-btn', onClick: () => load(true) }, t('refresh')),
          ),
        ),

        summary
          ? h(
              'div',
              { className: 'dsh-um-sub' },
              t('generated') + ' ' + new Date(summary.generatedAt).toLocaleTimeString() + ' · ' + summary.sessions + ' sessions',
            )
          : null,
      )
    }

    function PanelIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' },
        h('path', { d: 'M4 19V9' }),
        h('path', { d: 'M9 19V5' }),
        h('path', { d: 'M14 19v-7' }),
        h('path', { d: 'M19 19V8' }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usage-monitor.locale')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-dsh-usage-monitor', '')
          style.textContent = css
          document.head.appendChild(style)
          return () => style.remove()
        }, 'usage-monitor.styles')

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, () => h(Panel, { t })),
        )
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 24, label: () => t('panel'), locale: NS }, PanelIcon),
        )
      },
    }
  },
})
