# 场景补录

线上只用来补快照。
补完立刻回到 `pnpm test`。

## 原始抓包长什么样

`pnpm ingest` 读取一个 JSON 文件，字段如下：

```ts
{
  source: "semrush" | "similarweb",
  pageType: string,
  subject: string,
  url: string,
  title: string,
  locale?: string,
  actions?: Array<{ type: "goto" | "wait" | "click" | "note", ... }>,
  html: string,
  calls: Array<{
    url: string,
    method?: string,
    status?: number,
    contentType?: string,
    request?: unknown,
    text?: string
  }>
}
```

页面钩子在 `page-hook.js`。
它会包住 `fetch` 和 `XMLHttpRequest`。
必须在整页加载前注入，Similarweb 这种 hash 路由要先 `Page.reload`。

## Ego Browser 补录要点

- 复用已经登录的任务空间，不要新建一个没 cookie 的空间。
- Semrush 打开 `https://sem.3ue.co/...`
- Similarweb 打开 `https://sim.3ue.co/#/...`
- 等到页面正文里出现目标域名和关键指标，再导出 `html` 和 `calls`
- 原始文件写到仓库的 `tmp/`，不要提交
- 然后执行 `pnpm ingest tmp/raw-....json`

## 入库后检查

- `scene.json` 里的 URL 不再带 `__gmitm`
- `dom.html` 里没有 `<script>`
- `network/` 里能看到 `dpa/rpc` 或 `widgetApi`
- `pnpm test` 通过
