# Agent 手册

在真实的 3ue 包装站上做端到端开发和验证。
不要再把页面拷到本地模拟环境里当主测试路径。

## 怎么验

1. 用 Ego Browser 打开已经登录的 `sem.3ue.co` / `sim.3ue.co`。
2. 只装卸我们自己开发的插件，不要动用户已有的扩展。
3. 在真实页面上点插件、翻页、看结果。
4. 出问题就对着真实页面修，再验一遍。

装卸载走 `chrome://extensions` 的 `chrome.developerPrivate` / `chrome.management`。
只对名字以 `BB ` 开头的扩展动手。

## 当前插件

`extensions/bb-similarweb-keywords/`
同一工具栏按钮：

- 网站关键词表：导出表格 CSV，默认前 5 页，可改页数和文件名
- 网站表现：导出卡片数据 CSV，可改文件名

页面上不会出现浮层。
下载走 `chrome.downloads`，不要弹出另存为。

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
