import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const contentScriptPath = resolve(process.cwd(), "extensions/bb-similarweb-keywords/content.js");

type BacklinkRow = {
  pageAs: string;
  sourceTitle: string;
  sourceUrl: string;
  externalLinks: string;
  internalLinks: string;
  anchor: string;
  targetUrl: string;
  firstSeen: string;
  lastSeen: string;
  type: "Follow" | "Nofollow" | "Sponsored" | "UGC";
  status?: "活跃" | "新增" | "丢失";
  continuation?: boolean;
};

type DownloadMessage = {
  filename: string;
  base64: string;
  mime: string;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function backlinkRow(row: BacklinkRow): string {
  const typeBadge = row.type === "Follow" ? "" : `<button>${row.type}</button>`;
  const status = row.status === "丢失" ? "<button>丢失：链接已移除</button>" : row.status === "新增" ? "<button>新增</button>" : "";
  const targetCell = `<div>${escapeHtml(row.anchor)}</div><div><a href="https://${escapeHtml(row.targetUrl)}">${escapeHtml(row.targetUrl)}</a></div><div><button>文本</button></div>${status}${typeBadge}`;
  if (row.continuation) {
    return `<div role="row" data-test-merged-row>
      <div data-ui-name="Row.Cell">${targetCell}</div>
      <div data-ui-name="Row.Cell">${escapeHtml(row.firstSeen)}</div>
      <div data-ui-name="Row.Cell">${escapeHtml(row.lastSeen)}</div>
    </div>`;
  }
  return `<div role="row">
    <div data-ui-name="Row.Cell"><input type="checkbox"></div>
    <div data-ui-name="Row.Cell">${escapeHtml(row.pageAs)}</div>
    <div data-ui-name="Row.Cell"><div>${escapeHtml(row.sourceTitle)}</div><div><a href="https://${escapeHtml(row.sourceUrl)}">${escapeHtml(row.sourceUrl)}</a></div></div>
    <div data-ui-name="Row.Cell">${escapeHtml(row.externalLinks)}</div>
    <div data-ui-name="Row.Cell">${escapeHtml(row.internalLinks)}</div>
    <div data-ui-name="Row.Cell">${targetCell}</div>
    <div data-ui-name="Row.Cell">${escapeHtml(row.firstSeen)}</div>
    <div data-ui-name="Row.Cell">${escapeHtml(row.lastSeen)}</div>
  </div>`;
}

function backlinkTable(rows: BacklinkRow[], page: number, pages: number, emptyMessage = ""): string {
  const prevDisabled = page <= 1 ? " disabled" : "";
  const nextDisabled = page >= pages ? " disabled" : "";
  return `<section>
    ${emptyMessage ? `<p>${emptyMessage}</p>` : ""}
    <div role="row">
      <div role="columnheader"></div>
      <div role="columnheader">页面 AS</div>
      <div role="columnheader">源页面标题和 URL</div>
      <div role="columnheader">外部链接</div>
      <div role="columnheader">内部链接</div>
      <div role="columnheader">锚链接和目标 URL</div>
      <div role="columnheader">首次发现日期</div>
      <div role="columnheader">上次发现日期</div>
    </div>
    ${rows.map(backlinkRow).join("\n")}
    <button class="SPrevPage"${prevDisabled}>Prev</button>
    <button class="SNextPage"${nextDisabled}>Next</button>
  </section>`;
}

function backlinkCards(selected: "all" | "best"): string {
  const radio = (key: string, label: string, count: string) =>
    `<button role="radio" data-card="${key}" aria-checked="${selected === key}"><div>${label}</div><div>${count}</div></button>`;
  return `<div role="radiogroup" data-group="cards">
    ${radio("all", "所有", "4")}
    ${radio("best", "最佳", "1")}
    ${radio("latest", "最新", "1")}
    ${radio("lost", "丢失且重要", "1")}
  </div>
  <div role="radiogroup" data-group="status">
    <button role="radio" data-filter="status-all" aria-checked="true">所有</button>
    <button role="radio" data-filter="active">活跃</button>
    <button role="radio" data-filter="new">新增</button>
    <button role="radio" data-filter="lost">丢失</button>
  </div>
  <div role="radiogroup" data-group="type">
    <button role="radio" data-filter="type-all" aria-checked="true">所有</button>
    <button role="radio" data-filter="follow">Follow</button>
    <button role="radio" data-filter="nofollow">Nofollow</button>
    <button role="radio" data-filter="sponsored">Sponsored</button>
    <button role="radio" data-filter="ugc">UGC</button>
  </div>`;
}

function routeButtons(): string {
  return `<nav>
    <button href="/analytics/backlinks/overview/" data-route="overview">概览</button>
    <button href="/analytics/backlinks/backlinks/" data-route="backlinks">反向链接</button>
    <button href="/analytics/backlinks/outbound-domains/" data-route="outbound">出站域名</button>
  </nav>`;
}

function parseStoreZip(base64: string): Map<string, string> {
  const bytes = Buffer.from(base64, "base64");
  const files = new Map<string, string>();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");
    files.set(name, bytes.subarray(dataStart, dataStart + size).toString("utf8"));
    offset = dataStart + size;
  }
  return files;
}

