/**
 * 浏览器半（client.js）的契约冒烟测试：不需要真的 DSH，用 vm + 桩跑一遍。
 * 运行：node test/smoke.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8')

const results = []
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail: detail === undefined ? '' : String(detail).slice(0, 200) })
}

/* ------------------------------- 桩 ------------------------------- */
let hookIndex = 0
const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat() }
  },
  useState(initial) {
    hookIndex += 1
    const value = typeof initial === 'function' ? initial() : initial
    return [value, () => {}]
  },
  useCallback(fn) {
    return fn
  },
  useEffect() {
    hookIndex += 1
  },
}

/** 把渲染树拍平成文本，方便断言。 */
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return textOf(node.children || [])
}

const head = { children: [] }
const documentStub = {
  head: {
    appendChild(node) {
      head.children.push(node)
    },
  },
  createElement() {
    return {
      tag: '',
      textContent: '',
      attributes: {},
      setAttribute(k, v) {
        this.attributes[k] = v
      },
      remove() {
        const index = head.children.indexOf(this)
        if (index >= 0) head.children.splice(index, 1)
      },
    }
  },
}

const sandbox = {
  window: { __ModuleLoader__: { load() {} } },
  document: documentStub,
  console,
  fetch: async () => ({ ok: false, status: 599, json: async () => ({}) }),
  setTimeout,
  clearTimeout,
}
sandbox.window.localStorage = {
  store: new Map(),
  getItem(k) {
    return this.store.has(k) ? this.store.get(k) : null
  },
  setItem(k, v) {
    this.store.set(k, String(v))
  },
}

let registeredModule = null
sandbox.window.__ModuleLoader__ = {
  load(def) {
    registeredModule = def.factory((id) => {
      if (id === 'react') return React
      throw new Error('unexpected require: ' + id)
    })
    registeredModule.__id = def.id
  },
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

check('调用了 window.__ModuleLoader__.load', Boolean(registeredModule))
check('插件 id 正确', registeredModule && registeredModule.__id === 'dsh-usage-monitor', registeredModule && registeredModule.__id)
check(
  'inject 声明了 slots + locale',
  registeredModule && Array.isArray(registeredModule.inject) && registeredModule.inject.includes('slots') && registeredModule.inject.includes('locale'),
  JSON.stringify(registeredModule && registeredModule.inject),
)
check('导出了 apply()', registeredModule && typeof registeredModule.apply === 'function')

/* ---------------------------- 模拟宿主 ctx ---------------------------- */
const slots = []
const locales = []
const effects = []
const ctx = {
  slots: {
    inject(name, cb) {
      cb()
    },
    register(row, component) {
      slots.push({ row, component })
    },
  },
  locale: {
    register(ns, dict) {
      locales.push({ ns, dict })
      return () => {}
    },
    bind(ns) {
      const dict = locales.find((item) => item.ns === ns)
      return (key) => (dict && dict.dict.zh && dict.dict.zh[key]) || key
    },
  },
  effect(fn, label) {
    effects.push({ label, dispose: fn() })
  },
}

registeredModule.apply(ctx)

check('注册了 2 个 slot（主面板 + 侧边栏）', slots.length === 2, `实际 ${slots.length}`)
const mainSlot = slots.find((s) => s.row && s.row.name === 'main')
const sideSlot = slots.find((s) => s.row && s.row.name === 'sidebar.panellist')
check('main slot key = usage-monitor', mainSlot && mainSlot.row.key === 'usage-monitor', mainSlot && mainSlot.row.key)
check('侧边栏 slot id = usage-monitor', sideSlot && sideSlot.row.id === 'usage-monitor', sideSlot && sideSlot.row.id)
check('侧边栏 order = 24', sideSlot && sideSlot.row.order === 24, sideSlot && sideSlot.row.order)
check('main slot 是可渲染函数', mainSlot && typeof mainSlot.component === 'function')

const locale = locales.find((item) => item.ns === 'usageMonitor')
check('注册了 usageMonitor 语言包', Boolean(locale))
check('中文标题存在', Boolean(locale && locale.dict.zh && locale.dict.zh.title), locale && locale.dict.zh && locale.dict.zh.title)
check('英文标题存在', Boolean(locale && locale.dict.en && locale.dict.en.title), locale && locale.dict.en && locale.dict.en.title)

const styleEffect = effects.find((item) => item.label === 'usage-monitor.styles')
check('注入了面板样式', head.children.length === 1 && /dsh-um-root/.test(head.children[0].textContent))
styleEffect.dispose()
check('卸载时移除了样式', head.children.length === 0)

const iconTree = sideSlot ? sideSlot.component() : null
check('侧边栏图标是 svg', iconTree && iconTree.type === 'svg', iconTree && iconTree.type)

/* 真正渲染一次 Panel，确认渲染期不抛错、标题在位。 */
let panelText = ''
let renderError = null
try {
  const element = mainSlot.component()
  const Panel = element.type
  hookIndex = 0
  panelText = textOf(Panel(element.props))
} catch (error) {
  renderError = error
}
check('渲染 Panel 不抛错', !renderError, renderError && renderError.message)
check('面板显示标题', /用量与余额/.test(panelText), panelText.slice(0, 80))
check('面板显示副标题', /按天统计 token 用量/.test(panelText), panelText.slice(0, 120))
check('面板带刷新入口', /刷新/.test(panelText))

/* ------------------------------- 汇总 ------------------------------- */
const failed = results.filter((item) => !item.ok)
for (const item of results) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail && !item.ok ? '  -> ' + item.detail : ''}`)
}
console.log('')
if (failed.length) {
  console.error(`${failed.length}/${results.length} 项失败`)
  process.exit(1)
}
console.log(`全部通过：${results.length}/${results.length}`)
