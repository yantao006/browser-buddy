# browser-buddy

给人和 agent 用的操作手册。
读完这份就可以安装插件、打开正确页面、点导出、确认下载完成。
不要猜按钮文案，下面写的都是页面上的原句。

仓库：https://github.com/yantao006/browser-buddy
Release：https://github.com/yantao006/browser-buddy/releases
当前插件版本看 `extensions/bb-similarweb-keywords/manifest.json` 的 `version`。

---

## 0. Agent 必须遵守的硬约束

1. 只在已登录的 `https://sim.3ue.co` 和 `https://sem.3ue.co` 上操作。
2. 只装卸名字以 `BB ` 开头的扩展。
3. 不要在页面上注入浮层。
4. 导出只点工具栏里的插件图标，或向页面 `postMessage`（见第 4 节）。
5. 下载由 `chrome.downloads` 完成，`saveAs: false`，冲突时自动改成 `文件名 (1).zip`。
6. 长导出必须保持 **插件弹窗开着**，并且 **不要关掉、不要刷新当前报告页**。
7. 弹窗下方出现「下载完成」才算成功。
8. 若弹窗写「这一页还不支持导出」，立刻停，去第 3 节打开对应 URL。
9. 不要一次抽过多页，以免 3ue / Similarweb 限流。

---

## 1. 安装插件

### 1.1 从 GitHub Release 装

1. 打开 https://github.com/yantao006/browser-buddy/releases/latest
2. 下载 `bb-similarweb-keywords-*.zip`
3. 解压，得到目录 `bb-similarweb-keywords/`，里面必须有 `manifest.json`
4. 打开 `chrome://extensions`（Chrome 或 Ego 都可以）
5. 打开「开发者模式」
6. 点「加载已解压的扩展程序」
7. 选中刚解压的 `bb-similarweb-keywords` 目录
8. 确认卡片标题是 `BB Similarweb Keywords`，且已启用

### 1.2 从本仓库源码装

目录是：

```
extensions/bb-similarweb-keywords/
```

同样用「加载已解压的扩展程序」选这个目录。
改过源码后，在 `chrome://extensions` 对该卡片点刷新，然后 **刷新业务页面**，新 content script 才会生效。

### 1.3 装好后的检查

- 打开任意 `https://example.com`，点插件图标：弹窗只显示适用页面列表，没有导出按钮。
- 打开下面某一节的 URL，点插件图标：出现蓝色导出按钮和文件名输入框。

---

## 2. 通用导出流程（所有页面都一样）

1. 浏览器已登录 3ue。
2. 当前标签页停在目标报告，表格或卡片已经渲染出来。
3. 点工具栏 `BB Similarweb Keywords` 图标。
4. 看弹窗：
   - 有蓝色主按钮 → 页面识别成功，记下按钮文案，确认和第 3 节一致。
   - 只有「这一页还不支持导出」→ 停，换 URL。
5. 需要时改「文件名」。
6. 有「页数」下拉时，默认 5。可以改。不要无故选全部。
7. 点蓝色导出按钮。
8. 弹窗会变成「开始导出 / 正在导出…」。
9. **不要关弹窗，不要关、不要刷新报告页。**
10. 等到弹窗出现以「下载完成」开头的状态。
11. 到系统下载目录核对文件。
    macOS 一般是 `~/Downloads/`。

默认文件名格式：

```
{产品}-{平台}-{内容}-{YYYY-MM-DD}.csv
{产品}-{平台}-{内容}-{YYYY-MM-DD}.zip
```

产品一般是域名或种子关键词。
平台是 `similarweb` 或 `semrush`。
zip 里的文件夹会把域名里的点改成连字符，例如 `seedream-4.ai` → `seedream-4-ai/`。

---

## 3. 按页面操作

先打开 URL，等正文和表格出来，再点插件。
URL 里的 `__gmitm=` 是 3ue 会话参数，agent 沿用当前登录标签页里已有的即可，不要编造。

### 3.1 Similarweb 自然搜索关键词表

识别：页面有关键词表格，URL 在 `sim.3ue.co`，且不是下面其他专用页。
弹窗按钮：`导出关键词表格到 CSV`
有页数下拉，默认 5。
从第 1 页开始抽。
产出：一个 CSV。
默认名：`{域名}-similarweb-organic-keywords-{日期}.csv`

