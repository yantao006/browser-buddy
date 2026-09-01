(() => {
  document.getElementById("bb-sw-keyword-panel")?.remove();

  const DEFAULT_PAGES = 5;
  const LANDING_PARENT_DOMAINS = ["vercel.app", "github.io", "netlify.app", "web.app", "pages.dev"];
  const COLUMNS = [
    ["index", "序号"],
    ["keyword", "关键词"],
    ["clicks", "点击量"],
    ["sharePct", "点击量占比"],
    ["clicksChange", "变动"],
    ["difficulty", "KD"],
    ["intent", "意图"],
    ["kwVolume", "规模"],
    ["kwVolumeAverage", "平均体量"],
    ["cpc", "CPC"],
    ["zeroClicksShare", "零点击"],
    ["position", "排位"],
    ["sitesData", "排位变动"],
    ["topUrl", "热门网址"],
    ["urlCount", "#URL"],
    ["siteSerpFeatures", "SERP features"],
  ];
  const DOM_FIELDS = [
    "index",
    "keyword",
    "share",
    "clicksChange",
    "difficulty",
    "intent",
    "kwVolume",
    "kwVolumeAverage",
    "cpc",
    "zeroClicksShare",
    "position",
    "sitesData",
    "topUrl",
    "urlCount",
    "siteSerpFeatures",
  ];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function findTable() {
    const seeds = [
      document.querySelector('[data-automation-field-header="keyword"]'),
      document.querySelector('[data-automation-field="keyword"]'),
      document.querySelector("tbody tr.ant-table-row"),
    ].filter(Boolean);
    for (const el of seeds) {
      const table = el.closest("table");
      if (table) return table;
    }
    for (const table of document.querySelectorAll("table")) {
      const text = (table.querySelector("thead")?.innerText || "") + (table.innerText || "");
      if (text.includes("关键词") && table.querySelector("tbody tr")) return table;
    }
    return null;
  }

  function cellText(td) {
    if (!td) return "";
    const kw = td.querySelector(".swTable-content, .search-keyword a, a.swTable-content");
    if (kw) return kw.textContent.trim();
    return td.innerText.replace(/\s+/g, " ").trim();
  }

  function changeText(td) {
    const raw = cellText(td);
    if (!td || /NEW|LOST|^[-—]$/i.test(raw)) return raw;
    const icon = td.querySelector("[data-automation-icon-name]");
    const name = icon && icon.getAttribute("data-automation-icon-name");
    if (name === "arrow-down" && !raw.startsWith("↓")) return `↓${raw}`;
    if (name === "arrow-up" && !raw.startsWith("↑")) return `↑${raw}`;
    return raw;
  }

  function splitShare(raw) {
    const text = String(raw || "").trim();
    const matched = text.match(/^(\S+)\s+(\d+(?:\.\d+)?%)$/);
    if (matched) return { clicks: matched[1], sharePct: matched[2] };
    const pct = (text.match(/(\d+(?:\.\d+)?%)/) || [])[1] || "";
    return { clicks: text.replace(pct, "").trim(), sharePct: pct };
  }

  function scrapePage() {
    const table = findTable();
    if (!table) return [];
    const rows = [...table.querySelectorAll("tbody tr.ant-table-row")];
    const list = rows.length
      ? rows
      : [...table.querySelectorAll("tbody tr")].filter((tr) => !tr.classList.contains("ant-table-measure-row"));
    return list
      .map((tr) => {
        const rec = {};
        for (const field of DOM_FIELDS) {
          const td = tr.querySelector(`[data-automation-field="${field}"]`);
        rec[field] = field === "clicksChange" ? changeText(td) : cellText(td);
        }
        if (!rec.keyword) {
          rec.keyword = tr.getAttribute("data-row-key") || cellText(tr.cells?.[2]) || "";
        }
        const { clicks, sharePct } = splitShare(rec.share);
        rec.clicks = clicks;
        rec.sharePct = sharePct;
        return rec;
      })
      .filter((row) => row.keyword);
  }

  function findNextButton() {
    return document.querySelector("li.ant-pagination-next:not(.ant-pagination-disabled) button");
  }

  function findPrevButton() {
    return document.querySelector("li.ant-pagination-prev:not(.ant-pagination-disabled) button");
  }

  function currentPageNumber() {
    const indexCell = document.querySelector('[data-automation-field="index"]');
    if (indexCell) {
      const index = parseInt(indexCell.innerText, 10);
      if (index > 0) return Math.floor((index - 1) / 100) + 1;
    }
    const input = document.querySelector(".ant-pagination-simple-pager input");
    if (input && input.value) {
      const page = parseInt(input.value, 10);
      if (page > 0) return page;
    }
    return 1;
  }

  async function goToFirstPage() {
    if (currentPageNumber() <= 1) return true;
    for (let i = 0; i < 30; i += 1) {
      const prev = findPrevButton();
      if (!prev) break;
      const key = firstRowKey();
      prev.scrollIntoView({ block: "center", behavior: "instant" });
      prev.click();
      const changed = await waitForPageChange(key, 15000);
      if (!changed) break;
      if (currentPageNumber() <= 1) return true;
    }
    return currentPageNumber() <= 1;
  }

  function firstRowKey() {
    const tr = document.querySelector("tbody tr.ant-table-row") || document.querySelector("tbody tr");
    if (!tr) return "";
    return (
      tr.getAttribute("data-row-key") ||
      cellText(tr.querySelector('[data-automation-field="keyword"]')) ||
      (tr.innerText || "").slice(0, 80)
    );
  }

  async function waitForPageChange(prevKey, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await sleep(250);
      const spinning = document.querySelector(".ant-spin-spinning");
      const now = firstRowKey();
      const rows = document.querySelectorAll("tbody tr.ant-table-row, tbody tr").length;
      if (!spinning && now && now !== prevKey && rows > 0) return true;
    }
    return false;
  }

  function toCsv(rows, columns = COLUMNS) {
    const esc = (value) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };
    const lines = [columns.map(([, header]) => header).join(",")];
    for (const row of rows) {
      lines.push(columns.map(([field]) => esc(row[field])).join(","));
    }
    return `\uFEFF${lines.join("\n")}`;
  }

  function saveFile(text, filename, mime) {
    return new Promise((resolve) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ ok: false, error: "no-runtime" });
        return;
      }
      try {
        chrome.runtime.sendMessage(
          { type: "download-file", filename, text, mime: mime || "text/csv;charset=utf-8" },
          (res) => {
            const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
            if (error) resolve({ ok: false, error });
            else resolve(res || { ok: false, error: "empty-response" });
          },
        );
      } catch (error) {
        resolve({ ok: false, error: String(error) });
      }
    });
  }

  function saveCsv(text, filename) {
    return saveFile(text, filename, "text/csv;charset=utf-8");
  }

  function getTotalPages() {
    const pager = document.querySelector(".ant-pagination-simple-pager");
    if (pager) {
      const matched = pager.innerText.replace(/\s+/g, "").match(/\/(\d+)/);
      if (matched) return Math.max(1, parseInt(matched[1], 10));
    }
    const items = [...document.querySelectorAll("li.ant-pagination-item")];
    const nums = items
      .map((li) => parseInt(li.getAttribute("title") || li.innerText, 10))
      .filter((n) => n > 0);
    if (nums.length) return Math.max(...nums);
    const header = document.querySelector('[data-automation-field-header="keyword"]');
    if (header) {
      const matched = header.innerText.match(/\(([\d,]+)\)/);
      if (matched) {
        const count = parseInt(matched[1].replace(/,/g, ""), 10);
        if (count > 0) return Math.max(1, Math.ceil(count / 100));
      }
    }
    return DEFAULT_PAGES;
  }

  const PERF_COLUMNS = [
    ["section", "板块"],
    ["item", "项目"],
    ["metric", "指标"],
    ["value", "数值"],
    ["change", "变动"],
    ["note", "备注"],
  ];

  function detectPageKind() {
    const blob = `${location.hash}\n${location.href}\n${document.title}`;
    if (/analytics\/refdomains/i.test(blob)) return "refdomains";
    if (/analytics\/backlinks/i.test(blob) || document.title.includes("反向链接分析")) return "backlinks";
    if (/analytics\/organic\//i.test(blob) || document.title.includes("自然排名")) return "organic";
    if (/analytics\/overview/i.test(blob) || document.title.includes("域名概览")) return "overview";
    if (/keyword-generator-tool/i.test(blob) || document.title.includes("关键词生成器")) return "generator";
    if (/landing-pages-v2/i.test(blob) || document.title.includes("着陆页")) return "landing";
    if (/website-performance/i.test(blob) || document.querySelector('[data-automation="total-visits-widget"]')) {
      return "performance";
    }
    if (findTable()) return "keywords";
    return "unknown";
  }

  function pageInfo() {
    const kind = detectPageKind();
    if (kind === "performance") return { kind, total: 1, defaultPages: 1 };
    if (kind === "overview") return { kind, total: 1, defaultPages: 1 };
    if (kind === "refdomains") return { kind, total: 1, defaultPages: 1 };
    if (kind === "backlinks") return { kind, total: 1, defaultPages: 1 };
    if (kind === "organic") return { kind, total: 1, defaultPages: 1 };
    if (kind === "generator") {
      const total = Math.max(1, landingTotalPages());
      return { kind, total, defaultPages: Math.min(DEFAULT_PAGES, total) };
    }
    if (kind === "landing") return { kind, total: landingTotalPages(), defaultPages: 1 };
    const total = getTotalPages();
    return { kind: findTable() ? "keywords" : kind, total, defaultPages: Math.min(DEFAULT_PAGES, total) };
  }

  function siteHost() {
    let host = "keywords";
    try {
      const query = new URLSearchParams(location.search).get("q");
      if (query && /analytics\/(overview|refdomains|backlinks|organic)/i.test(location.href)) host = query;
      else {
        const raw = (location.hash.match(/key=([^&]+)/) || location.search.match(/key=([^&]+)/) || [])[1];
        if (raw) host = decodeURIComponent(raw);
      }
    } catch {
      // keep fallback
    }
    return String(host).replace(/[\\/:*?"<>|]+/g, "-").replace(/\.+$/, "") || "keywords";
  }

  function generatorKeyword() {
    try {
      const hash = location.hash || "";
      const qIndex = hash.indexOf("?");
      const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : location.search);
      const kw = (params.get("keyword") || "").trim();
      if (kw) return kw.replace(/[\\/:*?"<>|]+/g, "-");
    } catch {
      // keep fallback
    }
    return "keyword";
  }

  function selectedDomain() {
    try {
      const raw = (location.hash.match(/selectedDomain=([^&]+)/) || [])[1];
      if (raw) return decodeURIComponent(raw);
    } catch {
      // keep fallback
    }
    const chips = [...document.querySelectorAll('[data-automation="query-bar-item-text"]')].map(normText);
    const hit = chips.find((text) => /\.(app|io|dev|com|net|ai)$/i.test(text));
    if (hit) return hit;
    return (siteHost().split(",")[0] || "landing").trim();
  }

  function currentLandingKeys() {
    try {
      const raw = (location.hash.match(/[?&]key=([^&]+)/) || [])[1];
      if (!raw) return [];
      return decodeURIComponent(raw)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function fillLandingParentDomains() {
    if (detectPageKind() !== "landing") {
      return { ok: false, error: "请先打开着陆页。" };
    }
    const domains = LANDING_PARENT_DOMAINS.slice();
    const hash = location.hash || "";
    if (!/landing-pages-v2/i.test(hash)) {
      return { ok: false, error: "请先打开着陆页。" };
    }
    const current = currentLandingKeys();
    const same = current.length === domains.length && current.every((name, index) => name === domains[index]);
    const qIndex = hash.indexOf("?");
    const path = qIndex >= 0 ? hash.slice(0, qIndex) : hash;
    const nextPath = path.replace(/(\/landing-pages-v2\/\*\/\d+\/)[^/?]+/, "$128d");
    if (same && nextPath === path) return { ok: true, unchanged: true, domains };
    const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : "");
    params.set("key", domains.join(","));
    params.set(
      "pageFilter",
      JSON.stringify(domains.map((url) => ({ url, searchType: "domain" }))),
    );
    params.set("selectedDomain", domains[0]);
    if (!params.get("webSource")) params.set("webSource", "Total");
    if (!params.get("selectedPageTab")) params.set("selectedPageTab", "Organic");
    const nextHash = `${nextPath}?${params.toString()}`;
    location.replace(`${location.pathname}${location.search}${nextHash}`);
    return { ok: true, unchanged: false, domains };
  }

  function landingDurationToken() {
    const matched = (location.hash || "").match(/landing-pages-v2\/\*\/\d+\/([^/?]+)/);
    return matched ? decodeURIComponent(matched[1]) : "";
  }

  function landingDurationButton() {
    return (
      document.querySelector(".DurationSelect[data-automation='drop-down-button']") ||
      document.querySelector(".DurationSelectorDropdown[data-automation='drop-down-button']") ||
      [...document.querySelectorAll('[data-automation="drop-down-button"]')].find((el) =>
        /DurationSelect|DurationSelector/.test(String(el.className || "")),
      ) ||
      null
    );
  }

  function isLandingLast28Days() {
    if (/^28d$/i.test(landingDurationToken())) return true;
    return /最后\s*28\s*天数/.test(normText(landingDurationButton()));
  }

  async function ensureLandingLast28Days() {
    if (isLandingLast28Days()) return true;
    const btn = landingDurationButton();
    if (!btn) return false;
    btn.click();
    const item = await waitFor(
      () =>
        [...document.querySelectorAll('[data-automation="duration-preset-item"]')].find((el) =>
          /最后\s*28\s*天数/.test(normText(el)),
        ),
      6000,
    );
    if (!item) return false;
    item.click();
    const switched = await waitFor(() => isLandingLast28Days(), 20000);
    await waitFor(() => scrapeLandingPage().length > 0, 15000);
    await sleep(500);
    return !!switched;
  }

  function fileDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function exportFileName(product, platform, content, ext) {
    const name = String(product || "export")
      .split(",")[0]
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\.+$/, "") || "export";
    return `${name}-${platform}-${content}-${fileDate()}.${ext}`;
  }

  function datedOverviewZipName() {
    return exportFileName(overviewDomain(), "semrush", "overview", "zip");
  }

  function datedLandingZipName() {
    return exportFileName(selectedDomain() || "landing-pages", "similarweb", "landing-pages", "zip");
  }

  function defaultFilename() {
    const kind = detectPageKind();
    if (kind === "performance") return exportFileName(siteHost(), "similarweb", "website-performance", "csv");
    if (kind === "overview") return datedOverviewZipName();
    if (kind === "refdomains") return exportFileName(overviewDomain() || siteHost(), "semrush", "refdomains", "csv");
    if (kind === "backlinks") return exportFileName(overviewDomain() || siteHost(), "semrush", "backlinks", "zip");
    if (kind === "organic") return exportFileName(overviewDomain() || siteHost(), "semrush", "organic", "zip");
    if (kind === "generator") return exportFileName(generatorKeyword(), "similarweb", "keyword-generator", "csv");
    if (kind === "landing") return datedLandingZipName();
    return exportFileName(siteHost(), "similarweb", "organic-keywords", "csv");
  }

  function normText(el) {
    return ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  function findExact(title) {
    return (
      [...document.querySelectorAll("div,span,h2,h3")].find((el) => normText(el) === title) || null
    );
  }

  function sectionRoot(title, stopHint) {
    const heading = findExact(title);
    if (!heading) return null;
    let el = heading;
    let best = heading;
    for (let i = 0; i < 12 && el; i += 1) {
      const text = normText(el);
      if (stopHint && text.includes(stopHint) && text.length < 3500) return el;
      if (text.includes(title) && text.length > title.length + 20 && text.length < 3500) best = el;
      el = el.parentElement;
    }
    return best;
  }

  function signedChangeFrom(el) {
    if (!el) return "";
    const pct = el.classList && el.classList.contains("changePercentage") ? el : el.querySelector(".changePercentage");
    if (pct) {
      const raw = normText(pct).replace(/^[↑↓]\s*/, "");
      if (!raw || raw === "-") return raw || "-";
      if (
        pct.classList.contains("positive") ||
        pct.querySelector(".positive, .sw-icon-arrow-up5, .sw-icon-arrow-up2")
      ) {
        return `↑${raw}`;
      }
      if (
        pct.classList.contains("negative") ||
        pct.querySelector(".negative, .sw-icon-arrow-down5, .sw-icon-arrow-down2")
      ) {
        return `↓${raw}`;
      }
      return raw;
    }
    const box = el.classList && el.classList.contains("ChangeValue") ? el : el.querySelector(".ChangeValue");
    const raw = normText((box && box.querySelector(".ChangeValue-text")) || box || "");
    if (!raw) return "";
    if (/^[↑↓+\-]/.test(raw) || raw === "-") return raw;
    const src = `${(box && box.className) || ""} ${el.className || ""}`;
    if (/ChangeValue--up/.test(src) || el.querySelector('[data-automation-icon-name="arrow-up"]')) return `↑${raw}`;
    if (/ChangeValue--down/.test(src) || el.querySelector('[data-automation-icon-name="arrow-down"]')) return `↓${raw}`;
    return raw;
  }

  function cellDisplay(cell) {
    if (!cell) return "";
    const change = signedChangeFrom(cell);
    if (change) return change;
    const label = cell.querySelector(
      "a.swTable-content-large, a.swTable-content, .country-text, [data-automation='core-website-cell-internal-link']",
    );
    return label ? normText(label) : normText(cell);
  }

  function scrapeFlexTable(root) {
    if (!root) return [];
    const cols = [
      ...root.querySelectorAll(".swReactTable-column, [class*='swReactTable-column'], .MiniFlexTable-column"),
    ];
    if (!cols.length) return [];
    const headers = cols.map((col) =>
      normText(
        col.querySelector('.headerCell-text, [data-automation="header-cell.text"], .MiniFlexTable-headerCell'),
      ),
    );
    const values = cols.map((col) =>
      [...col.querySelectorAll(".swReactTableCell, .MiniFlexTable-cell")].map((cell) => cellDisplay(cell)),
    );
    const len = Math.max(0, ...values.map((list) => list.length));
    const rows = [];
    for (let i = 0; i < len; i += 1) {
      const rec = {};
      headers.forEach((header, idx) => {
        rec[header || `col${idx}`] = values[idx][i] || "";
      });
      rows.push(rec);
    }
    return rows;
  }

  function widgetRoot(title, auto) {
    if (auto) {
      const el = document.querySelector(`[data-automation="${auto}"]`);
      if (el) return el;
    }
    const heading = findExact(title);
    if (!heading) return null;
    let el = heading;
    for (let i = 0; i < 12 && el; i += 1) {
      const raw = normText(el);
      const hasTable = el.querySelector(".swReactTableCell, .MiniFlexTable-cell, .MiniFlexTable-column");
      const hasEmpty = el.querySelector(
        '[data-automation="empty-state-title"], [class*="EmptyStateTitle"], [data-automation="no-data-wrapper"]',
      );
      if ((hasTable || hasEmpty) && raw.length < 800) return el;
      el = el.parentElement;
    }
    return null;
  }

  function emptyNote(root) {
    if (!root) return "没有结果";
    const title = normText(
      root.querySelector('[data-automation="empty-state-title"], [class*="EmptyStateTitle"]'),
    );
    if (title) return title;
    const raw = normText(root);
    if (raw.includes("没有结果") || raw.includes("未找到与该搜索匹配")) return "没有结果";
    if (root.querySelector('[data-automation="no-data-wrapper"]')) return "没有结果";
    return "";
  }

  function isEmptyWidget(root) {
    if (!root) return true;
    const hasRow = root.querySelector(".swReactTableCell, .MiniFlexTable-cell");
    return !hasRow && !!emptyNote(root);
  }

  function addRow(rows, section, item, metric, value, change, note) {
    if (value === undefined || value === null || value === "") return;
    rows.push({
      section,
      item,
      metric,
      value: String(value),
      change: change ? String(change) : "",
      note: note ? String(note) : "",
    });
  }

  function addBlank(rows, section, item, metric, note) {
    rows.push({
      section,
      item,
      metric: metric || "结果",
      value: "",
      change: "",
      note: note || "没有结果",
    });
  }

  function tableName(rec) {
    return (
      rec["域"] ||
      rec["Domain"] ||
      rec["搜索词"] ||
      rec["关键词"] ||
      rec["国家/地区"] ||
      rec["国家"] ||
      rec["行业"] ||
      rec["媒体"] ||
      rec["广告主"] ||
      rec["网站"] ||
      rec["category"] ||
      rec["publisher"] ||
      ""
    );
  }

  function tableShare(rec) {
    return rec["流量来源"] || rec["共享"] || rec["占比"] || rec["Share"] || rec["visits"] || "";
  }

  function tableChange(rec) {
    return rec["变动"] || rec["更改"] || rec["Change"] || rec["visitsChange"] || "";
  }

  function addWidgetRows(rows, section, title, auto, metric) {
    const root = widgetRoot(title, auto);
    if (!root || isEmptyWidget(root)) {
      addBlank(rows, section, title, "结果", emptyNote(root));
      return;
    }
    const recs = scrapeFlexTable(root);
    if (!recs.length) {
      addBlank(rows, section, title, "结果", emptyNote(root) || "没有结果");
      return;
    }
    for (const rec of recs) {
      const name = tableName(rec);
      addRow(rows, section, name || title, metric || "流量占比", tableShare(rec) || name, tableChange(rec), title);
    }
  }

  function addSectionShare(rows, headerTitle, item) {
    const header = [...document.querySelectorAll(".Header-VHpZp")].find((el) => normText(el) === headerTitle);
    if (!header) return;
    const wrap = header.closest("[class*='HeaderWithChannelWrapper']") || header.parentElement.parentElement;
    const share = (normText(wrap).match(/(\d+(?:\.\d+)?%|<1%)/) || [])[1];
    addRow(rows, headerTitle, item || `${headerTitle}占全站流量`, "占比", share);
  }

  function formatCount(value) {
    const num = Math.round(Number(value));
    if (!Number.isFinite(num)) return String(value);
    return num.toLocaleString("en-US");
  }

  function formatPct(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    if (num === 0) return "N/A";
    return `${num.toFixed(2)}%`;
  }

  function scrapePerformance(extra) {
    const rows = [];
    const host = siteHost();
    const periodEls = [...document.querySelectorAll('[data-automation-box-subtitle="true"]')].map(normText);
    const periodText = periodEls.find((text) => /[A-Za-z]{3} \d{4}/.test(text)) || periodEls[0] || "";
    const period = (periodText.match(/[A-Za-z]{3} \d{4}(?: - [A-Za-z]{3} \d{4})?/) || [])[0] || "";
    const geo = (periodText.match(/全球|Worldwide/) || [])[0] || "";
    addRow(rows, "元数据", "网站", "域名", host);
    addRow(rows, "元数据", "时间范围", "周期", period);
    addRow(rows, "元数据", "地理", "范围", geo || "全球");
    addRow(
      rows,
      "元数据",
      "页面",
      "标题",
      normText(document.querySelector('[data-automation="page-title"]')) || "网站表现",
    );

    const visits = document.querySelector('[data-automation="total-visits-widget"]');
    if (visits) {
      const raw = normText(visits);
      const change = signedChangeFrom(visits);
      const afterGeo = raw.replace(/^.*?(\d{4}\s+)?/, "");
      const value =
        (raw.match(/([\d]{1,3}(?:,[\d]{3})+(?:\.\d+)?)/) ||
          raw.match(/([\d.]+[KMB万亿]?)\s+[↑↓+\-]?[\d.]+%/) ||
          afterGeo.match(/([\d,]+(?:\.\d+)?)/) ||
          [])[1] || "";
      addRow(rows, "流量与互动", "总访问量", "访问量", value, change, change ? "自上个月" : "");
    }

    const devices = document.querySelector('[data-automation="device-distribution-widget"]');
    if (devices) {
      const titles = [...devices.querySelectorAll('[data-automation-title="true"]')].map(normText);
      const values = [...devices.querySelectorAll('[data-automation-value="true"]')].map(normText);
      titles.forEach((name, i) => addRow(rows, "流量与互动", "设备分发", name, values[i] || ""));
    }

    for (const rankRow of document.querySelectorAll('[data-automation="website-rank-row"]')) {
      const title = normText(rankRow.querySelector('[data-automation="website-rank-title"]'));
      const value = normText(rankRow.querySelector('[data-automation="website-rank-value"]'));
      const subtitle = normText(rankRow.querySelector('[data-automation="website-rank-country-subtitle"]'));
      addRow(rows, "流量与互动", title, "排名", value, "", subtitle);
    }

    const engagementRoot = sectionRoot("参与度概览", "See trends") || sectionRoot("参与度概览", "跳出率");
    if (engagementRoot) {
      for (const nameEl of engagementRoot.querySelectorAll(".MetricName-hnVwHd")) {
        const name = normText(nameEl);
        const block = nameEl.closest("[class*='MetricContainer']") || nameEl.parentElement.parentElement;
        const value = normText(block).replace(name, "").trim();
        addRow(rows, "参与度概览", name, "数值", value);
      }
    }

    const monthly = extra && extra.monthly;
    if (monthly && monthly.points && monthly.points.length) {
      for (const point of monthly.points) {
        addRow(rows, "随着时间的访问", point.month, "访问量", formatCount(point.value), "", monthly.site || host);
      }
    } else {
      const chartRoot = sectionRoot("随着时间的访问");
      const total = chartRoot && normText(chartRoot.querySelector('[data-automation-sub-value="true"]'));
      if (total) addRow(rows, "随着时间的访问", "合计", "访问量", total, "", "页面未暴露分月数值");
    }

    const countryRows = scrapeFlexTable(sectionRoot("热门国家/地区", "查看更多国家"));
    for (const rec of countryRows) {
      const name = rec["国家/地区"] || rec["国家"] || "";
      addRow(rows, "热门国家与地区", name, "流量占比", rec["流量来源"] || rec["占比"] || "", rec["变动"] || rec["更改"] || "");
    }

    const extraChannels = extra && extra.channels;
    if (extraChannels && extraChannels.length) {
      for (const channel of extraChannels) {
        addRow(rows, "流量来源与渠道", channel.name, "占比", formatPct(channel.y));
      }
    } else {
      const channelRoot =
        document.querySelector('[data-automation="channelsOverviewContainer"]') ||
        document.querySelector('[data-automation="ChannelsOverviewBarChartAllTraffic"]');
      if (channelRoot) {
        const raw = normText(channelRoot);
        const labels = ["直接", "自然搜索", "付费搜索", "外链", "自然社媒", "付费社交媒体", "生成式 AI", "邮件", "展示广告", "联盟"];
        const present = labels.filter((label) => raw.includes(label));
        const tail = raw.split("100%")[1] || "";
        const vals = tail.match(/N\/A|-|\d+(?:\.\d+)?%/g) || [];
        present.forEach((name, i) => addRow(rows, "流量来源与渠道", name, "占比", vals[i] || ""));
      }
    }

    const organicHeader = [...document.querySelectorAll(".Header-VHpZp")].find((el) => normText(el) === "自然搜索");
    if (organicHeader) {
      const wrap =
        organicHeader.closest("[class*='SectionHeaderContainer']")?.parentElement || organicHeader.parentElement;
      const share = (normText(wrap).match(/(\d+(?:\.\d+)?%)/) || [])[1];
      addRow(rows, "自然搜索", "自然搜索占全站流量", "占比", share);
    }

    const brandedRoot = sectionRoot("品牌 vs.非品牌") || sectionRoot("品牌 vs. 非品牌");
    if (brandedRoot) {
      const raw = normText(brandedRoot);
      addRow(rows, "自然搜索", "品牌", "占比", (raw.match(/品牌\s+(\d+(?:\.\d+)?%)/) || [])[1]);
      addRow(rows, "自然搜索", "非品牌", "占比", (raw.match(/非品牌\s+(\d+(?:\.\d+)?%)/) || [])[1]);
    }

    const keywordRows = scrapeFlexTable(sectionRoot("热门自然非品牌搜索词", "查看更多搜索词"));
    for (const rec of keywordRows) {
      const name = rec["搜索词"] || rec["关键词"] || "";
      addRow(rows, "热门自然非品牌搜索词", name, "流量占比", rec["流量来源"] || "", rec["更改"] || rec["变动"] || "");
    }

    addSectionShare(rows, "付费搜索", "付费搜索占全站流量");
    addWidgetRows(rows, "付费搜索", "热门付费非品牌搜索词", "", "流量占比");

    addSectionShare(rows, "外链", "外链占全站流量");
    addWidgetRows(rows, "外链", "热门外链网站", "wwo-top-referring-websites", "流量占比");
    addWidgetRows(rows, "外链", "热门外链行业", "wwo-top-referring-industries", "流量占比");

    addSectionShare(rows, "出站流量", "出站流量占全站流量");
    addWidgetRows(rows, "出站流量", "热门链接目的地", "wwo-top-link-destinations", "流量占比");

    addSectionShare(rows, "导出广告", "导出广告占全站流量");
    addWidgetRows(rows, "导出广告", "领先广告主", "wwo-top-ad-destination", "流量占比");

    addSectionShare(rows, "社交", "社交占全站流量");
    addWidgetRows(rows, "社交", "社交流量", "social-traffic", "流量占比");

    addSectionShare(rows, "显示广告", "显示广告占全站流量");
    addWidgetRows(rows, "显示广告", "热门媒体", "wwo-top-publishers", "流量占比");

    return rows;
  }

  async function exportPerformance(opts) {
    if (detectPageKind() !== "performance") {
      return { ok: false, error: "这一页不是网站表现。请停在网站表现页再试。" };
    }
    const rows = scrapePerformance({
      monthly: opts && opts.monthly,
      channels: opts && opts.channels,
    });
    const dataRows = rows.filter((row) => row.section !== "元数据");
    if (!dataRows.length) {
      return { ok: false, error: "找到了网站表现页，但读不到卡片数据。等页面加载完再试。" };
    }
    const filename = normalizeFilename(opts && opts.filename);
    const text = toCsv(rows, PERF_COLUMNS);
    const downloaded = await saveCsv(text, filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存 CSV 失败。", rows: rows.length, filename, kind: "performance" };
    }
    return { ok: true, rows: rows.length, filename, kind: "performance", via: "downloads" };
  }

  function normalizeFilename(name) {
    let text = String(name || "").trim();
    if (!text) text = defaultFilename();
    text = text.replace(/[\\/:*?"<>|]+/g, "-");
    const zipKind =
      detectPageKind() === "landing" ||
      detectPageKind() === "overview" ||
      detectPageKind() === "backlinks" ||
      detectPageKind() === "organic";
    if (zipKind) {
      text = text.replace(/\.(csv|xls|xlsx)$/i, ".zip");
      if (!/\.zip$/i.test(text)) text += ".zip";
      return text;
    }
    if (!/\.csv$/i.test(text)) text += ".csv";
    return text;
  }

  async function exportPages(opts) {
    if (!findTable()) {
      return { ok: false, error: "这一页找不到关键词表。请停在表格页再试。" };
    }
    const jumped = await goToFirstPage();
    if (!jumped) {
      return { ok: false, error: "无法回到第 1 页，已取消导出，避免从中间页开始漏数据。" };
    }
    const total = getTotalPages();
    const want = Math.min(total, Math.max(1, parseInt(opts && opts.pages, 10) || DEFAULT_PAGES));
    const all = [];
    const seen = new Set();
    let pages = 0;
    for (let i = 0; i < want; i += 1) {
      const pageRows = scrapePage();
      if (!pageRows.length) {
        if (i === 0) return { ok: false, error: "找到了表格，但读不到行。刷新后再试。" };
        break;
      }
      for (const row of pageRows) {
        const key = row.keyword || JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(row);
      }
      pages += 1;
      if (i === want - 1) break;
      const prev = firstRowKey();
      const next = findNextButton();
      if (!next) break;
      next.scrollIntoView({ block: "center", behavior: "instant" });
      next.click();
      const changed = await waitForPageChange(prev);
      if (!changed) break;
      await sleep(400);
    }
    if (!all.length) return { ok: false, error: "没有抽到任何行。" };
    const filename = normalizeFilename(opts && opts.filename);
    const text = toCsv(all);
    const downloaded = await saveCsv(text, filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存 CSV 失败。", rows: all.length, pages, filename, total };
    }
    return { ok: true, rows: all.length, pages, filename, total, via: "downloads" };
  }

  const LANDING_COLUMNS = [
    ["type", "类型"],
    ["domain", "域名"],
    ["landing", "着陆页"],
    ["index", "序号"],
    ["name", "名称"],
    ["clicks", "点击量"],
    ["sharePct", "点击量占比"],
    ["change", "变动"],
    ["desktopPct", "桌面端占比"],
    ["mobilePct", "移动端占比"],
    ["kwVolume", "规模"],
    ["kwVolumeAverage", "平均体量"],
    ["cpc", "CPC"],
    ["keywordCount", "关键词数"],
    ["topKeyword", "热搜关键词"],
    ["note", "备注"],
  ];

  function landingTotalPages() {
    const footer = [...document.querySelectorAll("[data-automation-pagination='true']")].find(
      (el) => !el.closest(".Popup-content"),
    );
    const matched = footer && normText(footer).match(/out of\s*([\d,]+)/i);
    if (matched) return Math.max(1, parseInt(matched[1].replace(/,/g, ""), 10));
    return 1;
  }

  function outsidePopup(el) {
    return el && !el.closest(".Popup-content");
  }

  function dataColumns(root) {
    const scope = root || document;
    return [...scope.querySelectorAll(".swReactTable-column, [class*='swReactTable-column']")].filter(
      (col) => outsidePopup(col) && col.querySelectorAll(".swReactTableCell").length,
    );
  }

  function popupDataColumns() {
    const popup = document.querySelector(".Popup-content");
    if (!popup) return [];
    return [...popup.querySelectorAll(".swReactTable-column, [class*='swReactTable-column']")].filter(
      (col) => col.querySelectorAll(".swReactTableCell").length,
    );
  }

  function splitClicksCell(cell) {
    const clicks = normText(cell && cell.querySelector(".TotalVisitsContainer-gMmJFx, [class*='TotalVisitsContainer']"));
    const share = normText(cell && cell.querySelector(".min-value"));
    if (clicks || share) return { clicks, sharePct: share };
    return splitShare(normText(cell));
  }

  function parseClicksNumber(text) {
    const raw = String(text || "").trim().replace(/,/g, "").replace(/\s+/g, "");
    if (!raw || raw === "-") return NaN;
    const matched = raw.match(/^(-)?(\d+(?:\.\d+)?)([KMB万])?$/i);
    if (!matched) return NaN;
    const sign = matched[1] ? -1 : 1;
    const value = parseFloat(matched[2]);
    const unit = (matched[3] || "").toUpperCase();
    const mul = unit === "K" ? 1e3 : unit === "M" ? 1e6 : unit === "B" ? 1e9 : unit === "万" ? 1e4 : 1;
    return sign * value * mul;
  }

  function meetsClickFloor(text, floor = 10000) {
    const value = parseClicksNumber(text);
    return Number.isFinite(value) && value >= floor;
  }

  function deviceSplit(cell) {
    if (!cell) return { desktopPct: "", mobilePct: "" };
    const inner = cell.querySelector(".sw-progress-bar-inner, [class*='ProgressBarInner']");
    const wrap = cell.querySelector(".sw-progress-bar, [class*='ProgressBarWrapper-jxGQkd']");
    if (!inner || !wrap) return { desktopPct: "", mobilePct: "" };
    const total = wrap.getBoundingClientRect().width;
    const part = inner.getBoundingClientRect().width;
    if (!(total > 0)) return { desktopPct: "", mobilePct: "" };
    const desktop = Math.round((part / total) * 10000) / 100;
    return { desktopPct: `${desktop}%`, mobilePct: `${Math.round((100 - desktop) * 100) / 100}%` };
  }

  function landingChange(cell) {
    const signed = signedChangeFrom(cell);
    if (signed) return signed;
    const box = cell && cell.querySelector(".ChangeContainer, [class*='ChangeContainer']");
    if (!box) return normText(cell);
    const raw = normText(box);
    if (!raw || raw === "-") return raw || "-";
    const cls = String(box.className || "");
    if (/positive|arrow-up/.test(cls)) return raw.startsWith("↑") ? raw : `↑${raw}`;
    if (/negative|arrow-down/.test(cls)) return raw.startsWith("↓") ? raw : `↓${raw}`;
    return raw;
  }

  function scrapeLandingPage() {
    const cols = dataColumns();
    if (cols.length < 4) return [];
    const cells = (col) => [...col.querySelectorAll(".swReactTableCell")];
    const urls = cells(cols[0]).map((cell) => normText(cell.querySelector(".url-cell-content, [class*='url-cell-content']")) || normText(cell));
    const len = urls.length;
    const rows = [];
    for (let i = 0; i < len; i += 1) {
      const clickCell = cols[1] && cells(cols[1])[i];
      const { clicks, sharePct } = splitClicksCell(clickCell);
      const device = deviceSplit(cols[4] && cells(cols[4])[i]);
      const kwCell = cols[5] && cells(cols[5])[i];
      rows.push({
        type: "着陆页",
        domain: selectedDomain(),
        landing: urls[i],
        index: String(i + 1),
        name: "",
        clicks,
        sharePct,
        change: landingChange(cols[2] && cells(cols[2])[i]),
        desktopPct: device.desktopPct,
        mobilePct: device.mobilePct,
        kwVolume: "",
        kwVolumeAverage: "",
        cpc: "",
        keywordCount: kwCell ? normText(kwCell.querySelector(".cell-innerText")) : "",
        topKeyword: cols[6] ? normText((cells(cols[6])[i] || {}).querySelector?.(".search-keyword a, a.search-keyword, .search-keyword")) || normText(cells(cols[6])[i]) : "",
        note: "",
        trendBtn: cols[3] && cells(cols[3])[i],
      });
    }
    return rows.filter((row) => row.landing);
  }

  function scrapePopupKeywordPage() {
    const cols = popupDataColumns();
    if (cols.length < 3) return [];
    const cells = (col) => [...col.querySelectorAll(".swReactTableCell")];
    const names = cells(cols[0]).map((cell) => {
      const link = cell.querySelector(".search-keyword a, a, .swTable-content");
      return link ? normText(link) : normText(cell);
    });
    const rows = [];
    for (let i = 0; i < names.length; i += 1) {
      const { clicks, sharePct } = splitClicksCell(cols[1] && cells(cols[1])[i]) || splitShare(normText(cols[1] && cells(cols[1])[i]));
      const device = deviceSplit(cols[3] && cells(cols[3])[i]);
      rows.push({
        name: names[i],
        clicks,
        sharePct,
        change: landingChange(cols[2] && cells(cols[2])[i]),
        desktopPct: device.desktopPct,
        mobilePct: device.mobilePct,
        kwVolume: cols[4] ? normText(cells(cols[4])[i]) : "",
        kwVolumeAverage: cols[5] ? normText(cells(cols[5])[i]) : "",
        cpc: cols[6] ? normText(cells(cols[6])[i]) : "",
      });
    }
    return rows.filter((row) => row.name);
  }

  function askMain(cmd, timeout = 8000) {
    return new Promise((resolve) => {
      const id = `bb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve(null);
      }, timeout);
      function onMessage(event) {
        if (event.source !== window || !event.data || event.data.type !== "bb-sw-hc-result" || event.data.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(event.data.payload);
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ type: "bb-sw-hc", id, cmd }, "*");
    });
  }

  function landingPopup() {
    return document.querySelector(".Popup-content");
  }

  function clickWhen(label, root) {
    const scope = root || document;
    const el = [...scope.querySelectorAll("button, [role='tab'], [class*='CircleSwitcher'], a, div")].find(
      (node) => normText(node) === label,
    );
    if (!el) return false;
    el.click();
    return true;
  }

  function closeLandingPopup() {
    const popup = landingPopup();
    if (!popup) return false;
    const closeBtn = [...popup.querySelectorAll("button")].find((btn) => String(btn.className).includes("Close"));
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
    return false;
  }

  async function waitFor(check, timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = check();
      if (value) return value;
      await sleep(250);
    }
    return null;
  }

  function landingDomainTabs() {
    return [...document.querySelectorAll('[data-automation="tab-wrapper"]')]
      .filter((el) => outsidePopup(el))
      .map((el) => {
        const text = normText(el);
        const domain = (text.match(/^([a-z0-9.-]+\.[a-z]{2,})/i) || [])[1] || "";
        return { el, text, domain };
      })
      .filter((item) => item.domain);
  }

  function landingPagerControl(name) {
    return (
      [...document.querySelectorAll(`[data-automation-pagination-control="${name}"]`)].find(
        (el) => outsidePopup(el),
      ) || null
    );
  }

  function landingPagerNext() {
    const el = landingPagerControl("control-right");
    if (!el || el.getAttribute("data-automation-pagination-control-disabled") === "true") return null;
    return el;
  }

  async function goToLandingFirstPage() {
    const first = landingPagerControl("control-left-end");
    if (!first || first.getAttribute("data-automation-pagination-control-disabled") === "true") return true;
    const prev = ((scrapeLandingPage()[0] || {}).landing) || "";
    first.click();
    return !!(await waitFor(() => {
      const rows = scrapeLandingPage();
      return rows.length > 0 && rows[0].landing && rows[0].landing !== prev;
    }, 20000));
  }

  async function nextLandingPage() {
    const next = landingPagerNext();
    if (!next) return false;
    const prev = ((scrapeLandingPage()[0] || {}).landing) || "";
    next.click();
    return !!(await waitFor(() => {
      const rows = scrapeLandingPage();
      return rows.length > 0 && rows[0].landing && rows[0].landing !== prev;
    }, 20000));
  }

  async function switchLandingDomain(domain) {
    closeLandingPopup();
    if (selectedDomain() !== domain) {
      const tab = landingDomainTabs().find((item) => item.domain === domain);
      if (!tab) return false;
      const prevFirst = ((scrapeLandingPage()[0] || {}).landing) || "";
      tab.el.scrollIntoView({ block: "nearest", behavior: "instant" });
      tab.el.click();
      const switched = await waitFor(() => {
        if (selectedDomain() !== domain) return false;
        const rows = scrapeLandingPage();
        return rows.length > 0 && rows[0].landing && rows[0].landing !== prevFirst;
      }, 20000);
      if (!switched) return false;
    }
    if (!scrapeLandingPage().length) return false;
    return goToLandingFirstPage();
  }

  function landingTrendButton(index) {
    const cols = dataColumns();
    const cell = cols[3] && [...cols[3].querySelectorAll(".swReactTableCell")][index];
    if (!cell) return null;
    return [...cell.querySelectorAll("button")].find((el) => normText(el) === "查看趋势") || null;
  }

  function landingKeywordButton(index) {
    const cols = dataColumns();
    const cell = cols[5] && [...cols[5].querySelectorAll(".swReactTableCell")][index];
    if (!cell) return null;
    return [...cell.querySelectorAll("button")].find((el) => normText(el) === "所有关键词") || null;
  }

  async function readWeeklySparklines() {
    delete document.documentElement.dataset.bbWeekly;
    window.postMessage({ type: "bb-sw-hc", cmd: "weekly-sparklines", id: `weekly-${Date.now()}` }, "*");
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const raw = document.documentElement.dataset.bbWeekly;
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          if (Array.isArray(payload)) return payload;
        } catch {
          // keep waiting
        }
      }
      await sleep(50);
    }
    return [];
  }

  async function openLandingKeywords(index) {
    closeLandingPopup();
    await sleep(150);
    const btn = landingKeywordButton(index);
    if (!btn) return false;
    btn.scrollIntoView({ block: "center", behavior: "instant" });
    btn.click();
    return !!(await waitFor(() => landingPopup() && scrapePopupKeywordPage().length, 8000));
  }

  async function openLandingTrend(index) {
    closeLandingPopup();
    await sleep(200);
    const tryOpen = async () => {
      const btn = landingTrendButton(index);
      if (!btn) return false;
      btn.scrollIntoView({ block: "center", behavior: "instant" });
      btn.click();
      return !!(await waitFor(() => landingPopup() && /点击量趋势|关键词/.test(normText(landingPopup())), 10000));
    };
    if (await tryOpen()) return true;
    closeLandingPopup();
    await sleep(400);
    return tryOpen();
  }

  async function readDailyTrend() {
    const popup = landingPopup();
    if (!popup) return [];
    delete document.documentElement.dataset.bbTrend;
    const day = [...popup.querySelectorAll("div,button,span")].find(
      (el) => normText(el) === "天" && String(el.className).includes("CircleSwitcher"),
    );
    if (day) day.click();
    const start = Date.now();
    while (Date.now() - start < 12000) {
      window.postMessage({ type: "bb-sw-hc", cmd: "popup-daily", id: `poll-${Date.now()}` }, "*");
      await sleep(400);
      const raw = document.documentElement.dataset.bbTrend;
      if (!raw) continue;
      try {
        const payload = JSON.parse(raw);
        if (payload && payload.points && payload.points.length >= 20) return payload.points;
      } catch {
        // keep waiting
      }
    }
    try {
      const payload = JSON.parse(document.documentElement.dataset.bbTrend || "null");
      return (payload && payload.points) || [];
    } catch {
      return [];
    }
  }

  async function scrapeLandingKeywords(pageCount) {
    const popup = landingPopup();
    if (!popup) return [];
    const tab = [...popup.querySelectorAll("[class*='styled-tab'], [class*='TabStyled'], button")].find(
      (el) => normText(el) === "关键词",
    );
    if (tab) tab.click();
    const ready = await waitFor(() => scrapePopupKeywordPage().length, 8000);
    if (!ready) return [];
    const want = Math.max(1, Math.min(5, pageCount || 5));
    const all = [];
    const seen = new Set();
    for (let page = 0; page < want; page += 1) {
      const rows = scrapePopupKeywordPage();
      if (!rows.length) break;
      for (const row of rows) {
        if (seen.has(row.name)) continue;
        seen.add(row.name);
        all.push(row);
      }
      if (page === want - 1) break;
      const prev = rows[0] && rows[0].name;
      const next = popup.querySelector(
        '[data-automation-pagination-control="control-right"][data-automation-pagination-control-disabled="false"]',
      );
      if (!next) break;
      next.click();
      const changed = await waitFor(() => {
        const now = scrapePopupKeywordPage()[0];
        return now && now.name && now.name !== prev;
      }, 10000);
      if (!changed) break;
      await sleep(200);
    }
    return all;
  }

  function crc32(bytes) {
    let table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
      }
      crc32.table = table;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concatBytes(parts) {
    let total = 0;
    for (const part of parts) total += part.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const data = file.bytes;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      locals.push(local, data);
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centrals.push(central);
      offset += local.length + data.length;
    }
    let cdSize = 0;
    for (const part of centrals) cdSize += part.length;
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    return concatBytes([...locals, ...centrals, eocd]);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function saveZip(bytes, filename) {
    return new Promise((resolve) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ ok: false, error: "no-runtime" });
        return;
      }
      try {
        chrome.runtime.sendMessage(
          {
            type: "download-file",
            filename,
            base64: bytesToBase64(bytes),
            mime: "application/zip",
          },
          (res) => {
            const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
            if (error) resolve({ ok: false, error });
            else resolve(res || { ok: false, error: "empty-response" });
          },
        );
      } catch (error) {
        resolve({ ok: false, error: String(error) });
      }
    });
  }

  function landingCsvFiles(rows) {
    const summaryCols = [
      ["domain", "域名"],
      ["index", "序号"],
      ["landing", "着陆页"],
      ["clicks", "点击量"],
      ["sharePct", "点击量占比"],
      ["change", "变动"],
      ["desktopPct", "桌面端占比"],
      ["mobilePct", "移动端占比"],
      ["keywordCount", "关键词数"],
      ["topKeyword", "热搜关键词"],
    ];
    const trendCols = [
      ["domain", "域名"],
      ["landing", "着陆页"],
      ["name", "日期"],
      ["clicks", "点击量"],
    ];
    const keywordCols = [
      ["domain", "域名"],
      ["landing", "着陆页"],
      ["index", "序号"],
      ["name", "关键词"],
      ["clicks", "点击量"],
      ["sharePct", "点击量占比"],
      ["change", "变动"],
      ["kwVolume", "规模"],
      ["kwVolumeAverage", "平均体量"],
      ["cpc", "CPC"],
      ["desktopPct", "桌面端占比"],
      ["mobilePct", "移动端占比"],
    ];
    const failCols = [
      ["domain", "域名"],
      ["landing", "着陆页"],
      ["name", "阶段"],
      ["note", "原因"],
    ];
    const groups = {};
    for (const row of rows) {
      const key = row.domain;
      if (!key) continue;
      (groups[key] || (groups[key] = [])).push(row);
    }
    const files = [];
    for (const name of Object.keys(groups)) {
      const group = groups[name];
      const folder = String(name).replace(/\./g, "-");
      const summary = group.filter((row) => row.type === "着陆页");
      const trends = group.filter((row) => String(row.type || "").startsWith("点击量趋势"));
      const keywords = group.filter((row) => row.type === "关键词");
      const fails = group.filter((row) => row.type === "失败");
      files.push({ name: `${folder}/${folder}-汇总.csv`, columns: summaryCols, rows: summary });
      if (trends.length) files.push({ name: `${folder}/${folder}-趋势.csv`, columns: trendCols, rows: trends });
      if (keywords.length) files.push({ name: `${folder}/${folder}-关键词.csv`, columns: keywordCols, rows: keywords });
      if (fails.length) files.push({ name: `${folder}/${folder}-失败.csv`, columns: failCols, rows: fails });
    }
    const encoder = new TextEncoder();
    return files.map((file) => ({
      name: file.name,
      bytes: encoder.encode(toCsv(file.rows, file.columns)),
    }));
  }

  function landingRecord(extra) {
    return Object.assign(
      {
        type: "",
        domain: "",
        landing: "",
        index: "",
        name: "",
        clicks: "",
        sharePct: "",
        change: "",
        desktopPct: "",
        mobilePct: "",
        kwVolume: "",
        kwVolumeAverage: "",
        cpc: "",
        keywordCount: "",
        topKeyword: "",
        note: "",
      },
      extra,
    );
  }

  async function extractLandingRowDetails(domain, row, rowIndex, keywordPages, out) {
    const fail = (stage, reason) => {
      out.push(
        landingRecord({
          type: "失败",
          domain,
          landing: row.landing,
          name: stage,
          note: reason || "",
        }),
      );
    };
    let opened = false;
    try {
      opened = await openLandingTrend(rowIndex);
    } catch (error) {
      fail("趋势", error && error.message ? error.message : String(error));
      closeLandingPopup();
      return { points: 0, keywords: 0, failed: true };
    }
    if (!opened) {
      fail("趋势", "打不开趋势弹窗");
      closeLandingPopup();
      return { points: 0, keywords: 0, failed: true };
    }
    let points = [];
    try {
      points = await readDailyTrend();
    } catch (error) {
      fail("趋势", error && error.message ? error.message : String(error));
    }
    if (!points.length) fail("趋势", "日趋势为空");
    points.forEach((point) => {
      out.push(
        landingRecord({
          type: "点击量趋势(天)",
          domain,
          landing: row.landing,
          index: row.index,
          name: point.date,
          clicks: String(point.value),
          note: "查看趋势",
        }),
      );
    });
    let keywords = [];
    try {
      keywords = await scrapeLandingKeywords(keywordPages);
    } catch (error) {
      fail("关键词", error && error.message ? error.message : String(error));
    }
    keywords.forEach((kw, idx) => {
      out.push(
        landingRecord({
          type: "关键词",
          domain,
          landing: row.landing,
          index: String(idx + 1),
          name: kw.name,
          clicks: kw.clicks,
          sharePct: kw.sharePct,
          change: kw.change,
          desktopPct: kw.desktopPct,
          mobilePct: kw.mobilePct,
          kwVolume: kw.kwVolume,
          kwVolumeAverage: kw.kwVolumeAverage,
          cpc: kw.cpc,
        }),
      );
    });
    closeLandingPopup();
    return { points: points.length, keywords: keywords.length, failed: !points.length };
  }

  async function exportLanding(opts) {
    if (detectPageKind() !== "landing") {
      return { ok: false, error: "这一页不是着陆页。请停在着陆页再试。" };
    }
    closeLandingPopup();
    const mark = (info) => {
      document.documentElement.dataset.bbProgress = JSON.stringify(info);
    };
    mark({ stage: "duration" });
    const durationOk = await ensureLandingLast28Days();
    if (!durationOk) {
      return { ok: false, error: "切不到最后 28 天数。请先在右上角选最后 28 天数再试。" };
    }
    const tabs = landingDomainTabs();
    const domains = [...new Set((tabs.length ? tabs.map((item) => item.domain) : [selectedDomain()]).filter(Boolean))];
    if (!domains.length) {
      return { ok: false, error: "找不到可导出的域名。" };
    }
    const maxPages = Math.max(1, Math.min(5, parseInt(opts && opts.pages, 10) || 5));
    const keywordPages = Math.max(1, Math.min(5, parseInt(opts && opts.keywordPages, 10) || 5));
    const clickFloor = Number(opts && opts.clickFloor) > 0 ? Number(opts.clickFloor) : 10000;
    const out = [];
    const startedAt = Date.now();
    let landingCount = 0;
    let detailCount = 0;
    let failCount = 0;
    const perDomain = [];
    for (let d = 0; d < domains.length; d += 1) {
      const domain = domains[d];
      mark({ domainIndex: d + 1, domains: domains.length, domain, stage: "switch" });
      const switched = await switchLandingDomain(domain);
      if (!switched) {
        out.push(landingRecord({ type: "失败", domain, landing: "", name: "切换域名", note: "切不到该域名或表格为空" }));
        failCount += 1;
        continue;
      }
      let serial = 0;
      let pages = 0;
      let detailHere = 0;
      let failHere = 0;
      for (let page = 1; page <= maxPages; page += 1) {
        const landingRows = scrapeLandingPage();
        if (!landingRows.length) {
          if (page === 1) {
            out.push(landingRecord({ type: "失败", domain, landing: "", name: "列表", note: "读不到表格" }));
            failCount += 1;
            failHere += 1;
          }
          break;
        }
        pages = page;
        landingCount += landingRows.length;
        for (const row of landingRows) {
          serial += 1;
          const { trendBtn, ...rest } = row;
          rest.index = String(serial);
          out.push(rest);
        }
        const qualify = landingRows
          .map((row, index) => ({ row, index }))
          .filter((item) => meetsClickFloor(item.row.clicks, clickFloor));
        for (let q = 0; q < qualify.length; q += 1) {
          const { row, index } = qualify[q];
          mark({
            domainIndex: d + 1,
            domains: domains.length,
            domain,
            page,
            i: q + 1,
            total: qualify.length,
            landing: row.landing,
            stage: "detail",
          });
          const result = await extractLandingRowDetails(domain, row, index, keywordPages, out);
          detailCount += 1;
          detailHere += 1;
          if (result.failed) {
            failCount += 1;
            failHere += 1;
          }
          await sleep(150);
        }
        const last = landingRows[landingRows.length - 1];
        const stop = !meetsClickFloor(last.clicks, clickFloor) || page >= maxPages || !landingPagerNext();
        if (stop) break;
        mark({ domainIndex: d + 1, domains: domains.length, domain, page, stage: "next-page" });
        const moved = await nextLandingPage();
        if (!moved) break;
      }
      perDomain.push({
        domain,
        rows: serial,
        pages,
        details: detailHere,
        fails: failHere,
        first: (out.find((row) => row.type === "着陆页" && row.domain === domain) || {}).landing || "",
      });
    }
    if (!landingCount) {
      return { ok: false, error: "找到了着陆页，但读不到表格。等页面加载完再试。" };
    }
    mark({ domains: domains.length, stage: "zip" });
    const filename = normalizeFilename((opts && opts.filename) || datedLandingZipName());
    const downloaded = await saveZip(zipStore(landingCsvFiles(out)), filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存压缩包失败。", rows: out.length, filename, kind: "landing" };
    }
    const timing = { totalMs: Date.now() - startedAt, mode: "daily" };
    document.documentElement.dataset.bbTiming = JSON.stringify(timing);
    return {
      ok: true,
      rows: out.length,
      landingRows: landingCount,
      detailRows: detailCount,
      failRows: failCount,
      domains: perDomain,
      filename,
      kind: "landing",
      mode: "daily",
      via: "downloads",
      timing,
    };
  }

  function overviewDomain() {
    try {
      const query = new URLSearchParams(location.search).get("q");
      if (query) return query.trim();
    } catch {
      // keep fallback
    }
    const item = document.querySelector('[data-at="search-item"]');
    return normText(item) || "domain";
  }

  function overviewFolder(domain) {
    return String(domain || "domain").replace(/\./g, "-");
  }

  function overviewAt(name) {
    return document.querySelector(`[data-at="${name}"]`);
  }

  function overviewAtText(name) {
    return normText(overviewAt(name));
  }

  function overviewField(root, name) {
    const scope = root || document;
    const el = scope.querySelector(`[data-at="${name}"]`);
    return normText(el);
  }

  function parseOverviewKpi(at, fallbackTitle) {
    const el = overviewAt(at);
    const lines = ((el && el.innerText) || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line && line !== "按“Tab”启用图形图表访问模块。");
    const title = lines[0] || fallbackTitle;
    const value = lines[1] || "";
    const rest = lines.slice(2);
    const change = rest.find((line) => /^[+\-↓↑]/.test(line)) || "";
    const note = rest.filter((line) => line !== change).join(" ");
    return { title, value, change, note };
  }

  function overviewCard(section, item, value, change, note) {
    return {
      section: section || "",
      item: item || "",
      value: value || "",
      change: change || "",
      note: note || "",
    };
  }

  async function revealOverviewWidgets() {
    for (let i = 0; i < 14; i += 1) {
      if (overviewAt("backlinks-table") && overviewAt("ref-domains-table") && overviewAt("top-anchors-table")) break;
      window.scrollBy(0, 900);
      await sleep(350);
    }
    await sleep(200);
  }

  async function closePlotA11y() {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const close = [...dialog.querySelectorAll("button, div, span")].find((el) => normText(el) === "关闭");
    if (close) close.click();
    await sleep(250);
    return true;
  }

  function overviewTableMatches(node, headerTest) {
    if (!node || node.querySelectorAll("tr").length < 3) return null;
    const head = [...(node.querySelector("tr")?.cells || [])].map((cell) => cell.innerText.trim()).join(",");
    if (headerTest && !headerTest.test(head)) return null;
    return node;
  }

  async function readPlotA11yTable(widgetAt, headerTest) {
    const root = overviewAt(widgetAt);
    if (!root) return { header: [], rows: [] };
    let table = overviewTableMatches(root.querySelector("table"), headerTest);
    if (!table) {
      await closePlotA11y();
      const a11y =
        root.querySelector('[class*="PlotA11yModule"]') || root.querySelector('[class*="PlotA11y"]');
      if (!a11y) return { header: [], rows: [] };
      a11y.scrollIntoView({ block: "center", behavior: "instant" });
      a11y.focus();
      a11y.click();
      await sleep(300);
      const jump = [...root.querySelectorAll("a,button,div,span"), ...document.querySelectorAll("a,button,div,span")].find(
        (el) => normText(el) === "跳到图示数据表",
      );
      if (jump) jump.click();
      table = await waitFor(
        () =>
          overviewTableMatches(root.querySelector("table"), headerTest) ||
          overviewTableMatches(document.querySelector('[role="dialog"] table'), headerTest),
        8000,
      );
    }
    if (!table) {
      await closePlotA11y();
      return { header: [], rows: [] };
    }
    const trs = [...table.querySelectorAll("tr")];
    const header = [...trs[0].cells].map((cell) => cell.innerText.trim());
    const rows = trs.slice(1).map((tr) => {
      const cells = [...tr.cells].map((cell) => cell.innerText.trim());
      const rec = {};
      header.forEach((name, index) => {
        rec[name] = cells[index] || "";
      });
      return rec;
    });
    await closePlotA11y();
    return { header, rows };
  }

  function scrapeOverviewMeta(domain) {
    const selectedDb =
      [...document.querySelectorAll('[data-at^="db-pill-"]')].find((el) => /__se|selected/i.test(String(el.className))) ||
      overviewAt("db-pill-worldwide");
    return [
      overviewCard("元数据", "域名", domain, "", ""),
      overviewCard("元数据", "数据库", normText(selectedDb) || overviewAtText("select-database"), "", ""),
      overviewCard("元数据", "设备", overviewAtText("select-device"), "", ""),
      overviewCard("元数据", "报告日期", overviewAtText("select-date"), "", ""),
      overviewCard("元数据", "货币", overviewAtText("select-currency"), "", ""),
    ];
  }

  function scrapeOverviewSeo() {
    const cards = [
      ["do-summary-as", "Authority Score"],
      ["do-summary-ot", "自然流量"],
      ["do-summary-pt", "付费流量"],
      ["do-summary-ref_domains", "引荐域名"],
      ["do-summary-ts", "流量比例"],
      ["do-summary-ok", "自然搜索关键词"],
      ["do-summary-pk", "付费关键词"],
      ["do-summary-bl", "反向链接"],
    ];
    const rows = cards.map(([at, title]) => {
      const kpi = parseOverviewKpi(at, title);
      return overviewCard("SEO", kpi.title || title, kpi.value, kpi.change, kpi.note);
    });
    const blob = document.body.innerText || "";
    const follow = blob.match(/Follow 链接\s*([^\s]+)/);
    const nofollow = blob.match(/NoFollow 链接\s*([^\s]+)/i);
    if (follow) rows.push(overviewCard("SEO", "Follow 链接", follow[1], "", ""));
    if (nofollow) rows.push(overviewCard("SEO", "NoFollow 链接", nofollow[1], "", ""));
    const typeRoot = overviewAt("backlink-type-table");
    if (typeRoot) {
      const names = [...typeRoot.querySelectorAll('[data-at="type-name"]')].map(normText);
      const percents = [...typeRoot.querySelectorAll('[data-at="percent"]')].map(normText);
      const values = [...typeRoot.querySelectorAll('[data-at="value"]')].map(normText);
      names.forEach((name, index) => {
        if (!name) return;
        rows.push(overviewCard("反向链接类型", name, values[index] || "", "", percents[index] || ""));
      });
    }
    return rows;
  }

  function scrapeOverviewAi() {
    const rows = [
      overviewCard("AI 可见度", "可见度", overviewAtText("ai-chart-value"), "", ""),
      overviewCard("AI 可见度", "提及", overviewAtText("ai-mentions-value"), "", ""),
      overviewCard("AI 可见度", "引用的页面", overviewAtText("ai-cited-pages-value"), "", ""),
      overviewCard("AI 可见度", "ChatGPT 提及", overviewAtText("gpt-mentions"), "", ""),
      overviewCard("AI 可见度", "ChatGPT 引用页", overviewAtText("gpt-pages"), "", ""),
      overviewCard("AI 可见度", "AI 概览 提及", overviewAtText("ai-overview-mentions"), "", ""),
      overviewCard("AI 可见度", "AI 概览 引用页", overviewAtText("ai-overview-pages"), "", ""),
      overviewCard("AI 可见度", "AI 模式 提及", overviewAtText("ai-mode-mentions"), "", ""),
      overviewCard("AI 可见度", "AI 模式 引用页", overviewAtText("ai-mode-pages"), "", ""),
      overviewCard("AI 可见度", "Gemini 提及", overviewAtText("gemini-mentions"), "", ""),
      overviewCard("AI 可见度", "Gemini 引用页", overviewAtText("gemini-pages"), "", ""),
      overviewCard("SERP 分布", "自然搜索", overviewAtText("organic-counter"), "", ""),
      overviewCard("SERP 分布", "AI Overviews", overviewAtText("aiRanked-counter"), "", ""),
      overviewCard("SERP 分布", "其他 SERP 精选结果", overviewAtText("restRanked-counter"), "", ""),
    ];
    const table = overviewAt("country-distribution-table");
    if (table) {
      [...table.querySelectorAll('[role="row"]')].slice(1).forEach((row) => {
        const country = overviewField(row, "db-title") || overviewField(row, "country");
        const parts = normText(row).split(" ").filter(Boolean);
        const mentions = parts[parts.length - 1] || "";
        const visibility = parts[parts.length - 2] || "";
        if (!country) return;
        rows.push(overviewCard("按国家划分", country, visibility, "", mentions ? `提及 ${mentions}` : ""));
      });
    }
    return rows.filter((row) => row.value || row.note);
  }

  function scrapeOverviewBacklinks() {
    const table = overviewAt("backlinks-table");
    if (!table) return [];
    return [...table.querySelectorAll('[role="row"]')]
      .filter((row) => row.querySelector('[data-at="source-title-value"], [data-at="url-value"]'))
      .map((row) => {
        const urls = [...row.querySelectorAll('[data-at="url-value"]')].map(normText);
        const texts = [...row.querySelectorAll('[data-at="text-value"]')].map(normText);
        const title = texts.find((text) => text && text !== "Follow") || overviewField(row, "source-title-value");
        const extra = texts.filter((text) => text && text !== "Follow" && text !== title);
        let anchor = extra[0] || "";
        if (!anchor) {
          anchor = overviewField(row, "anchor-value").replace(/^Follow\s+/i, "").trim();
        }
        return {
          title,
          sourceUrl: urls[0] || "",
          anchor,
          targetUrl: urls[1] || "",
          type: overviewField(row, "type-value") || overviewField(row, "nofollow-value"),
        };
      })
      .filter((row) => row.title || row.sourceUrl);
  }

  function scrapeOverviewRefDomains() {
    const table = overviewAt("ref-domains-table");
    if (!table) return [];
    return [...table.querySelectorAll('[role="row"]')]
      .filter((row) => row.querySelector('[data-at="domain-value"], [data-at="display-domain"]'))
      .map((row) => ({
        root: overviewField(row, "display-domain") || overviewField(row, "domain-value"),
        ip: overviewField(row, "display-ip") || overviewField(row, "ip-value"),
        backlinks: overviewField(row, "backlinks-value"),
      }))
      .filter((row) => row.root);
  }

  function scrapeOverviewAnchors() {
    const table = overviewAt("top-anchors-table");
    if (!table) return [];
    return [...table.querySelectorAll('[role="row"]')]
      .filter((row) => row.querySelector('[data-at="anchor-value"]'))
      .map((row) => ({
        anchor: overviewField(row, "anchor-value"),
        domains: overviewField(row, "domains-value"),
        backlinks: overviewField(row, "backlinks-value"),
      }))
      .filter((row) => row.anchor);
  }

  async function readOverviewChart(widgetAt) {
    delete document.documentElement.dataset.bbOverviewChart;
    window.postMessage({ type: "bb-sw-hc", cmd: "overview-chart", widget: widgetAt, id: `ov-${Date.now()}` }, "*");
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const raw = document.documentElement.dataset.bbOverviewChart;
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          if (Array.isArray(payload)) return payload;
        } catch {
          // keep waiting
        }
      }
      await sleep(50);
    }
    return [];
  }

  function flattenTrendTable(table, domain) {
    if (!table || !table.rows || !table.rows.length) return [];
    const out = [];
    table.rows.forEach((row) => {
      const date = row.date || row.Date || "";
      Object.keys(row).forEach((key) => {
        if (key === "date" || key === "Date") return;
        out.push({
          domain,
          series: key,
          date,
          value: row[key],
        });
      });
    });
    return out;
  }

  function overviewCsvFiles(domain, packs) {
    const folder = overviewFolder(domain);
    const prefix = `${folder}/${folder}`;
    const cardCols = [
      ["section", "板块"],
      ["item", "项目"],
      ["value", "数值"],
      ["change", "变动"],
      ["note", "备注"],
    ];
    const trendCols = [
      ["domain", "域名"],
      ["series", "序列"],
      ["date", "日期"],
      ["value", "数值"],
    ];
    const files = [];
    const push = (name, columns, rows) => {
      if (!rows || !rows.length) return;
      files.push({ name: `${prefix}-${name}.csv`, columns, rows });
    };
    push("元数据", cardCols, packs.meta);
    push("SEO概览", cardCols, packs.seo);
    push("AI可见度", cardCols, packs.ai);
    push("流量趋势", trendCols, packs.traffic);
    push("关键词趋势", trendCols, packs.keywords);
    push(
      "反向链接",
      [
        ["title", "引荐页面标题"],
        ["sourceUrl", "引荐页面链接"],
        ["anchor", "锚文本"],
        ["targetUrl", "目标链接"],
        ["type", "类型"],
      ],
      packs.backlinks,
    );
    push(
      "引荐域名",
      [
        ["root", "根域名"],
        ["ip", "IP"],
        ["backlinks", "反向链接"],
      ],
      packs.refDomains,
    );
    push(
      "锚文本",
      [
        ["anchor", "锚链接"],
        ["domains", "域名"],
        ["backlinks", "反向链接"],
      ],
      packs.anchors,
    );
    const encoder = new TextEncoder();
    return files.map((file) => ({
      name: file.name,
      bytes: encoder.encode(toCsv(file.rows, file.columns)),
    }));
  }

  async function exportOverview(opts) {
    if (detectPageKind() !== "overview") {
      return { ok: false, error: "这一页不是 Semrush 域名概览。请停在概览页再试。" };
    }
    const domain = overviewDomain();
    const mark = (info) => {
      document.documentElement.dataset.bbProgress = JSON.stringify(info);
    };
    mark({ stage: "scroll", domain });
    await closePlotA11y();
    await revealOverviewWidgets();
    mark({ stage: "cards", domain });
    const meta = scrapeOverviewMeta(domain);
    const seo = scrapeOverviewSeo();
    const ai = scrapeOverviewAi();
    const backlinks = scrapeOverviewBacklinks();
    const refDomains = scrapeOverviewRefDomains();
    const anchors = scrapeOverviewAnchors();
    mark({ stage: "traffic-trend", domain });
    let trafficTable = { header: [], rows: await readOverviewChart("do-traffic-trend") };
    if (!trafficTable.rows.length) {
      trafficTable = await readPlotA11yTable("do-traffic-trend", /organicTraffic/i);
    }
    mark({ stage: "keywords-trend", domain });
    let keywordTable = { header: [], rows: await readOverviewChart("do-keywords-trend") };
    if (!keywordTable.rows.length) {
      keywordTable = await readPlotA11yTable("do-keywords-trend", /top3/i);
    }
    const traffic = flattenTrendTable(trafficTable, domain);
    const keywords = flattenTrendTable(keywordTable, domain);
    const files = overviewCsvFiles(domain, { meta, seo, ai, traffic, keywords, backlinks, refDomains, anchors });
    if (!files.length) {
      return { ok: false, error: "找到了域名概览，但读不到可导出的数据。" };
    }
    mark({ stage: "zip", domain });
    const filename = normalizeFilename((opts && opts.filename) || datedOverviewZipName());
    const downloaded = await saveZip(zipStore(files), filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存压缩包失败。", filename, kind: "overview" };
    }
    return {
      ok: true,
      kind: "overview",
      filename,
      domain,
      files: files.map((file) => file.name),
      rows: files.reduce((sum, file) => sum + 1, 0),
      trafficPoints: trafficTable.rows ? trafficTable.rows.length : 0,
      keywordPoints: keywordTable.rows ? keywordTable.rows.length : 0,
      backlinks: backlinks.length,
      via: "downloads",
    };
  }

  const REFDOMAIN_COLUMNS = [
    ["index", "序号"],
    ["root", "引荐根域名"],
    ["as", "AS"],
    ["category", "类别"],
    ["status", "状态"],
    ["follow", "Follow"],
    ["backlinks", "反向链接"],
    ["ip", "IP"],
    ["firstSeen", "首次发现"],
    ["lastSeen", "最近发现"],
  ];

  function refdomainDataRows() {
    return [...document.querySelectorAll('[role="row"]')].filter(
      (row) => row.querySelector('[data-ui-name="Row.Cell"]') && !row.querySelector('[role="columnheader"]'),
    );
  }

  function scrapeRefdomainPage() {
    return refdomainDataRows()
      .map((row) => {
        const cells = [...row.querySelectorAll('[data-ui-name="Row.Cell"]')];
        const domainCell = cells[1];
        const links = [...(domainCell ? domainCell.querySelectorAll("a") : [])]
          .map((el) => normText(el))
          .filter(Boolean);
        const root = links.find((text) => /\./.test(text) && text.length < 80) || "";
        const blob = domainCell ? domainCell.innerText || "" : "";
        const lost = blob.includes("丢失");
        const added = blob.includes("新增");
        const nofollow = /Nofollow/i.test(blob);
        const lines = blob
          .split(/\n+/)
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const skip = new Set([root, "丢失", "新增", "Nofollow", "Follow"]);
        const category =
          lines.find(
            (line) =>
              !skip.has(line) &&
              !line.startsWith("如果") &&
              !line.startsWith("此域名") &&
              line.length < 40,
          ) || "";
        return {
          root,
          as: normText(cells[0]),
          category,
          status: lost ? "丢失" : added ? "新增" : "活跃",
          follow: nofollow ? "Nofollow" : "Follow",
          backlinks: normText(cells[2]),
          ip: normText(cells[3]),
          firstSeen: normText(cells[4]),
          lastSeen: normText(cells[5]),
        };
      })
      .filter((row) => row.root);
  }

  function refdomainCount() {
    const matched = (document.body.innerText || "").match(/(\d+)\s*-\s*(\d+)\s*\((\d+)\)/);
    if (!matched) return { from: 0, to: 0, total: 0 };
    return {
      from: parseInt(matched[1], 10),
      to: parseInt(matched[2], 10),
      total: parseInt(matched[3], 10),
    };
  }

  function findRefdomainAllButton(memberLabels) {
    return [...document.querySelectorAll("button")].find((el) => {
      if (normText(el) !== "所有") return false;
      let node = el.parentElement;
      for (let i = 0; i < 6 && node; i += 1) {
        const blob = normText(node);
        if (memberLabels.every((label) => blob.includes(label))) return true;
        node = node.parentElement;
      }
      return false;
    });
  }

  function refdomainPillSelected(el) {
    return /SPill/.test(String(el.className));
  }

  async function ensureRefdomainAllFilters() {
    const groups = [
      ["所有", "活跃", "新增", "丢失"],
      ["所有", "Follow", "Nofollow"],
    ];
    for (const labels of groups) {
      const allBtn = findRefdomainAllButton(labels);
      if (!allBtn || refdomainPillSelected(allBtn)) continue;
      const prev = (scrapeRefdomainPage()[0] && scrapeRefdomainPage()[0].root) || "";
      allBtn.click();
      await waitFor(() => {
        const now = scrapeRefdomainPage();
        return now.length > 0 && (!prev || now[0].root !== prev || refdomainCount().total > 0);
      }, 12000);
      await sleep(400);
    }
  }

  function refdomainNextButton() {
    return (
      document.querySelector('[class*="SNextPage"]') ||
      [...document.querySelectorAll("button")].find((el) => {
        const text = normText(el);
        return text === "Next" || text === "下一页";
      }) ||
      null
    );
  }

  function refdomainPrevButton() {
    return (
      document.querySelector('[class*="SPrevPage"]') ||
      [...document.querySelectorAll("button")].find((el) => {
        const text = normText(el);
        return text === "Prev" || text === "上一页";
      }) ||
      null
    );
  }

  function pagerButtonEnabled(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  function refdomainNextEnabled() {
    return pagerButtonEnabled(refdomainNextButton());
  }

  function refdomainPrevEnabled() {
    return pagerButtonEnabled(refdomainPrevButton());
  }

  async function rewindSemrushPages(scrapeFn, keyFn) {
    for (let i = 0; i < 80; i += 1) {
      if (!refdomainPrevEnabled()) return;
      const rows = scrapeFn();
      const prevFirst = rows[0] ? keyFn(rows[0]) : "";
      const prevLast = rows.length ? keyFn(rows[rows.length - 1]) : "";
      const prev = refdomainPrevButton();
      prev.scrollIntoView({ block: "center", behavior: "instant" });
      prev.click();
      const changed = await waitForSemrushPageChange(scrapeFn, keyFn, prevFirst, prevLast);
      if (!changed) return;
    }
  }

  async function exportRefdomains(opts) {
    if (detectPageKind() !== "refdomains") {
      return { ok: false, error: "这一页不是 Semrush 引荐域名。请停在引荐域名报告再试。" };
    }
    const domain = overviewDomain();
    const mark = (info) => {
      document.documentElement.dataset.bbProgress = JSON.stringify(info);
    };
    mark({ stage: "filters", domain });
    await ensureRefdomainAllFilters();
    const all = [];
    const seen = new Set();
    let pages = 0;
    for (let page = 1; page <= 200; page += 1) {
      mark({ stage: "table", domain, page });
      const rows = scrapeRefdomainPage();
      if (!rows.length) {
        if (page === 1) return { ok: false, error: "找到了引荐域名页，但读不到表格。" };
        break;
      }
      pages += 1;
      for (const row of rows) {
        if (seen.has(row.root)) continue;
        seen.add(row.root);
        all.push(row);
      }
      if (!refdomainNextEnabled()) break;
      const prev = rows[0].root;
      const next = refdomainNextButton();
      next.scrollIntoView({ block: "center", behavior: "instant" });
      next.click();
      const changed = await waitFor(() => {
        const now = scrapeRefdomainPage();
        return now.length > 0 && now[0].root && now[0].root !== prev;
      }, 15000);
      if (!changed) break;
      await sleep(300);
    }
    if (!all.length) return { ok: false, error: "没有抽到引荐域名。" };
    const numbered = all.map((row, index) => Object.assign({ index: String(index + 1) }, row));
    const filename = normalizeFilename((opts && opts.filename) || defaultFilename());
    const text = toCsv(numbered, REFDOMAIN_COLUMNS);
    const downloaded = await saveCsv(text, filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存 CSV 失败。", rows: numbered.length, filename, kind: "refdomains" };
    }
    return {
      ok: true,
      kind: "refdomains",
      filename,
      domain,
      rows: numbered.length,
      pages,
      total: refdomainCount().total,
      via: "downloads",
    };
  }

  function hrefMatchesPath(href, pathname) {
    const want = pathname.replace(/\/$/, "");
    const text = String(href || "");
    return text.includes(pathname) || text.replace(/\/$/, "").includes(want);
  }

  function findSemrushReportTab(pathname) {
    const nodes = [...document.querySelectorAll("a,button,[role='tab']")];
    const matches = nodes.filter((el) => hrefMatchesPath(el.getAttribute("href") || "", pathname));
    return (
      matches.find((el) => el.getAttribute("role") === "tab") ||
      matches.find((el) => /^\//.test(el.getAttribute("href") || "")) ||
      matches[0] ||
      null
    );
  }

  async function gotoSemrushPath(pathname, ready) {
    const tab = findSemrushReportTab(pathname);
    if (tab) {
      tab.scrollIntoView({ block: "center", behavior: "instant" });
      tab.click();
    } else if (!location.pathname.replace(/\/$/, "").endsWith(pathname.replace(/\/$/, ""))) {
      return false;
    }
    const ok = await waitFor(() => {
      if (ready) return !!ready();
      return location.pathname.replace(/\/$/, "").endsWith(pathname.replace(/\/$/, ""));
    }, 20000);
    await sleep(800);
    return !!ok;
  }

  function findSemrushTabByLabel(label) {
    return [...document.querySelectorAll('[role="tab"]')].find((el) => normText(el) === label) || null;
  }

  async function gotoSemrushTab(label, ready) {
    const tab = findSemrushTabByLabel(label);
    if (tab) {
      tab.scrollIntoView({ block: "center", behavior: "instant" });
      tab.click();
    } else {
      return false;
    }
    const ok = await waitFor(() => !!ready(), 20000);
    await sleep(800);
    return !!ok;
  }

  function scrapeLabeledKpi(title) {
    const nodes = [...document.querySelectorAll("div")].filter((el) => {
      const text = (el.innerText || "").trim();
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      return lines[0] === title && lines.length >= 2 && lines.length <= 4 && text.length < 48;
    });
    nodes.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
    const el = nodes[0];
    if (!el) return overviewCard("概览", title, "", "", "");
    const lines = (el.innerText || "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const value = lines[1] || "";
    const change = lines.find((line, index) => index > 1 && /^[+\-–−↓↑]/.test(line)) || "";
    return overviewCard("概览", title, value, change, "");
  }

  async function ensureBacklinksOneYear() {
    const buttons = [...document.querySelectorAll("button")].filter((el) => normText(el) === "1 年");
    for (const btn of buttons) {
      if (btn.getAttribute("aria-pressed") === "true") continue;
      btn.click();
      await sleep(700);
    }
  }

  async function readBacklinksOverviewCharts() {
    delete document.documentElement.dataset.bbBacklinksCharts;
    window.postMessage({ type: "bb-sw-hc", cmd: "backlinks-overview-charts", id: `blc-${Date.now()}` }, "*");
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const raw = document.documentElement.dataset.bbBacklinksCharts;
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          if (payload && typeof payload === "object") return payload;
        } catch {
          // keep waiting
        }
      }
      await sleep(50);
    }
    return { referring: [], backlinks: [] };
  }

  function backlinksTableRows() {
    return [...document.querySelectorAll('[role="row"]')].filter(
      (row) => row.querySelector('[data-ui-name="Row.Cell"]') && !row.querySelector('[role="columnheader"]'),
    );
  }

  function backlinksHeaderCells() {
    const header = [...document.querySelectorAll('[role="row"]')].find((row) => row.querySelector('[role="columnheader"]'));
    if (!header) return [];
    return [...header.querySelectorAll('[role="columnheader"]')].map((el) =>
      (el.innerText || "").replace(/\s+/g, " ").trim(),
    );
  }

  function backlinksHeaderText() {
    return backlinksHeaderCells().join("\n");
  }

  function cellAtHeader(cells, headers, pattern) {
    const idx = headers.findIndex((text) => pattern.test(text));
    return idx >= 0 ? cells[idx] : null;
  }

  function backlinkType(anchorCell) {
    if (!anchorCell) return "Follow";
    const labels = [...anchorCell.querySelectorAll("button,[aria-label]")]
      .flatMap((el) => [normText(el), el.getAttribute("aria-label") || ""])
      .map((text) => text.trim())
      .filter(Boolean);
    const blob = `${labels.join("\n")}\n${anchorCell.innerText || ""}`;
    for (const type of ["Sponsored", "UGC", "Nofollow", "Follow"]) {
      if (new RegExp(`(^|\\s)${type}(?=\\s|$)`, "im").test(blob)) return type;
    }
    return "Follow";
  }

  function backlinkSourceFields(cells) {
    const sourceCell = cells[1];
    const sourceLines = ((sourceCell && sourceCell.innerText) || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const sourceUrl =
      sourceLines.find(
        (line) => /\//.test(line) && !/^语言/.test(line) && !/sem\.3ue|semrush\.com|__gmitm/.test(line),
      ) ||
      sourceLines.find((line) => /\//.test(line) && !/^语言/.test(line)) ||
      "";
    const sourceTitle =
      sourceLines.find((line) => line && line !== sourceUrl && !/^语言/.test(line) && !/^(EN|ES|FR|TW)$/.test(line)) ||
      "";
    return {
      pageAs: normText(cells[0]),
      sourceTitle,
      sourceUrl,
      externalLinks: normText(cells[2]),
      internalLinks: normText(cells[3]),
    };
  }

  function backlinkTargetFields(anchorCell) {
    const anchorLinks = [...(anchorCell ? anchorCell.querySelectorAll("a") : [])];
    const anchorLines = ((anchorCell && anchorCell.innerText) || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const targetUrl =
      anchorLines.find((line) => /https?:\/\//.test(line) || /^[\w.-]+\.[a-z]{2,}\//i.test(line)) ||
      (anchorLinks[1] && (anchorLinks[1].getAttribute("href") || normText(anchorLinks[1]))) ||
      "";
    const anchor =
      anchorLines.find(
        (line) =>
          line &&
          line !== targetUrl &&
          !/^链接类型/.test(line) &&
          !/^链接放置/.test(line) &&
          line !== "文本" &&
          line !== "内容" &&
          line !== "站内",
      ) ||
      (anchorLinks[0] && normText(anchorLinks[0])) ||
      "";
    return { anchor, targetUrl };
  }

  function scrapeBacklinksPage(includeType) {
    if (!/源页面标题/.test(backlinksHeaderText())) return [];
    const results = [];
    let shared = null;
    for (const row of backlinksTableRows()) {
      const rawCells = [...row.querySelectorAll('[data-ui-name="Row.Cell"]')];
      let anchorCell;
      let firstSeen;
      let lastSeen;
      if (rawCells.length >= 7) {
        const cells = rawCells.length > 7 ? rawCells.slice(rawCells.length - 7) : rawCells;
        shared = backlinkSourceFields(cells);
        anchorCell = cells[4];
        firstSeen = normText(cells[5]);
        lastSeen = normText(cells[6]);
      } else if (rawCells.length === 3 && shared) {
        [anchorCell] = rawCells;
        firstSeen = normText(rawCells[1]);
        lastSeen = normText(rawCells[2]);
      } else {
        continue;
      }
      const blob = row.innerText || "";
      const result = {
        ...shared,
        ...backlinkTargetFields(anchorCell),
        firstSeen,
        lastSeen,
        status: blob.includes("丢失") ? "丢失" : blob.includes("新增") ? "新增" : "活跃",
      };
      if (includeType) result.type = backlinkType(anchorCell);
      if ((result.sourceTitle || result.sourceUrl) && (result.anchor || result.targetUrl)) results.push(result);
    }
    return results;
  }

  function scrapeAllBacklinksPage() {
    return scrapeBacklinksPage(true);
  }

  function scrapeBestBacklinksPage() {
    return scrapeBacklinksPage(false);
  }

  function scrapeOutboundPage() {
    const headers = backlinksHeaderCells();
    if (!headers.some((text) => /出站链接/.test(text)) || !headers.some((text) => /根域名/.test(text))) return [];
    return backlinksTableRows()
      .map((row) => {
        const cells = [...row.querySelectorAll('[data-ui-name="Row.Cell"]')];
        const domainCell = cellAtHeader(cells, headers, /根域名/);
        const links = [...(domainCell ? domainCell.querySelectorAll("a") : [])].map(normText).filter(Boolean);
        const root =
          links.find((text) => /^[\w.-]+\.[a-z]{2,}$/i.test(text)) ||
          links.find((text) => /\./.test(text) && !/\s/.test(text) && text.length < 80) ||
          "";
        const blob = (domainCell && domainCell.innerText) || "";
        return {
          as: normText(cellAtHeader(cells, headers, /^AS$/)),
          root,
          outbound: normText(cellAtHeader(cells, headers, /出站链接/)),
          firstSeen: normText(cellAtHeader(cells, headers, /首次发现/)),
          lastSeen: normText(cellAtHeader(cells, headers, /上次发现|最近发现/)),
          status: blob.includes("丢失") ? "丢失" : blob.includes("新增") ? "新增" : "活跃",
        };
      })
      .filter((row) => row.root);
  }

  async function waitForSemrushPageChange(scrapeFn, keyFn, prevFirst, prevLast) {
    const changed = await waitFor(() => {
      const now = scrapeFn();
      if (!now.length || !keyFn(now[0])) return false;
      if (keyFn(now[0]) === prevFirst) return false;
      if (prevLast && keyFn(now[now.length - 1]) === prevLast) return false;
      return true;
    }, 15000);
    if (!changed) return false;
    let signature = "";
    for (let i = 0; i < 12; i += 1) {
      await sleep(200);
      const now = scrapeFn();
      if (!now.length) continue;
      const nextSig = `${now.length}|${keyFn(now[0])}|${keyFn(now[now.length - 1])}`;
      if (nextSig === signature) return true;
      signature = nextSig;
    }
    return true;
  }

  async function scrapeSemrushPaged(scrapeFn, keyFn, options = {}) {
    const all = [];
    const seen = new Set();
    const dedupe = options.dedupe !== false;
    for (let page = 1; page <= 200; page += 1) {
      const rows = scrapeFn();
      if (!rows.length) break;
      for (const row of rows) {
        const key = keyFn(row);
        if (!key || (dedupe && seen.has(key))) continue;
        seen.add(key);
        all.push(row);
      }
      if (!refdomainNextEnabled()) break;
      const prevFirst = keyFn(rows[0]);
      const prevLast = keyFn(rows[rows.length - 1]);
      const next = refdomainNextButton();
      next.scrollIntoView({ block: "center", behavior: "instant" });
      next.click();
      const changed = await waitForSemrushPageChange(scrapeFn, keyFn, prevFirst, prevLast);
      if (!changed) break;
    }
    return all;
  }

  function backlinksCardGroup() {
    return [...document.querySelectorAll('[role="radiogroup"]')].find((group) => {
      const labels = [...group.querySelectorAll('[role="radio"]')].map((radio) =>
        ((radio.innerText || "").split(/\n+/)[0] || "").trim(),
      );
      return ["所有", "最佳", "最新", "丢失且重要"].every((label) => labels.includes(label));
    });
  }

  function backlinksCard(label) {
    const group = backlinksCardGroup();
    if (!group) return null;
    return (
      [...group.querySelectorAll('[role="radio"]')].find(
        (radio) => (((radio.innerText || "").split(/\n+/)[0] || "").trim() === label),
      ) || null
    );
  }

  function backlinksCardSelected(label) {
    const card = backlinksCard(label);
    if (!card) return false;
    return card.getAttribute("aria-checked") === "true" || /selected/i.test(String(card.className));
  }

  async function clickBacklinksCard(label) {
    const card = backlinksCard(label);
    if (!card) return false;
    if (!backlinksCardSelected(label)) card.click();
    const switched = await waitFor(() => backlinksCardSelected(label), 15000);
    await sleep(800);
    return !!switched;
  }

  function backlinksTableUnavailable() {
    return /Data is unavailable|数据不可用|暂无数据|无可用数据/i.test(document.body.innerText || "");
  }

  async function waitForBacklinksRows(allowEmpty) {
    let zeroSince = 0;
    return waitFor(() => {
      if (backlinksTableUnavailable()) return !!allowEmpty;
      if (!/源页面标题/.test(backlinksHeaderText())) {
        zeroSince = 0;
        return false;
      }
      if (backlinksTableRows().length) return true;
      if (!allowEmpty) return false;
      if (!zeroSince) zeroSince = Date.now();
      return Date.now() - zeroSince >= 10000;
    }, allowEmpty ? 30000 : 15000);
  }

  async function clickBacklinksAll() {
    return clickBacklinksCard("所有");
  }

  async function clickBacklinksBest() {
    const switched = await clickBacklinksCard("最佳");
    if (!switched) return false;
    const card = backlinksCard("最佳");
    const count = Number.parseInt((((card && card.innerText) || "").match(/[\d,]+/) || [""])[0].replace(/,/g, ""), 10);
    const expected = count > 0 ? Math.min(100, count) : 1;
    const ready = await waitFor(() => scrapeBestBacklinksPage().length >= expected, 30000);
    return !!ready;
  }

  function backlinksCsvFiles(domain, packs) {
    const folder = overviewFolder(domain);
    const prefix = `${folder}/${folder}`;
    const cardCols = [
      ["section", "板块"],
      ["item", "项目"],
      ["value", "数值"],
      ["change", "变动"],
      ["note", "备注"],
    ];
    const trendCols = [
      ["date", "日期"],
      ["value", "数值"],
      ["diff", "变动"],
    ];
    const files = [];
    const push = (name, columns, rows, includeEmpty = false) => {
      if (!rows || (!rows.length && !includeEmpty)) return;
      files.push({ name: `${prefix}-${name}.csv`, columns, rows });
    };
    push("概览", cardCols, packs.kpis);
    push("引荐域名趋势", trendCols, packs.referring);
    push("反向链接趋势", trendCols, packs.backlinkTrend);
    push(
      "所有反向链接",
      [
        ["index", "序号"],
        ["type", "链接类型"],
        ["pageAs", "页面 AS"],
        ["sourceTitle", "源页面标题"],
        ["sourceUrl", "源页面 URL"],
        ["externalLinks", "外部链接"],
        ["internalLinks", "内部链接"],
        ["anchor", "锚文本"],
        ["targetUrl", "目标 URL"],
        ["firstSeen", "首次发现"],
        ["lastSeen", "上次发现"],
        ["status", "状态"],
      ],
      packs.all,
      true,
    );
    push(
      "最佳反向链接",
      [
        ["index", "序号"],
        ["pageAs", "页面 AS"],
        ["sourceTitle", "源页面标题"],
        ["sourceUrl", "源页面 URL"],
        ["externalLinks", "外部链接"],
        ["internalLinks", "内部链接"],
        ["anchor", "锚文本"],
        ["targetUrl", "目标 URL"],
        ["firstSeen", "首次发现"],
        ["lastSeen", "上次发现"],
        ["status", "状态"],
      ],
      packs.best,
    );
    push(
      "出站域名",
      [
        ["index", "序号"],
        ["root", "根域名"],
        ["as", "AS"],
        ["outbound", "出站链接"],
        ["firstSeen", "首次发现"],
        ["lastSeen", "上次发现"],
        ["status", "状态"],
      ],
      packs.outbound,
    );
    const encoder = new TextEncoder();
    return files.map((file) => ({
      name: file.name,
      bytes: encoder.encode(toCsv(file.rows, file.columns)),
    }));
  }

  async function exportBacklinks(opts) {
    if (detectPageKind() !== "backlinks") {
      return { ok: false, error: "这一页不是 Semrush 反向链接分析。请停在反向链接报告再试。" };
    }
    const domain = overviewDomain();
    const mark = (info) => {
      document.documentElement.dataset.bbProgress = JSON.stringify(info);
    };
    mark({ stage: "overview", domain });
    const overviewOk = await gotoSemrushPath(
      "/analytics/backlinks/overview/",
      () => /引荐域名/.test(document.body.innerText || "") && /出站域名/.test(document.body.innerText || ""),
    );
    if (!overviewOk) {
      return { ok: false, error: "打不开反向链接概览。" };
    }
    await ensureBacklinksOneYear();
    const kpis = ["引荐域名", "反向链接", "每月访问量", "自然流量", "出站域名"].map(scrapeLabeledKpi);
    const charts = await readBacklinksOverviewCharts();
    const referring = (charts.referring || []).map((row) => ({
      date: row.date,
      value: String(row.value ?? ""),
      diff: row.diff == null || row.diff === "" ? "" : String(row.diff),
    }));
    const backlinkTrend = (charts.backlinks || []).map((row) => ({
      date: row.date,
      value: String(row.value ?? ""),
      diff: row.diff == null || row.diff === "" ? "" : String(row.diff),
    }));
    mark({ stage: "all", domain });
    const backlinksTabOk = await gotoSemrushPath(
      "/analytics/backlinks/backlinks/",
      () => !!backlinksCardGroup(),
    );
    if (!backlinksTabOk) {
      return { ok: false, error: "打不开反向链接表。" };
    }
    await sleep(400);
    const allCardOk = await clickBacklinksAll();
    if (!allCardOk) {
      return { ok: false, error: "打不开所有反向链接表。" };
    }
    await waitForBacklinksRows(true);
    const allKey = (row) =>
      [
        row.sourceUrl,
        row.targetUrl,
        row.anchor,
        row.type,
        row.firstSeen,
        row.lastSeen,
        row.pageAs,
        row.externalLinks,
        row.internalLinks,
        row.status,
      ].join("|");
    if (scrapeAllBacklinksPage().length) {
      await rewindSemrushPages(scrapeAllBacklinksPage, allKey);
    }
    const allRaw = await scrapeSemrushPaged(scrapeAllBacklinksPage, allKey, { dedupe: false });
    const all = allRaw.map((row, index) => Object.assign({ index: String(index + 1) }, row));
    mark({ stage: "best", domain, all: all.length });
    const bestCardOk = await clickBacklinksBest();
    if (!bestCardOk) {
      return { ok: false, error: "打不开最佳反向链接表。" };
    }
    await sleep(400);
    const bestRaw = await scrapeSemrushPaged(
      scrapeBestBacklinksPage,
      (row) => `${row.sourceUrl}|${row.targetUrl}|${row.anchor}`,
    );
    const best = bestRaw.map((row, index) => Object.assign({ index: String(index + 1) }, row));
    mark({ stage: "outbound", domain, all: all.length, best: best.length });
    const outboundOk = await gotoSemrushPath(
      "/analytics/backlinks/outbound-domains/",
      () => /出站链接/.test(backlinksHeaderText()) && /根域名/.test(backlinksHeaderText()),
    );
    if (!outboundOk) {
      return { ok: false, error: "打不开出站域名表。" };
    }
    await sleep(400);
    const outboundRaw = await scrapeSemrushPaged(scrapeOutboundPage, (row) => row.root);
    const outbound = outboundRaw.map((row, index) => Object.assign({ index: String(index + 1) }, row));
    mark({ stage: "zip", domain });
    const files = backlinksCsvFiles(domain, { kpis, referring, backlinkTrend, all, best, outbound });
    if (!files.length) {
      return { ok: false, error: "找到了反向链接分析，但读不到可导出的数据。" };
    }
    const filename = normalizeFilename((opts && opts.filename) || defaultFilename());
    const downloaded = await saveZip(zipStore(files), filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存压缩包失败。", filename, kind: "backlinks" };
    }
    return {
      ok: true,
      kind: "backlinks",
      filename,
      domain,
      files: files.map((file) => file.name),
      all: all.length,
      best: best.length,
      outbound: outbound.length,
      referringPoints: referring.length,
      backlinkPoints: backlinkTrend.length,
      via: "downloads",
    };
  }

  function organicIntentLabel(cell) {
    const node = cell && cell.querySelector('[aria-label*="意图"]');
    const aria = (node && node.getAttribute("aria-label")) || "";
    const matched = aria.match(/意图[：:]\s*(.+)$/);
    return (matched && matched[1].trim()) || normText(cell);
  }

  function organicSerpFeatures(cell) {
    if (!cell) return "";
    const names = [...cell.querySelectorAll("[aria-label]")]
      .map((el) => {
        const aria = el.getAttribute("aria-label") || "";
        const matched = aria.match(/打开 SERP 上\s*(.+?)\s*的关键词排名报告/);
        return matched ? matched[1].trim() : "";
      })
      .filter(Boolean);
    return [...new Set(names)].join("、");
  }

  function organicRankChange(cell) {
    const lines = ((cell && cell.innerText) || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const hit = lines.find((line) => /^[+\-–−]\d+$/.test(line));
    return hit || "";
  }

  function organicVisibleUrl(cell) {
    const links = [...(cell ? cell.querySelectorAll("a") : [])].map(normText).filter(Boolean);
    return (
      links.find((text) => /\//.test(text) && !/sem\.3ue|semrush\.com|__gmitm/.test(text)) ||
      links.find((text) => /\./.test(text) && !/\s/.test(text) && text.length < 120) ||
      ""
    );
  }

  function scrapeOrganicPositionsPage() {
    const headers = backlinksHeaderCells();
    if (!headers.some((text) => text === "关键词") || !headers.some((text) => /搜索量/.test(text))) return [];
    return backlinksTableRows()
      .map((row) => {
        const cells = [...row.querySelectorAll('[data-ui-name="Row.Cell"]')];
        const kwCell = cellAtHeader(cells, headers, /^关键词$/);
        const links = [...(kwCell ? kwCell.querySelectorAll("a") : [])].map(normText).filter(Boolean);
        const keyword =
          links.find((text) => text && text.length < 120 && !/^https?:/.test(text)) ||
          ((kwCell && kwCell.innerText) || "")
            .split(/\n+/)
            .map((line) => line.replace(/\s+/g, " ").trim())
            .filter(Boolean)[0] ||
          "";
        const sfCell = cellAtHeader(cells, headers, /^SF$/);
        return {
          keyword,
          intent: organicIntentLabel(cellAtHeader(cells, headers, /^意图$/)),
          rank: normText(cellAtHeader(cells, headers, /^排名$/)),
          change: organicRankChange(sfCell),
          serp: organicSerpFeatures(sfCell),
          traffic: normText(cellAtHeader(cells, headers, /^流量$/)),
          trafficPct: normText(cellAtHeader(cells, headers, /流量\s*%/)),
          volume: normText(cellAtHeader(cells, headers, /搜索量/)),
          kd: normText(cellAtHeader(cells, headers, /KD/)),
          url: organicVisibleUrl(cellAtHeader(cells, headers, /^URL$/)),
          lastChange: normText(cellAtHeader(cells, headers, /上次更改/)),
        };
      })
      .filter((row) => row.keyword);
  }

  function scrapeOrganicCompetitorsPage() {
    const headers = backlinksHeaderCells();
    if (!headers.some((text) => /竞争程度/.test(text)) || !headers.some((text) => /^域名$/.test(text))) return [];
    return backlinksTableRows()
      .map((row) => {
        const cells = [...row.querySelectorAll('[data-ui-name="Row.Cell"]')];
        const domainCell = cellAtHeader(cells, headers, /^域名$/);
        const links = [...(domainCell ? domainCell.querySelectorAll("a") : [])].map(normText).filter(Boolean);
        const domain =
          links.find((text) => /^[\w.-]+\.[a-z]{2,}$/i.test(text)) ||
          links.find((text) => /\./.test(text) && !/\s/.test(text) && text.length < 80) ||
          "";
        return {
          domain,
          competition: normText(cellAtHeader(cells, headers, /竞争程度/)),
          common: normText(cellAtHeader(cells, headers, /通用关键词/)),
          seKeywords: normText(cellAtHeader(cells, headers, /SE 关键词/)),
          traffic: normText(cellAtHeader(cells, headers, /^流量$/)),
          cost: normText(cellAtHeader(cells, headers, /^成本$/)),
          paid: normText(cellAtHeader(cells, headers, /付费关键词/)),
        };
      })
      .filter((row) => row.domain);
  }

  function organicCsvFiles(domain, packs) {
    const folder = overviewFolder(domain);
    const prefix = `${folder}/${folder}`;
    const files = [];
    const push = (name, columns, rows) => {
      files.push({ name: `${prefix}-${name}.csv`, columns, rows: rows || [] });
    };
    push(
      "自然排名",
      [
        ["index", "序号"],
        ["keyword", "关键词"],
        ["intent", "意图"],
        ["rank", "排名"],
        ["change", "排名变化"],
        ["serp", "SERP 精选"],
        ["traffic", "流量"],
        ["trafficPct", "流量 %"],
        ["volume", "搜索量"],
        ["kd", "KD %"],
        ["url", "URL"],
        ["lastChange", "上次更改"],
      ],
      packs.positions,
    );
    push(
      "自然搜索竞争对手",
      [
        ["index", "序号"],
        ["domain", "域名"],
        ["competition", "竞争程度"],
        ["common", "通用关键词"],
        ["seKeywords", "SE 关键词"],
        ["traffic", "流量"],
        ["cost", "成本"],
        ["paid", "付费关键词"],
      ],
      packs.competitors,
    );
    const encoder = new TextEncoder();
    return files
      .filter((file) => file.rows.length)
      .map((file) => ({
        name: file.name,
        bytes: encoder.encode(toCsv(file.rows, file.columns)),
      }));
  }

  async function exportOrganic(opts) {
    if (detectPageKind() !== "organic") {
      return { ok: false, error: "这一页不是 Semrush 自然排名。请停在自然排名报告再试。" };
    }
    const domain = overviewDomain();
    const mark = (info) => {
      document.documentElement.dataset.bbProgress = JSON.stringify(info);
    };
    const posKey = (row) => `${row.keyword}|${row.url}|${row.rank}`;
    const compKey = (row) => row.domain;
    mark({ stage: "positions", domain });
    const posOk = await gotoSemrushTab(
      "排名",
      () =>
        /organic\/positions/i.test(location.pathname) &&
        /关键词/.test(backlinksHeaderText()) &&
        /搜索量/.test(backlinksHeaderText()),
    );
    if (!posOk) {
      return { ok: false, error: "打不开自然排名表。" };
    }
    await rewindSemrushPages(scrapeOrganicPositionsPage, posKey);
    const posRaw = await scrapeSemrushPaged(scrapeOrganicPositionsPage, posKey);
    const positions = posRaw.map((row, index) => Object.assign({ index: String(index + 1) }, row));
    mark({ stage: "competitors", domain, positions: positions.length });
    const compOk = await gotoSemrushTab(
      "竞争对手",
      () => /organic\/competitors/i.test(location.pathname) && /竞争程度/.test(backlinksHeaderText()),
    );
    if (!compOk) {
      return { ok: false, error: "打不开自然搜索竞争对手表。" };
    }
    await rewindSemrushPages(scrapeOrganicCompetitorsPage, compKey);
    const compRaw = await scrapeSemrushPaged(scrapeOrganicCompetitorsPage, compKey);
    const competitors = compRaw.map((row, index) => Object.assign({ index: String(index + 1) }, row));
    if (!positions.length) {
      return { ok: false, error: "找到了自然排名表，但读不到关键词。" };
    }
    if (!competitors.length) {
      return { ok: false, error: "找到了竞争对手表，但读不到域名。" };
    }
    mark({ stage: "zip", domain, positions: positions.length, competitors: competitors.length });
    const files = organicCsvFiles(domain, { positions, competitors });
    if (!files.length) {
      return { ok: false, error: "找到了自然排名，但读不到可导出的表格。" };
    }
    const filename = normalizeFilename((opts && opts.filename) || defaultFilename());
    const downloaded = await saveZip(zipStore(files), filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存压缩包失败。", filename, kind: "organic" };
    }
    return {
      ok: true,
      kind: "organic",
      filename,
      domain,
      files: files.map((file) => file.name),
      positions: positions.length,
      competitors: competitors.length,
      via: "downloads",
    };
  }

  const GENERATOR_COLUMNS = [
    ["index", "序号"],
    ["keyword", "关键词"],
    ["volume28d", "28天体量"],
    ["volumeAvg", "平均体量"],
    ["trend", "年趋势"],
    ["zeroClick", "零点击搜索"],
    ["kd", "KD"],
    ["intent", "意图"],
    ["cpc", "CPC"],
  ];

  function scrapeGeneratorPage() {
    const cols = dataColumns();
    if (cols.length < 7) return [];
    const cellsOf = (col) => [...col.querySelectorAll(".swReactTableCell")];
    const kwCells = cellsOf(cols[0]);
    const rows = [];
    for (let i = 0; i < kwCells.length; i += 1) {
      const keyword =
        normText(kwCells[i].querySelector(".search-keyword a, a.swTable-content, .swTable-content")) ||
        normText(kwCells[i]);
      if (!keyword) continue;
      rows.push({
        keyword,
        volume28d: normText(cols[1] && cellsOf(cols[1])[i]),
        volumeAvg: normText(cols[2] && cellsOf(cols[2])[i]),
        trend: normText(cols[3] && cellsOf(cols[3])[i]),
        zeroClick: normText(cols[4] && cellsOf(cols[4])[i]),
        kd: normText(cols[5] && cellsOf(cols[5])[i]),
        intent: normText(cols[6] && cellsOf(cols[6])[i]),
        cpc: normText(cols[7] && cellsOf(cols[7])[i]),
      });
    }
    return rows;
  }

  async function goToGeneratorFirstPage() {
    const first = landingPagerControl("control-left-end");
    if (!first || first.getAttribute("data-automation-pagination-control-disabled") === "true") return true;
    const prev = (scrapeGeneratorPage()[0] && scrapeGeneratorPage()[0].keyword) || "";
    first.click();
    return !!(await waitFor(() => {
      const rows = scrapeGeneratorPage();
      return rows.length > 0 && rows[0].keyword && rows[0].keyword !== prev;
    }, 20000));
  }

  async function nextGeneratorPage() {
    const next = landingPagerNext();
    if (!next) return false;
    const prev = (scrapeGeneratorPage()[0] && scrapeGeneratorPage()[0].keyword) || "";
    next.scrollIntoView({ block: "center", behavior: "instant" });
    next.click();
    return !!(await waitFor(() => {
      const rows = scrapeGeneratorPage();
      return rows.length > 0 && rows[0].keyword && rows[0].keyword !== prev;
    }, 20000));
  }

  async function exportGenerator(opts) {
    if (detectPageKind() !== "generator") {
      return { ok: false, error: "这一页不是 Similarweb 关键词生成器。请停在生成器表格再试。" };
    }
    const ready = scrapeGeneratorPage().length > 0 || (await waitFor(() => scrapeGeneratorPage().length > 0, 15000));
    if (!ready) {
      return { ok: false, error: "找到了关键词生成器，但读不到表格。" };
    }
    const mark = (info) => {
      document.documentElement.dataset.bbProgress = JSON.stringify(info);
    };
    const seed = generatorKeyword();
    mark({ stage: "table", domain: seed, page: 1 });
    const jumped = await goToGeneratorFirstPage();
    if (!jumped) {
      return { ok: false, error: "无法回到第 1 页，已取消导出，避免从中间页开始漏数据。" };
    }
    const total = Math.max(1, landingTotalPages());
    const want = Math.min(total, Math.max(1, parseInt(opts && opts.pages, 10) || DEFAULT_PAGES));
    const all = [];
    const seen = new Set();
    let pages = 0;
    for (let i = 0; i < want; i += 1) {
      mark({ stage: "table", domain: seed, page: i + 1 });
      const pageRows = scrapeGeneratorPage();
      if (!pageRows.length) {
        if (i === 0) return { ok: false, error: "找到了表格，但读不到行。刷新后再试。" };
        break;
      }
      for (const row of pageRows) {
        if (!row.keyword || seen.has(row.keyword)) continue;
        seen.add(row.keyword);
        all.push(row);
      }
      pages += 1;
      if (i === want - 1) break;
      const moved = await nextGeneratorPage();
      if (!moved) break;
      await sleep(300);
    }
    if (!all.length) return { ok: false, error: "没有抽到关键词。" };
    const numbered = all.map((row, index) => Object.assign({ index: String(index + 1) }, row));
    const filename = normalizeFilename((opts && opts.filename) || defaultFilename());
    const text = toCsv(numbered, GENERATOR_COLUMNS);
    const downloaded = await saveCsv(text, filename);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error || "保存 CSV 失败。", rows: numbered.length, pages, filename, kind: "generator" };
    }
    return {
      ok: true,
      kind: "generator",
      filename,
      rows: numbered.length,
      pages,
      total,
      via: "downloads",
    };
  }

  async function exportAny(opts) {
    const kind = detectPageKind();
    if (kind === "overview") return exportOverview(opts);
    if (kind === "refdomains") return exportRefdomains(opts);
    if (kind === "backlinks") return exportBacklinks(opts);
    if (kind === "organic") return exportOrganic(opts);
    if (kind === "generator") return exportGenerator(opts);
    if (kind === "performance") return exportPerformance(opts);
    if (kind === "landing") return exportLanding(opts);
    if (kind === "keywords" || findTable()) return exportPages(opts);
    return { ok: false, error: "no-fn" };
  }

  window.__bbSwExport = exportAny;
  window.__bbSwKeywordExport = exportPages;
  window.__bbSwPerformanceExport = exportPerformance;
  window.__bbSwLandingExport = exportLanding;
  window.__bbSwOverviewExport = exportOverview;
  window.__bbSwRefdomainsExport = exportRefdomains;
  window.__bbSwBacklinksExport = exportBacklinks;
  window.__bbSwOrganicExport = exportOrganic;
  window.__bbSwGeneratorExport = exportGenerator;
  window.__bbSwFillLandingDomains = fillLandingParentDomains;
  window.__swExportFirst5Pages = exportPages;
  window.__swDefaultFilename = defaultFilename;
  window.__swPageInfo = pageInfo;
  window.__swDetectPage = detectPageKind;

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === "bb-sw-fill-domains") {
      try {
        document.documentElement.dataset.bbFill = JSON.stringify(fillLandingParentDomains());
      } catch (error) {
        document.documentElement.dataset.bbFill = JSON.stringify({
          ok: false,
          error: error && error.message ? error.message : String(error),
        });
      }
      return;
    }
    if (event.data.type !== "bb-sw-export") return;
    exportAny({
      filename: event.data.filename,
      pages: event.data.pages,
      monthly: event.data.monthly,
      channels: event.data.channels,
      mode: event.data.mode,
      allDomains: event.data.allDomains,
      detailLimit: event.data.detailLimit,
      keywordPages: event.data.keywordPages,
    })
      .then((result) => {
        document.documentElement.dataset.bbExport = JSON.stringify(result);
      })
      .catch((error) => {
        document.documentElement.dataset.bbExport = JSON.stringify({
          ok: false,
          error: error && error.message ? error.message : String(error),
        });
      });
  });
})();