async function runBacklinksExport(options: { emptyAll?: boolean } = {}) {
  const script = await readFile(contentScriptPath, "utf8");
  const window = new Window({
    url: "https://sem.3ue.co/analytics/backlinks/backlinks/?q=seedream-5.io&searchType=domain",
  });
  const document = window.document;
  const actions: string[] = [];
  let filterClicks = 0;
  let download: DownloadMessage | null = null;
  let route: "overview" | "backlinks" | "outbound" = "backlinks";
  let card: "all" | "best" = "best";
  let page = 1;

  const allPages: BacklinkRow[][] = options.emptyAll
    ? [[]]
    : [
        [
          {
            pageAs: "72",
            sourceTitle: "Source nofollow",
            sourceUrl: "source-one.example/page",
            externalLinks: "3",
            internalLinks: "8",
            anchor: "Seedream",
            targetUrl: "seedream-5.io/",
            firstSeen: "2026-01-01",
            lastSeen: "2026-08-01",
            type: "Nofollow",
            status: "丢失",
          },
          {
            pageAs: "61",
            sourceTitle: "Source follow",
            sourceUrl: "source-two.example/page",
            externalLinks: "4",
            internalLinks: "9",
            anchor: "Seedream follow",
            targetUrl: "seedream-5.io/follow",
            firstSeen: "2026-01-02",
            lastSeen: "2026-08-02",
            type: "Follow",
          },
        ],
        [
          {
            pageAs: "50",
            sourceTitle: "Source sponsored",
            sourceUrl: "source-three.example/page",
            externalLinks: "5",
            internalLinks: "10",
            anchor: "Seedream sponsored",
            targetUrl: "seedream-5.io/sponsored",
            firstSeen: "2026-01-03",
            lastSeen: "2026-08-03",
            type: "Sponsored",
          },
          {
            pageAs: "50",
            sourceTitle: "Source sponsored",
            sourceUrl: "source-three.example/page",
            externalLinks: "5",
            internalLinks: "10",
            anchor: "Seedream continuation",
            targetUrl: "seedream-5.io/continuation",
            firstSeen: "2026-01-03",
            lastSeen: "2026-08-04",
            type: "Nofollow",
            continuation: true,
          },
          {
            pageAs: "49",
            sourceTitle: "Source UGC",
            sourceUrl: "source-four.example/page",
            externalLinks: "6",
            internalLinks: "11",
            anchor: "Seedream UGC",
            targetUrl: "seedream-5.io/ugc",
            firstSeen: "2026-01-04",
            lastSeen: "2026-08-04",
            type: "UGC",
            status: "新增",
          },
        ],
      ];
  if (!options.emptyAll) {
    const duplicate = allPages[0]![0]!;
    allPages[1]!.push({ ...duplicate });
  }
  const bestRows: BacklinkRow[] = [
    {
      pageAs: "88",
      sourceTitle: "Best source",
      sourceUrl: "best.example/page",
      externalLinks: "2",
      internalLinks: "7",
      anchor: "Best anchor",
      targetUrl: "seedream-5.io/best",
      firstSeen: "2026-02-01",
      lastSeen: "2026-08-05",
      type: "Follow",
    },
  ];

  const setPath = (pathname: string, search = "?q=seedream-5.io&searchType=domain") => {
    window.history.pushState({}, "", `${pathname}${search}`);
  };

  const render = () => {
    let content = "";
    if (route === "overview") {
      content = `<main>
        <div>引荐域名\n10</div><div>反向链接\n20</div><div>每月访问量\n30</div><div>自然流量\n40</div><div>出站域名\n50</div>
        <button aria-pressed="true">1 年</button>
      </main>`;
    } else if (route === "backlinks") {
      const rows = card === "all" ? allPages[page - 1] || [] : bestRows;
      const pages = card === "all" ? allPages.length : 1;
      content = `<main>${backlinkCards(card)}${backlinkTable(
        rows,
        page,
        pages,
        "",
      )}</main>`;
    } else {
      content = `<main><div role="row">
        <div role="columnheader">AS</div><div role="columnheader">根域名</div><div role="columnheader">出站链接</div><div role="columnheader">首次发现</div><div role="columnheader">上次发现</div>
      </div>
      <div role="row"><div data-ui-name="Row.Cell">70</div><div data-ui-name="Row.Cell"><a>outbound.example</a></div><div data-ui-name="Row.Cell">12</div><div data-ui-name="Row.Cell">2026-01-01</div><div data-ui-name="Row.Cell">2026-08-01</div></div>
      <button class="SPrevPage" disabled>Prev</button><button class="SNextPage" disabled>Next</button></main>`;
    }
    document.body.innerHTML = `${routeButtons()}${content}`;

    for (const button of [...document.querySelectorAll("[data-route]")] as unknown as HTMLElement[]) {
      button.addEventListener("click", () => {
        route = button.dataset.route as typeof route;
        actions.push(route);
        page = 1;
        if (route === "overview") setPath("/analytics/backlinks/overview/");
        if (route === "backlinks") setPath("/analytics/backlinks/backlinks/");
        if (route === "outbound") setPath("/analytics/backlinks/outbound-domains/");
        render();
      });
    }
    for (const button of [...document.querySelectorAll("[data-card]")] as unknown as HTMLElement[]) {
      button.addEventListener("click", () => {
        const key = button.dataset.card;
        if (key !== "all" && key !== "best") return;
        card = key;
        page = 1;
        actions.push(card);
        setPath(
          "/analytics/backlinks/backlinks/",
          card === "best"
            ? "?q=seedream-5.io&searchType=domain&ba_mt=active&ba_rel=follow"
            : "?q=seedream-5.io&searchType=domain",
        );
        render();
      });
    }
    for (const button of document.querySelectorAll("[data-filter]")) {
      button.addEventListener("click", () => {
        filterClicks += 1;
      });
    }
    document.querySelector(".SPrevPage")?.addEventListener("click", () => {
      page = Math.max(1, page - 1);
      render();
    });
    document.querySelector(".SNextPage")?.addEventListener("click", () => {
      page = Math.min(allPages.length, page + 1);
      render();
    });
  };

  (window as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: null,
      sendMessage(message: DownloadMessage, callback: (response: { ok: boolean }) => void) {
        download = message;
        callback({ ok: true });
      },
    },
  };
  window.addEventListener("message", (event) => {
    const message = event as unknown as MessageEvent;
    if (message.data?.type !== "bb-sw-hc" || message.data?.cmd !== "backlinks-overview-charts") return;
    document.documentElement.dataset.bbBacklinksCharts = JSON.stringify({
      referring: [{ date: "2026-08", value: 10, diff: 1 }],
      backlinks: [{ date: "2026-08", value: 20, diff: 2 }],
    });
  });
  render();
  window.eval(script);

  const result = await (window as unknown as {
    __bbSwBacklinksExport: (options: { filename: string }) => Promise<Record<string, unknown>>;
  }).__bbSwBacklinksExport({ filename: "seedream-5-test.zip" });
  expect(download).not.toBeNull();

  return {
    actions,
    download: download as unknown as DownloadMessage,
    files: parseStoreZip((download as unknown as DownloadMessage).base64),
    filterClicks,
    result,
  };
}