### 3.2 Similarweb 关键词生成器

打开类似：

```
https://sim.3ue.co/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?searchEngine=google&keyword=sephiria&webSource=Total&isWWW=*&tab=phraseMatch
```

`keyword=` 是种子词。
`tab=phraseMatch` 是「语句匹配」。插件抽 **当前这个 tab 的表**，不会自动换 tab。
弹窗按钮：`导出关键词生成器到 CSV`
有页数下拉，默认 5。
产出：一个 CSV。
列：序号、关键词、28天体量、平均体量、年趋势、零点击搜索、KD、意图、CPC。
年趋势多半是图，单元格可能空或 `N/A`。
默认名：`{种子词}-similarweb-keyword-generator-{日期}.csv`

### 3.3 Similarweb 网站表现

URL 含 `website-performance`。
弹窗按钮：`导出网站表现到 CSV`
没有页数。
产出：一个长表 CSV（板块、项目、指标、数值、变动、备注）。
默认名：`{域名}-similarweb-website-performance-{日期}.csv`

### 3.4 Similarweb 着陆页（五大父域）

这是最容易做错的流程。
按顺序做，不要跳。

**A. 打开着陆页工具**

URL 必须含 `landing-pages-v2`。
例如：

```
https://sim.3ue.co/#/organicsearch/pageAnalysis/landing-pages-v2/*/999/28d?key=vercel.app&webSource=Total&selectedPageTab=Organic
```

标题一般是「着陆页」。

**B. 填入五个父域（需要挖子域名时）**

五个域名固定为：

```
vercel.app
github.io
netlify.app
web.app
pages.dev
```

点插件图标，再点灰色按钮 `填入五个域名并搜索`。
弹窗提示「已换成五个域名，着陆页正在刷新。不自动导出。」
等页面刷新、五个域名 chip 出现、表格出来。
这一步会把 URL 时间段改成 `28d`。
**不会自动开始导出。**

**C. 导出**

再点插件图标。
按钮必须是 `导出着陆页到 ZIP`。
点它。

插件会自己做这些事，agent 不要抢着重做：

1. 点右上角日期下拉，选 **「最后 28 天数」**（已经是 28 天就跳过）。
2. 按当前页上的域名 tab 逐个导出。
3. 每个域名最多 5 页列表。
4. 第 1 页一定抽。
5. 当页最后一条点击量 &lt; 10k，或已经 5 页，停止翻页。
6. 点击量 ≥ 10k 的行，再抽日趋势（「天」）和关键词（最多 5 页）。
7. 失败的行写入 `{domain}-失败.csv`，然后继续，不要整份任务当失败。

产出：一个 zip。
默认名：`{当前选中域名}-similarweb-landing-pages-{日期}.zip`
包内按父域分文件夹，点号变连字符：

```
vercel-app/vercel-app-汇总.csv
vercel-app/vercel-app-趋势.csv
vercel-app/vercel-app-关键词.csv
github-io/...
```

导出过程可能要很多分钟。
弹窗会显示正在切哪个域名、抽哪条着陆页。
必须等「下载完成」。

若弹窗报「切不到最后 28 天数」，先手动点右上角日期选「最后 28 天数」，表格刷新后再点导出。

### 3.5 Semrush 域名概览

打开类似：

```
https://sem.3ue.co/analytics/overview/?q=seedream-4.ai&searchType=domain
```

弹窗按钮：`导出域名概览到 ZIP`
产出 zip：SEO 卡片、AI 可见度、流量/关键词趋势、反向链接预览。
不含「编入索引」、不含自然关键词大表、不含竞争对手表。
默认名：`{域名}-semrush-overview-{日期}.zip`

### 3.6 Semrush 引荐域名

URL 含 `/analytics/refdomains/`。
弹窗按钮：`导出引荐域名到 CSV`
插件会把筛选打到「所有」（含活跃/新增/丢失、Follow/Nofollow），并翻完全部分页。
产出：一个 CSV。
默认名：`{域名}-semrush-refdomains-{日期}.csv`

### 3.7 Semrush 反向链接分析

打开类似：

```
https://sem.3ue.co/analytics/backlinks/overview/?q=seedream-4.ai&searchType=domain
```

