# 上架 DSH 插件市场（dshmarket）

> **一句话**：把你这个插件推到**自己的 GitHub 仓库**，再去 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> 提一个 PR，新增**一个文件** `data/plugins/<owner>__dsh-usage-monitor.yml`。
> 市场（dshmarket）和官网都由这个仓库的 CI 自动生成 —— 不要改 README、不要改 plugins.json / index.json，也不要给 dsh-market 仓库提 PR。

## 已完成（2026-11-05，用 Alvin-Sun6612 账号自动完成）

| 步骤 | 状态 |
| --- | --- |
| 建公开仓库 <https://github.com/Alvin-Sun6612/dsh-usage-monitor> | ✅ 15 个文件已推送，默认分支 `main` |
| 加 `dsh-plugin` topic（另有 deepseek-harness / token-usage / usage-monitor） | ✅ |
| 发 Release `v0.1.0`，附件 `dsh-usage-monitor-0.1.0.tgz`（23864 B） | ✅ 免 git 安装用的就是它 |
| fork <https://github.com/Alvin-Sun6612/awesome-dsh-plugin> | ✅ |
| 分支 `add-dsh-usage-monitor` 上提交 `data/plugins/Alvin-Sun6612__dsh-usage-monitor.yml` | ✅ 已含 `icon` 与 `tarball` |
| **提 PR** | ⏸ 待办：上游 CI 要求**仓库创建满 1 天**（`scripts/check-submission.mjs` 的 `MIN_AGE_DAYS = 1`），仓库建于 2026-11-05 13:38（CST），所以 **2026-11-06 13:38 之后**点下面这个链接提交即可（标题正文都已在下面模板里）：<br><https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/compare/main...Alvin-Sun6612:add-dsh-usage-monitor?expand=1> |

> 注：本机到 `github.com` 的直连会超时（`api.github.com` 与 `raw.githubusercontent.com` 可用），所以在**这台机器**上 `github:` 直装、以及从 Release URL 装都会卡在下载；换个网络或让用户自己机器装不受影响（tgz 直装的流程已用本地 tgz 在临时 profile 验证通过）。

本机目前**没有 git / gh / npm**，所以要么装工具，要么全在 GitHub 网页上操作，要么把 GitHub Token 交给我用 API 完成（见最后一节）。

---

## 0. 前置条件（缺一项 CI 就会红）

| 要求 | 本插件状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle`（只声明 `dsh.client` 会被拒） | ✅ 已有 |
| 仓库根目录有 `cordis.patch.yml` | ✅ 已有 |
| 代码真实可用 | ✅ 19 项契约测试 + 实测数据 |
| 仓库创建满 1 天 | ⬜ 新建仓库后等 1 天再提 PR |
| 仓库加 `dsh-plugin` topic | ⬜ 建仓库时加 |
| 描述属实、不堆营销词 | ✅ |

---

## 1. 建仓库并把插件推上去

仓库内容 = `dsh-usage-monitor/` 目录里的全部文件（`package.json`、`cordis.patch.yml`、`index.js`、`client.js`、`locale/`、`icon.svg`、`icon.png`、`icon-180.png`、`README.md`、`LICENSE`、`install.ps1`、`test/`）。

### 方式 A：网页上传（不用装 git）

1. GitHub → New repository → 名字 `dsh-usage-monitor`，Public，**不要**勾选初始化 README。
2. 进入仓库 → `Add file` → `Upload files` → 把上面那些文件和目录拖进去 → Commit。
3. 仓库 → 右上 `About` 齿轮 → Topics 填 `dsh-plugin`。
4. 记下 `owner`（你的用户名，大小写要和 URL 一致）。

### 方式 B：装了 git 之后

```powershell
cd D:\backup\DSH资料库\dsh-usage-monitor
git init -b main
git add .
git commit -m "feat: dsh-usage-monitor 0.1.0"
git remote add origin https://github.com/<owner>/dsh-usage-monitor.git
git push -u origin main
```

---

## 2. 提 PR：新增 `data/plugins/<owner>__dsh-usage-monitor.yml`

1. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>。
2. 在你 fork 的 `main` 上：`Add file` → `Create new file`，路径填
   `data/plugins/<owner>__dsh-usage-monitor.yml`（`owner` 换成你的用户名）。
3. 内容见 `market/entry.yml`（已按规范写好，记得替换 `<owner>`）：

```yaml
url: https://github.com/<owner>/dsh-usage-monitor
name: <owner>/dsh-usage-monitor
category: usage
description:
  en: 'Token usage monitor: shows token usage and the DeepSeek account balance in a panel.'
  zh: '用量监视器：在面板中显示 token 用量与 DeepSeek 账号余额。'
icon: https://raw.githubusercontent.com/<owner>/dsh-usage-monitor/main/icon.png
```

> 规则提醒：描述里出现 `: `（半角冒号+空格）必须整行加引号；`icon` 只能是 GitHub 上托管的 png/jpg/webp（**svg 不收**，所以这里用 `icon.png`）；一个 PR 最多 3 条；不要顺手改 README（历史上导致大量 PR 冲突）。

4. 开 PR：标题 `Add <owner>/dsh-usage-monitor (usage)`，正文用 `market/entry.yml` 下面那段模板。
5. 合并后官网与市场自动重建，市场每次打开实时拉 `https://awesome-dsh-plugin.com/plugins.json`，通常**一天内**可搜到；不发 npm 也能收录，市场里显示的安装命令是
   `dsh plugin --profile web add github:<owner>/dsh-usage-monitor`。

### PR 正文模板

```markdown
## 新增条目

- 仓库：https://github.com/<owner>/dsh-usage-monitor
- 分类：`usage`
- 功能：DSH 侧边栏面板，按天统计本机会话的 token 用量（今日/近 7 天/近 30 天、缓存命中率、近 30 天柱状图），并显示 DeepSeek 账号余额
- 许可：MIT；无构建步骤（index.js + client.js + cordis.patch.yml + locale/*.json）
- 隐私：只读本机 ~/.dsh/sessions；只有配置了 API Key 才请求 api.deepseek.com/user/balance

## 自检

- [x] `package.json` 已声明 `dsh.bundle`（patch: ./cordis.patch.yml）
- [x] 仓库根目录含 `cordis.patch.yml`
- [x] 仓库已创建满 1 天
- [x] 已添加 `dsh-plugin` topic
- [x] 本 PR 只新增 `data/plugins/<owner>__dsh-usage-monitor.yml`
```

---

## 3. 想更快被搜到：可选发 npm

发 npm 不影响收录结果，但能让市场显示下载量，并进入 `index.json`（DSH 0.2.1+ 的 Plugins → Discover 索引）。
`package.json` 里补 `repository` 字段后：

```powershell
npm publish              # 需要 npm 账号 + 邮箱验证
```

---

## 4. 让我用 GitHub API 直接做完（需要你给 Token）

给我一个 **Fine-grained PAT**（或 classic PAT），权限只需：

- `repo`（创建仓库、推送文件）
- `public_repo` 足够；如果要 fork+PR，classic PAT 的 `repo` scope 即可

我会：建仓库 → 用 Contents API 推送全部文件 → 加 `dsh-plugin` topic → fork awesome-dsh-plugin → 新建 `data/plugins/<owner>__dsh-usage-monitor.yml` → 提 PR，然后把 PR 链接给你。
⚠️ Token 只会用于这一步；用完整理建议你用完就撤销。