describe("Semrush backlinks ZIP export", () => {
  it("exports every all-backlinks page with link type before the existing best table", async () => {
    const run = await runBacklinksExport();
    const names = [...run.files.keys()];
    const allName = names.find((name) => name.endsWith("-所有反向链接.csv"));
    const bestName = names.find((name) => name.endsWith("-最佳反向链接.csv"));

    expect(run.result).toMatchObject({ ok: true, all: 6, best: 1, outbound: 1 });
    expect(run.actions.indexOf("all")).toBeGreaterThan(-1);
    expect(run.actions.indexOf("best")).toBeGreaterThan(run.actions.indexOf("all"));
    expect(run.filterClicks).toBe(0);
    expect(allName).toBeTruthy();
    expect(bestName).toBeTruthy();
    expect(names.indexOf(allName!)).toBeLessThan(names.indexOf(bestName!));

    const allCsv = run.files.get(allName!)!.replace(/^\uFEFF/, "");
    const allLines = allCsv.split("\n");
    expect(allLines[0]).toBe(
      "序号,链接类型,页面 AS,源页面标题,源页面 URL,外部链接,内部链接,锚文本,目标 URL,首次发现,上次发现,状态",
    );
    expect(allLines).toHaveLength(7);
    expect(new Set(allLines.slice(1).map((line) => line.split(",")[1]))).toEqual(
      new Set(["Follow", "Nofollow", "Sponsored", "UGC"]),
    );
    expect(allCsv).toContain("source-four.example/page");
    expect(allCsv.match(/source-one\.example\/page/g)).toHaveLength(2);
    const continuation = allLines.find((line) => line.includes("seedream-5.io/continuation"))!.split(",");
    expect(continuation[3]).toBe("Source sponsored");
    expect(continuation[4]).toBe("source-three.example/page");

    const bestHeader = run.files.get(bestName!)!.replace(/^\uFEFF/, "").split("\n")[0];
    expect(bestHeader).toBe(
      "序号,页面 AS,源页面标题,源页面 URL,外部链接,内部链接,锚文本,目标 URL,首次发现,上次发现,状态",
    );
  }, 20_000);

  it("keeps a header-only all-backlinks CSV and continues to best when all has zero rows", async () => {
    const run = await runBacklinksExport({ emptyAll: true });
    const names = [...run.files.keys()];
    const allName = names.find((name) => name.endsWith("-所有反向链接.csv"));
    const bestName = names.find((name) => name.endsWith("-最佳反向链接.csv"));

    expect(run.result).toMatchObject({ ok: true, all: 0, best: 1, outbound: 1 });
    expect(run.actions.indexOf("best")).toBeGreaterThan(run.actions.indexOf("all"));
    expect(allName).toBeTruthy();
    expect(bestName).toBeTruthy();
    expect(run.files.get(allName!)!.replace(/^\uFEFF/, "").split("\n")).toEqual([
      "序号,链接类型,页面 AS,源页面标题,源页面 URL,外部链接,内部链接,锚文本,目标 URL,首次发现,上次发现,状态",
    ]);
    expect(run.files.get(bestName!)!).toContain("Best source");
  }, 30_000);
});