或同一报告下的反向链接 / 出站域名 tab。
弹窗按钮：`导出反向链接到 ZIP`
插件会自己点报告 tab，不要用 `location.assign` 换页（会杀掉 content script）。
产出 zip：

- 概览 KPI
- 一年的引荐域名趋势、反向链接趋势
- 「最佳」反向链接（会翻页）
- 出站域名（会翻页）

默认名：`{域名}-semrush-backlinks-{日期}.zip`

### 3.8 Semrush 自然排名

打开类似：

```
https://sem.3ue.co/analytics/organic/positions/?db=us&q=seedream-4.ai&searchType=domain
```

弹窗按钮：`导出自然排名到 ZIP`
插件会抽两个 tab，都翻完：

- 排名 → `…-自然排名.csv`
- 竞争对手 → `…-自然搜索竞争对手.csv`

保持页面当前国家和筛选，不要改成别的国家。
默认名：`{域名}-semrush-organic-{日期}.zip`

---

## 4. Agent 用脚本触发导出（Ego / CDP）

弹窗点按钮和页面消息是同一条导出链路。
长任务不要 `await` 整个导出函数，会超时。

在 **当前报告页** 的页面 JS 里：

```js
document.documentElement.dataset.bbExport = ''
document.documentElement.dataset.bbProgress = ''
window.postMessage({
  type: 'bb-sw-export',
  filename: 'example-semrush-organic-2026-08-20.zip',
  pages: 5
}, '*')
```

然后轮询：

```js
({
  progress: document.documentElement.dataset.bbProgress || '',
  exportData: document.documentElement.dataset.bbExport || ''
})
```

- `bbProgress` 是 JSON，例如 `{"stage":"duration"}`、`{"stage":"positions","domain":"seedream-4.ai"}`
- `bbExport` 有值后 `JSON.parse`。
- `ok: true` 才算成功，记下 `filename`。
- `ok: false` 把 `error` 原文回报，不要重试乱点。

着陆页填五个域名：

```js
window.postMessage({ type: 'bb-sw-fill-domains' }, '*')
```

结果在 `document.documentElement.dataset.bbFill`。

改过插件源码后必须：

1. 在 `chrome://extensions` 刷新该扩展
2. 刷新业务页

只刷新扩展、不刷新业务页，页面里仍是旧 content script。

不要对 Similarweb 的 hash 路由只用 `location.assign` 切 Semrush tab。
Semrush 报告 tab 是 `button[role=tab]`，点 tab，不要 `pushState`。

---

## 5. 着陆页筛选脚本

这不是插件。
它吃插件导出的着陆页 zip，按规则打分，写出候选 CSV。

```bash
python3 tools/landing-screen/screen.py ~/Downloads/xxx-similarweb-landing-pages-YYYY-MM-DD.zip
```

或解压 Release 里的 `landing-screen-*.zip` 后，在该目录运行 `python3 screen.py <zip>`。

需要 Python 3，无第三方依赖。
默认把候选 CSV 写到和输入 zip 同一目录：`landing-candidates-YYYY-MM-DD.csv`。

自检：

```bash
cd tools/landing-screen && python3 screen_test.py
```

---

## 6. 失败时怎么判断

| 现象 | 处理 |
|---|---|
| 弹窗只有适用页面列表 | 当前 URL 不是第 3 节里的报告 |
| 按钮文案和预期不符 | 停在了错误的 tab，打开正确 URL 再点 |
| 「切不到最后 28 天数」 | 手动选右上角「最后 28 天数」，等表格刷新再导出 |
| 弹窗一直停在「正在导出」 | 确认弹窗没关、页面没刷新；着陆页可能要很久 |
| 下载文件名带 ` (1)` | 正常，Chrome uniquify，用最新那个 |
| 出站域名 CSV 列对不上 | 旧版 bug，必须用 ≥ 0.9.14 |
| 着陆页像历史月份 | 旧版没切 28 天，必须用 ≥ 0.9.14 |
| 3ue 502 | 先回 3ue 首页，再打开报告，不要死刷 |

---

## 7. 仓库里还有什么（一般不用）

- `extensions/bb-similarweb-keywords/` 插件源码
- `tools/landing-screen/` 筛选脚本
- `src/`、`tests/`、`fixtures/` 早期 harness，不是日常导出路径
