(() => {
  if (window.__bbHookInstalled) return;
  window.__bbHookInstalled = true;
  window.__bbCalls = [];

  const push = (entry) => {
    try {
      window.__bbCalls.push(entry);
    } catch {
      // ignore
    }
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input && input.url;
    const method = (init && init.method) || (input && input.method) || "GET";
    let request = null;
    if (init && typeof init.body === "string") request = init.body.slice(0, 20000);
    else if (input && typeof input === "object" && typeof input.clone === "function") {
      try {
        request = (await input.clone().text()).slice(0, 20000);
      } catch {
        request = null;
      }
    }
    const res = await origFetch.apply(this, arguments);
    try {
      const ct = res.headers.get("content-type") || "";
      const interesting =
        /json|text|javascript|xml/i.test(ct) || /dpa\/rpc|\/api\/|widgetApi|graphql/i.test(String(url));
      const text = interesting ? await res.clone().text() : "";
      push({
        url: String(url || ""),
        method,
        status: res.status,
        contentType: ct,
        request,
        text: text.slice(0, 500000),
      });
    } catch (error) {
      push({ url: String(url || ""), method, error: String(error) });
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__bb = { method, url };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener("loadend", function () {
      let text = "";
      try {
        text = String(this.responseText || "").slice(0, 500000);
      } catch {
        text = "";
      }
      push({
        url: String((this.__bb && this.__bb.url) || ""),
        method: (this.__bb && this.__bb.method) || "GET",
        status: this.status,
        contentType: this.getResponseHeader("content-type") || "",
        request: typeof body === "string" ? body.slice(0, 20000) : null,
        text,
      });
    });
    return origSend.apply(this, arguments);
  };
})();
