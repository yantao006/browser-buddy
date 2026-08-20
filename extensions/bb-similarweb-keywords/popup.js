const statusEl = document.getElementById("status");
const btn = document.getElementById("go");
const fillBtn = document.getElementById("fill");
const nameEl = document.getElementById("name");
const pagesEl = document.getElementById("pages");
const pagesRow = document.getElementById("pages-row");
const exportForm = document.getElementById("export-form");

const SUPPORTED_KINDS = new Set([
  "keywords",
  "generator",
  "performance",
  "landing",
  "overview",
  "refdomains",
  "backlinks",
  "organic",
]);
const LONG_KINDS = new Set(["landing", "overview", "refdomains", "backlinks", "organic", "generator"]);
const SUPPORTED_HINT = [
  "这一页还不支持导出。",
  "",
  "请打开下面任意一页再点插件：",
  "",
  "Similarweb（sim.3ue.co）",
  "· 自然搜索关键词表",
  "· 关键词生成器",
  "· 网站表现",
  "· 着陆页",
  "",
  "Semrush（sem.3ue.co）",
  "· 域名概览",
  "· 引荐域名",
  "· 反向链接分析",
  "· 自然排名",
].join("\n");

let currentKind = "unsupported";

function kindFromUrl(url) {
  const text = String(url || "");
  if (!/sim\.3ue\.co|sem\.3ue\.co/i.test(text)) return "unsupported";
  if (/analytics\/refdomains/i.test(text)) return "refdomains";
  if (/analytics\/backlinks/i.test(text)) return "backlinks";
  if (/analytics\/organic\//i.test(text)) return "organic";
  if (/analytics\/overview/i.test(text)) return "overview";
  if (/keyword-generator-tool/i.test(text)) return "generator";
  if (/landing-pages-v2/i.test(text)) return "landing";
  if (/website-performance/i.test(text)) return "performance";
  return "unsupported";
}

function hostFromUrl(url) {
  try {
    const parsed = new URL(url);
    const query = parsed.searchParams.get("q");
    if (query && /analytics\/(overview|refdomains|backlinks|organic)/i.test(url)) {
      return query.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.+$/, "");
    }
    if (/keyword-generator-tool/i.test(url)) {
      const hash = parsed.hash || "";
      const qIndex = hash.indexOf("?");
      const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : parsed.search);
      const kw = (params.get("keyword") || "").trim();
      if (kw) return kw.replace(/[\\/:*?"<>|]+/g, "-");
    }
    const raw = (parsed.hash.match(/key=([^&]+)/) || parsed.search.match(/key=([^&]+)/) || [])[1];
    if (raw) return decodeURIComponent(raw).replace(/[\\/:*?"<>|]+/g, "-").replace(/\.+$/, "");
  } catch {
    // keep empty
  }
  return "";
}

function selectedDomainFromUrl(url) {
  try {
    const parsed = new URL(url);
    const raw = (parsed.hash.match(/selectedDomain=([^&]+)/) || parsed.search.match(/selectedDomain=([^&]+)/) || [])[1];
    if (raw) return decodeURIComponent(raw).replace(/[\\/:*?"<>|]+/g, "-");
  } catch {
    // keep empty
  }
  const host = hostFromUrl(url);
  return (host.split(",")[0] || "").trim();
}

function fileDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function exportFileName(product, platform, content, ext) {
  const name =
    String(product || "export")
      .split(",")[0]
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\.+$/, "") || "export";
  return `${name}-${platform}-${content}-${fileDate()}.${ext}`;
}

function nameFromUrl(url) {
  const kind = kindFromUrl(url);
  if (kind === "landing") {
    return exportFileName(selectedDomainFromUrl(url) || "landing-pages", "similarweb", "landing-pages", "zip");
  }
  if (kind === "overview") {
    return exportFileName(hostFromUrl(url) || "domain", "semrush", "overview", "zip");
  }
  if (kind === "refdomains") {
    return exportFileName(hostFromUrl(url) || "domain", "semrush", "refdomains", "csv");
  }
  if (kind === "backlinks") {
    return exportFileName(hostFromUrl(url) || "domain", "semrush", "backlinks", "zip");
  }
  if (kind === "organic") {
    return exportFileName(hostFromUrl(url) || "domain", "semrush", "organic", "zip");
  }
  if (kind === "generator") {
    return exportFileName(hostFromUrl(url) || "keyword", "similarweb", "keyword-generator", "csv");
  }
  const host = hostFromUrl(url);
  if (kind === "performance") {
    return exportFileName(host || "website", "similarweb", "website-performance", "csv");
  }
  if (kind === "keywords") {
    return exportFileName(host || "keywords", "similarweb", "organic-keywords", "csv");
  }
  return "";
}

function normalizeFilename(name, fallback) {
  let text = String(name || "").trim();
  if (!text) text = fallback || "export.csv";
  text = text.replace(/[\\/:*?"<>|]+/g, "-");
  if (/\.(csv|zip|xls|xlsx)$/i.test(text)) {
    if (/\.xls$/i.test(text)) return text.replace(/\.xls$/i, ".zip");
    return text;
  }
  const ext = /\.zip$/i.test(fallback || "") ? ".zip" : ".csv";
  return text + ext;
}

function fillPages(total, selected) {
  const max = Math.max(1, Number(total) || 5);
  const pick = Math.min(Math.max(1, Number(selected) || 5), max);
  pagesEl.innerHTML = "";
  for (let i = 1; i <= max; i += 1) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = i === max ? `${i}（全部）` : String(i);
    if (i === pick) opt.selected = true;
    pagesEl.appendChild(opt);
  }
}

function applyKind(kind) {
  currentKind = SUPPORTED_KINDS.has(kind) ? kind : "unsupported";
  if (currentKind === "unsupported") {
    exportForm.classList.add("hidden");
    fillBtn.classList.add("hidden");
    btn.disabled = true;
    statusEl.textContent = SUPPORTED_HINT;
    return;
  }
  exportForm.classList.remove("hidden");
  btn.disabled = false;
  if (kind === "performance") {
    pagesRow.classList.add("hidden");
    fillBtn.classList.add("hidden");
    btn.textContent = "导出网站表现到 CSV";
    statusEl.textContent = "将抽取本页卡片数据。可改文件名。";
  } else if (kind === "overview") {
    pagesRow.classList.add("hidden");
    fillBtn.classList.add("hidden");
    btn.textContent = "导出域名概览到 ZIP";
    statusEl.textContent = "导出 SEO 卡片、AI 可见度、流量/关键词趋势和反向链接预览。";
  } else if (kind === "refdomains") {
    pagesRow.classList.add("hidden");
    fillBtn.classList.add("hidden");
    btn.textContent = "导出引荐域名到 CSV";
    statusEl.textContent = "筛选保持所有（含活跃/新增/丢失、Follow/Nofollow），多页会翻完。";
  } else if (kind === "backlinks") {
    pagesRow.classList.add("hidden");
    fillBtn.classList.add("hidden");
    btn.textContent = "导出反向链接到 ZIP";
    statusEl.textContent = "概览数字、一年曲线、最佳反向链接和出站域名。";
  } else if (kind === "organic") {
    pagesRow.classList.add("hidden");
    fillBtn.classList.add("hidden");
    btn.textContent = "导出自然排名到 ZIP";
    statusEl.textContent = "导出自然排名关键词和自然搜索竞争对手，多页会翻完。";
  } else if (kind === "generator") {
    pagesRow.classList.remove("hidden");
    fillBtn.classList.add("hidden");
    btn.textContent = "导出关键词生成器到 CSV";
    statusEl.textContent = "默认前 5 页，可改页数和文件名。";
  } else if (kind === "landing") {
    pagesRow.classList.add("hidden");
    fillBtn.classList.remove("hidden");
    btn.textContent = "导出着陆页到 ZIP";
    statusEl.textContent = "可先填入五个域名。导出：首页保底，末条 < 10k 或满 5 页停；>= 10k 抽日趋势和关键词。";
  } else {
    pagesRow.classList.remove("hidden");
    fillBtn.classList.add("hidden");
    btn.textContent = "导出关键词表格到 CSV";
    statusEl.textContent = "默认前 5 页，可改页数和文件名。";
  }
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function progressMessage(progress, filename) {
  const info = parseJson(progress) || {};
  const labels = {
    overview: "反向链接概览",
    best: "最佳反向链接",
    outbound: "出站域名",
    zip: "打包下载",
    positions: "自然排名关键词",
    competitors: "自然搜索竞争对手",
    filters: "筛选",
    table: "表格",
    scroll: "滚动页面",
    cards: "概览卡片",
    "traffic-trend": "流量趋势",
    "keywords-trend": "关键词趋势",
    switch: "切换域名",
    "next-page": "下一页",
  };
  const domain = info.domain ? `（${info.domain}）` : "";
  const page = info.page ? ` 第 ${info.page} 页` : "";
  const label = info.stage ? labels[info.stage] || "数据" : "";
  const line = label ? `正在导出${domain}：${label}${page}` : `正在导出${domain}`;
  return `${line}\n请不要关掉插件弹窗和这个页面。\n${filename || ""}`.trim();
}

function doneMessage(result) {
  if (!result || !result.ok) return (result && result.error) || "导出失败。";
  const name = result.filename || "";
  if (result.kind === "organic") {
    return `下载完成\n自然排名 ${result.positions || 0} 条，竞争对手 ${result.competitors || 0} 个\n${name}`;
  }
  if (result.kind === "backlinks") {
    return `下载完成\n最佳反向链接 ${result.best || 0} 条，出站域名 ${result.outbound || 0} 个\n${name}`;
  }
  if (result.kind === "refdomains") {
    return `下载完成\n${result.rows || 0} 条引荐域名\n${name}`;
  }
  if (result.kind === "overview") {
    return `下载完成\n域名概览\n${name}`;
  }
  if (result.kind === "performance") {
    return `下载完成\n${result.rows || 0} 行\n${name}`;
  }
  if (result.kind === "landing") {
    return `下载完成\n${result.rows || 0} 行（${result.landingRows || 0} 条着陆页）\n${name}`;
  }
  if (result.kind === "generator") {
    return `下载完成\n${result.rows || 0} 条关键词（${result.pages} 页）\n${name}`;
  }
  if (result.pages) {
    return `下载完成\n${result.rows || 0} 行（${result.pages} 页）\n${name}`;
  }
  return `下载完成\n${name}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExport(tabId, filename) {
  const started = Date.now();
  while (Date.now() - started < 8 * 60 * 1000) {
    await sleep(800);
    let frames = [];
    try {
      frames = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => ({
          exportData: document.documentElement.dataset.bbExport || "",
          progress: document.documentElement.dataset.bbProgress || "",
        }),
      });
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
    const hit = (frames || [])
      .map((item) => item.result)
      .find((result) => result && (result.exportData || result.progress));
    if (hit && hit.progress && !hit.exportData) {
      statusEl.textContent = progressMessage(hit.progress, filename);
    }
    if (hit && hit.exportData) {
      return parseJson(hit.exportData) || { ok: false, error: "导出结果读不出来。" };
    }
  }
  return { ok: false, error: "导出超时。可到下载文件夹看有没有文件，或刷新页面再试。" };
}

function readPerformanceCharts(host) {
  const Highcharts = window.Highcharts;
  if (!Highcharts || !Highcharts.charts) return null;
  const labelOf = (point) => {
    const cat = point.category;
    if (cat && typeof cat === "object") return cat.title || cat.key || "";
    if (typeof cat === "string" && cat && !/^\d+$/.test(cat)) return cat;
    const name = point.name;
    if (name && typeof name === "object") return name.title || name.key || "";
    if (typeof name === "string") return name;
    return "";
  };
  let monthly = null;
  const channels = [];
  for (const chart of Highcharts.charts.filter(Boolean)) {
    const cats = (chart.xAxis && chart.xAxis[0] && chart.xAxis[0].categories) || [];
    for (const series of chart.series || []) {
      const raw = series.points && series.points.length ? series.points : series.data || [];
      const pts = raw.map((point, index) => {
        const cat = cats[index];
        const catTitle = cat && typeof cat === "object" ? cat.title || cat.key : cat;
        return {
          title: labelOf(point) || catTitle || "",
          key: (point.category && point.category.key) || (point.name && point.name.key) || "",
          x: point.x,
          y: point.y,
        };
      });
      const timePts = pts.filter((point) => typeof point.y === "number" && point.x > 1e12);
      if (timePts.length >= 2) {
        const candidate = {
          site: series.name,
          points: timePts.map((point) => ({
            month: new Date(point.x).toISOString().slice(0, 7),
            value: Math.round(point.y),
          })),
        };
        if (series.name === host) monthly = candidate;
        else if (!monthly) monthly = candidate;
      }
      if (pts.some((point) => point.title === "直接" || point.key === "Direct") && pts.length >= 4) {
        channels.splice(0, channels.length, ...pts.map((point) => ({ name: point.title || point.key, y: point.y })));
      }
    }
  }
  return { monthly, channels };
}

fillPages(5, 5);
applyKind("unsupported");

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let kind = kindFromUrl(tab?.url || "");
  let suggested = nameFromUrl(tab?.url || "");
  applyKind(kind);
  try {
    if (tab?.id && /sim\.3ue\.co|sem\.3ue\.co/i.test(tab.url || "")) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.js"],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["page-main.js"],
        world: "MAIN",
      });
      const frames = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          const name = typeof window.__swDefaultFilename === "function" ? window.__swDefaultFilename() : "";
          const info = typeof window.__swPageInfo === "function" ? window.__swPageInfo() : null;
          const detected = typeof window.__swDetectPage === "function" ? window.__swDetectPage() : "";
          const hasTable = !!document.querySelector('[data-automation-field="keyword"], tbody tr.ant-table-row');
          const hasPerformance = !!document.querySelector('[data-automation="total-visits-widget"]');
          const hasLanding = /landing-pages-v2/i.test(location.hash) || document.title.includes("着陆页");
          const hasOverview = /analytics\/overview/i.test(location.href) || document.title.includes("域名概览");
          const hasRefdomains = /analytics\/refdomains/i.test(location.href);
          const hasBacklinks = /analytics\/backlinks/i.test(location.href);
          const hasOrganic = /analytics\/organic\//i.test(location.href) || document.title.includes("自然排名");
          const hasGenerator = /keyword-generator-tool/i.test(location.href) || /keyword-generator-tool/i.test(location.hash);
          return { name, info, detected, hasTable, hasPerformance, hasLanding, hasOverview, hasRefdomains, hasBacklinks, hasOrganic, hasGenerator };
        },
      });
      const results = (frames || []).map((item) => item.result).filter(Boolean);
      const hit =
        results.find((result) => result.hasRefdomains || result.detected === "refdomains") ||
        results.find((result) => result.hasBacklinks || result.detected === "backlinks") ||
        results.find((result) => result.hasOrganic || result.detected === "organic") ||
        results.find((result) => result.hasGenerator || result.detected === "generator") ||
        results.find((result) => result.hasOverview || result.detected === "overview") ||
        results.find((result) => result.hasLanding || result.detected === "landing") ||
        results.find((result) => result.hasPerformance || result.detected === "performance") ||
        results.find((result) => result.hasTable || result.detected === "keywords") ||
        results.find((result) => result.detected && result.detected !== "unknown");
      if (hit?.detected && SUPPORTED_KINDS.has(hit.detected)) kind = hit.detected;
      else if (hit?.hasRefdomains) kind = "refdomains";
      else if (hit?.hasBacklinks) kind = "backlinks";
      else if (hit?.hasOrganic) kind = "organic";
      else if (hit?.hasGenerator) kind = "generator";
      else if (hit?.hasOverview) kind = "overview";
      else if (hit?.hasLanding) kind = "landing";
      else if (hit?.hasPerformance) kind = "performance";
      else if (hit?.hasTable) kind = "keywords";
      else kind = "unsupported";
      applyKind(kind);
      if (kind !== "unsupported" && hit?.name) suggested = hit.name;
      if ((kind === "keywords" || kind === "generator") && hit?.info?.total) {
        fillPages(hit.info.total, hit.info.defaultPages || 5);
      }
    } else {
      applyKind("unsupported");
    }
  } catch {
    applyKind("unsupported");
  }
  if (currentKind === "unsupported") {
    nameEl.value = "";
    return;
  }
  nameEl.value = suggested;
  nameEl.focus();
  nameEl.select();
})();

btn.addEventListener("click", async () => {
  if (currentKind === "unsupported") {
    applyKind("unsupported");
    return;
  }
  btn.disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusEl.textContent = "没有活动标签页";
    btn.disabled = false;
    return;
  }
  const kind = currentKind;
  const filename = normalizeFilename(nameEl.value, nameFromUrl(tab.url || ""));
  const pageCount = Math.max(1, parseInt(pagesEl.value, 10) || 5);
  nameEl.value = filename;
  statusEl.textContent = `开始导出\n请不要关掉插件弹窗和这个页面。\n${filename}`;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["page-main.js"],
      world: "MAIN",
    });
    let charts = null;
    if (kind === "performance") {
      const hcFrames = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN",
        func: readPerformanceCharts,
        args: [hostFromUrl(tab.url || "")],
      });
      charts = (hcFrames || []).map((item) => item.result).find((result) => result && (result.monthly || (result.channels && result.channels.length)));
    }
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (name, pages, monthly, channels) => {
        if (typeof window.__bbSwExport !== "function") {
          if (typeof window.__bbSwKeywordExport === "function") {
            return window.__bbSwKeywordExport({ filename: name, pages });
          }
          return { ok: false, error: "no-fn" };
        }
        const kind = typeof window.__swDetectPage === "function" ? window.__swDetectPage() : "";
        if (kind === "landing" || kind === "overview" || kind === "refdomains" || kind === "backlinks" || kind === "organic" || kind === "generator") {
          document.documentElement.dataset.bbExport = "";
          window.__bbSwExport({ filename: name, pages, monthly, channels });
          return { ok: true, started: true, kind, filename: name };
        }
        return window.__bbSwExport({ filename: name, pages, monthly, channels });
      },
      args: [filename, pageCount, charts && charts.monthly, charts && charts.channels],
    });
    const results = [];
    for (const item of injected) {
      const out = await item.result;
      if (out && out.error !== "no-fn") results.push(out);
    }
    const ok = results.find((result) => result?.ok);
    const err = results.find((result) => result && !result.ok);
    if (ok && ok.started && LONG_KINDS.has(ok.kind)) {
      statusEl.textContent = progressMessage("", filename);
      const finished = await waitForExport(tab.id, filename);
      statusEl.textContent = doneMessage(finished);
    } else if (ok) {
      statusEl.textContent = doneMessage(ok);
    } else if (err) {
      statusEl.textContent = err.error || "失败";
    } else {
      statusEl.textContent = "这一页没有可导出的数据。\n\n" + SUPPORTED_HINT;
    }
  } catch (error) {
    statusEl.textContent = error.message || String(error);
  }
  btn.disabled = false;
});

fillBtn.addEventListener("click", async () => {
  fillBtn.disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusEl.textContent = "没有活动标签页";
    fillBtn.disabled = false;
    return;
  }
  statusEl.textContent = "正在换成五个域名…";
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content.js"],
    });
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () =>
        typeof window.__bbSwFillLandingDomains === "function"
          ? window.__bbSwFillLandingDomains()
          : { ok: false, error: "no-fn" },
    });
    const results = (injected || []).map((item) => item.result).filter((out) => out && out.error !== "no-fn");
    const ok = results.find((result) => result?.ok);
    const err = results.find((result) => result && !result.ok);
    if (ok?.unchanged) {
      statusEl.textContent = "已经是这五个域名，不用改。";
    } else if (ok) {
      statusEl.textContent = "已换成五个域名，着陆页正在刷新。\n不自动导出。";
    } else {
      statusEl.textContent = (err && err.error) || "填入失败。请停在着陆页再试。";
    }
  } catch (error) {
    statusEl.textContent = error.message || String(error);
  }
  fillBtn.disabled = false;
});
