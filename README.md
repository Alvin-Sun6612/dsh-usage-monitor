# dsh-usage-monitor · 用量与余额

DSH（DeepSeek Harness）插件：在侧边栏开一个面板，按天统计本机会话的 **token 用量**，并显示 **DeepSeek 账号余额**。

- 今日 / 近 7 天 / 近 30 天 / 累计的 token 总量、调用次数、缓存命中率
- 今日明细：未缓存输入、缓存命中、输出
- 近 30 天柱状图（悬停看当天数值）
- 余额卡片：需要 DeepSeek API Key，在面板里粘贴即可（存在本机）

> 说明：余额接口 `/user/balance` 只认 **API Key**（`sk-...`）。如果你只在 DSH 里登录了 DeepSeek 账号，面板会显示「未配置 API Key」；去 <https://platform.deepseek.com/api_keys> 建一个，余额就会显示。用量统计不需要 Key。

## 安装

### 方式一：本机目录（开发用）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
# 或指定 profile：-Profile web
```

装完**重启 DSH**，侧边栏出现「用量与余额」。

### 方式二：发给别人（推荐用 Release 里的 tgz，不需要 git、不需要 npm）

```powershell
# 直接装 Release 附件（推荐）
dsh plugin --profile desktop add "https://github.com/Alvin-Sun6612/dsh-usage-monitor/releases/download/v0.1.0/dsh-usage-monitor-0.1.0.tgz"

# 手上有 tgz 文件时
dsh plugin --profile desktop add .\dsh-usage-monitor-0.1.0.tgz

