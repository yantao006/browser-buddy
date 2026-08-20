(() => {
  function popupChart() {
    const popup = document.querySelector(".Popup-content");
    if (!popup || !window.Highcharts) return null;
    const node = popup.querySelector("[data-highcharts-chart]");
    if (!node) return null;
    const idx = Number(node.getAttribute("data-highcharts-chart"));
    const chart = window.Highcharts.charts && window.Highcharts.charts[idx];
    if (!chart) return null;
    const series = (chart.series || [])[0];
    const points = ((series && series.points) || [])
      .filter((point) => typeof point.y === "number" && point.x > 1e12)
      .map((point) => ({
        date: new Date(point.x).toISOString().slice(0, 10),
        value: Math.round(point.y),
      }));
    return { count: points.length, points };
  }

  function publish(payload) {
    const data = payload || { count: 0, points: [] };
    document.documentElement.dataset.bbTrend = JSON.stringify(data);
    return data;
  }

  function overviewChart(widgetAt) {
    const root = document.querySelector(`[data-at="${widgetAt}"]`);
    if (!root) return [];
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      const propKey = Object.keys(node).find((key) => key.startsWith("__reactProps"));
      const data = propKey && node[propKey] && node[propKey].data;
      if (Array.isArray(data) && data.length > 10 && data[0] && typeof data[0] === "object" && "date" in data[0]) {
        return data.map((row) => {
          const out = {};
          Object.keys(row).forEach((key) => {
            if (key === "date") {
              const value = row[key];
              out.date =
                typeof value === "number" ? new Date(value).toISOString().slice(0, 10) : String(value || "");
            } else {
              out[key] = row[key];
            }
          });
          return out;
        });
      }
    }
    return [];
  }

  function mapChartRows(data) {
    return data.map((row) => {
      const out = {};
      Object.keys(row).forEach((key) => {
        if (key === "date") {
          const value = row[key];
          out.date = typeof value === "number" ? new Date(value).toISOString().slice(0, 10) : String(value || "");
        } else {
          out[key] = row[key];
        }
      });
      return out;
    });
  }

  function backlinksOverviewCharts() {
    const result = { referring: [], backlinks: [] };
    const modules = [...document.querySelectorAll('[class*="PlotA11yModule"]')];
    for (const node of modules) {
      const propKey = Object.keys(node).find((key) => key.startsWith("__reactProps"));
      const data = propKey && node[propKey] && node[propKey].data;
      if (!Array.isArray(data) || data.length < 6 || !data[0] || typeof data[0] !== "object") continue;
      if (!("date" in data[0]) || !("value" in data[0])) continue;
      if ("lostLink" in data[0] || "newLink" in data[0]) continue;
      const parent = node.closest("section") || node.parentElement;
      const blob = ((parent && parent.innerText) || "").replace(/\s+/g, " ");
      if (/Authority Score/.test(blob)) continue;
      const mapped = mapChartRows(data);
      if (/引荐域名/.test(blob) && /1 年|全部时间/.test(blob) && !result.referring.length) {
        result.referring = mapped;
      } else if (/反向链接/.test(blob) && /1 年|全部时间/.test(blob) && !result.backlinks.length) {
        result.backlinks = mapped;
      }
    }
    return result;
  }

  function weeklySparklines() {
    const Highcharts = window.Highcharts;
    if (!Highcharts || !Highcharts.charts) return [];
    const cols = [...document.querySelectorAll(".swReactTable-column, [class*='swReactTable-column']")].filter(
      (col) => !col.closest(".Popup-content") && col.querySelectorAll(".swReactTableCell").length,
    );
    const trendCol = cols[3];
    if (!trendCol) return [];
    return [...trendCol.querySelectorAll(".swReactTableCell")].map((cell, index) => {
      const node = cell.querySelector("[data-highcharts-chart]");
      const idx = node ? Number(node.getAttribute("data-highcharts-chart")) : NaN;
      const chart = Number.isFinite(idx) ? Highcharts.charts[idx] : null;
      const series = chart && chart.series && chart.series[0];
      const points = ((series && series.points) || [])
        .filter((point) => typeof point.y === "number" && point.x > 1e12)
        .map((point) => ({
          date: new Date(point.x).toISOString().slice(0, 10),
          value: Math.round(point.y),
        }));
      return { index: index + 1, chart: idx, count: points.length, points };
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "bb-sw-hc") return;
    let payload = null;
    if (event.data.cmd === "popup-daily") payload = publish(popupChart());
    if (event.data.cmd === "weekly-sparklines") {
      payload = weeklySparklines();
      document.documentElement.dataset.bbWeekly = JSON.stringify(payload || []);
    }
    if (event.data.cmd === "overview-chart") {
      payload = overviewChart(event.data.widget);
      document.documentElement.dataset.bbOverviewChart = JSON.stringify(payload || []);
    }
    if (event.data.cmd === "backlinks-overview-charts") {
      payload = backlinksOverviewCharts();
      document.documentElement.dataset.bbBacklinksCharts = JSON.stringify(payload || { referring: [], backlinks: [] });
    }
    window.postMessage({ type: "bb-sw-hc-result", id: event.data.id, payload }, "*");
  });
})();
