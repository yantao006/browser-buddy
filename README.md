# browser-buddy

在一个仓库里维护 Chrome 插件和配套脚本，用来从 3ue 包装后的 Semrush / Similarweb 页面抽取数据，并筛选有增长潜力的着陆页。

开发和验证都在真实网站上进行。
用 Ego Browser 加载我们自己的插件，不改用户已有扩展。

## 发布包

在 [Releases](https://github.com/yantao006/browser-buddy/releases) 下载：

- `bb-similarweb-keywords-*.zip`：浏览器插件
- `landing-screen-*.zip`：着陆页筛选脚本

### 安装插件

1. 解压 zip。
2. 打开 Chrome / Ego 的 `chrome://extensions`。
3. 打开「开发者模式」。
4. 「加载已解压的扩展程序」，选中解压后的 `bb-similarweb-keywords` 目录。

插件只在 `sim.3ue.co` / `sem.3ue.co` 上工作。
点工具栏图标导出。
支持的页面：

**Similarweb**

- 自然搜索关键词表
- 关键词生成器
- 网站表现
- 着陆页

**Semrush**

- 域名概览
- 引荐域名
- 反向链接分析
- 自然排名

默认文件名是 `{产品}-{平台}-{内容}-{日期}`，也可以在弹窗里改。
下载直接进系统下载目录，不会弹另存为。
页面上不会出现浮层。

### 着陆页筛选脚本

解压 `landing-screen-*.zip` 后：

```bash
python3 screen.py ~/Downloads/landing-pages-YYYY-MM-DD.zip
```

会按点击量 ≥ 10k、新品 / 爆发 / 持续爬升规则打分，写出候选 CSV。
如果同目录有 `labeled.json`，还会打印达标样本的召回情况。

```bash
python3 screen_test.py
```

## 仓库结构

- `extensions/bb-similarweb-keywords/`：插件源码
- `tools/landing-screen/`：筛选脚本
- `src/`、`tests/`、`fixtures/`：早期抽取 harness（不是日常用法）