# 仓库装了 git 时也可以用 GitHub 直装（pnpm 会走 git，需 allowBuilds 授权）
dsh plugin --profile desktop add github:Alvin-Sun6612/dsh-usage-monitor
```

市场（dshmarket）条目已准备好：`data/plugins/Alvin-Sun6612__dsh-usage-monitor.yml`，收录后可直接在市场里搜「用量与余额 / usage monitor」。

卸载：`dsh plugin --profile desktop remove dsh-usage-monitor`

## 它读什么、发什么

| 项目 | 说明 |
| --- | --- |
| 数据来源 | `~/.dsh/sessions/<工作区>/<会话>/*.jsonl.zstd`，只读 |
| 解析内容 | `assistant/message` 事件的 `usage`（inputTokens / cacheReadTokens / cacheWriteTokens / outputTokens）与事件时间 |
| 本地服务 | 插件在 `127.0.0.1:46850` 起只读 HTTP 服务，只有本机浏览器页能访问（CORS 只放行 localhost） |
| 联网 | 只有你配置了 API Key 后，才会请求 `https://api.deepseek.com/user/balance`；用量统计完全离线 |
| Key 存放 | `~/.dsh/dsh-usage-monitor.json`（权限 0600），面板不回显、不记录 |
| 缓存 | 会话文件按 (mtime, size) 缓存解析结果；余额结果缓存 60 秒 |

端口被占用时，在面板底部把端口改掉即可（浏览器端记住设置）；也可以在 `~/.dsh/dsh-usage-monitor.json` 写 `{"port": 46851}`。

## 目录结构

```
dsh-usage-monitor/
├─ package.json          # dsh.bundle + dsh.client 声明，exports 四项
├─ cordis.patch.yml      # 组合包补丁：insert id=usage-monitor
├─ index.js              # Host 半：解析 zstd 会话日志 + 余额代理 + 本地 HTTP 服务
├─ client.js             # 浏览器半：侧边栏面板（无构建，React.createElement）
├─ locale/{zh,en}.json   # 面板名与描述
├─ icon.svg / icon.png   # 图标
├─ install.ps1           # 一键安装（UTF-8 BOM）
└─ test/smoke.mjs        # 契约测试：node test/smoke.mjs
```

## 开发与自测

```powershell
# 1. 不用 DSH 直接起 Host 半，浏览器/curl 访问
node index.js
# http://127.0.0.1:46850/health
# http://127.0.0.1:46850/summary?days=30
# http://127.0.0.1:46850/balance

# 2. 浏览器半契约测试（19 项）
node test/smoke.mjs
```

`/summary` 返回结构（节选）：

```json
{
  "sessions": 22, "scanned": 22, "parsed": 22, "scanMs": 465,
  "today":  { "requests": 525, "totalTokens": 43301332, "cacheHitRate": 0.982 },
  "last7":  { "...": "同上结构" },
  "last30": { "...": "同上结构" },
  "allTime":{ "...": "同上结构" },
  "series": [{ "date": "2026-11-05", "totalTokens": 43301332 }]
}
```

## 改个名字 / 换成自己的功能

1. `package.json`：`name`、`description`、`keywords`、`repository` 换成你的；`dsh.bundle.patch` 保持不变。
2. `cordis.patch.yml`：`id` 与 `name` 与包名保持一致。
3. `client.js`：`NS`、`PANEL_ID`、`PORT_KEY`、CSS 前缀 `dsh-um-*` 建议一起换，避免和别的插件撞。
4. `locale/*.json` 的 `meta.title` / `meta.description` 就是市场卡片文案。

## 发布给别人

### 1) npm

```powershell
npm publish            # 需要先 npm login，且 package.json 里有 repository
```

发布后别人 `dsh plugin --profile desktop add dsh-usage-monitor` 即可。

### 2) 直接给 tgz

```powershell
pnpm pack              # 产出 dsh-usage-monitor-0.1.0.tgz，发文件给对方
```

### 3) 上架 DSH 插件市场（dshmarket）

> 结论：**不要**给 `dsh-market` 仓库提 PR，也不要手改 README / plugins.json / index.json —— 它们都是 CI 生成的。
> 唯一动作：往 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> 提交**一个新文件** `data/plugins/Alvin-Sun6612__dsh-usage-monitor.yml`。

前置条件（缺一项 CI 会红）：

- [ ] 插件已放在**你自己的 GitHub 仓库**里（本目录内容推到仓库根目录）
- [ ] `package.json` 声明了 `dsh.bundle`（本插件已有）
- [ ] 仓库根目录有 `cordis.patch.yml`（已有）
- [ ] 仓库创建满 1 天，且加了 `dsh-plugin` topic
- [ ] 代码真实可用（不是占位）

条目模板（放到 `data/plugins/Alvin-Sun6612__dsh-usage-monitor.yml`）：

```yaml
url: https://github.com/Alvin-Sun6612/dsh-usage-monitor
name: Alvin-Sun6612/dsh-usage-monitor
category: usage
description:
  en: 'Token usage monitor: shows token usage and the DeepSeek account balance in a panel.'
  zh: '用量监视器：在面板中显示 token 用量与 DeepSeek 账号余额。'
```

- `category` 用 `usage`；描述里 `: ` 必须加引号；`icon` 可选，只能是 GitHub 托管的 png/jpg/webp（**svg 不收**）。
- 一个 PR 最多 3 条。合并后站点与市场自动重建，通常一天内可搜到；不发 npm 也能收录（市场里显示 `dsh plugin --profile web add github:Alvin-Sun6612/dsh-usage-monitor`）。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 面板提示「读不到本地服务的数据」 | 插件没随 DSH 重启加载，或 Host 半端口被占。重启 DSH；必要时在面板底部改端口 |
| 余额一直是「未配置 API Key」 | 用的是账号登录而非 API Key。去 platform.deepseek.com 建 Key 粘贴进面板 |
| 余额显示 HTTP 401 | Key 无效或已被删除；重新生成 |
| 今日用量为 0，但确实在用 | 面板按本机时区分桶；刚产生的调用需要点「刷新」清缓存 |
| 中文乱码 / JSON 解析失败 | PowerShell 5.1 读文件要加 `-Encoding UTF8`；`.ps1` 存成 UTF-8 with BOM |
| 装完看不到入口 | Desktop 版 profile 固定为 `desktop`；确认 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 含 `dsh-usage-monitor` |

## License

MIT
