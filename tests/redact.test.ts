import { describe, expect, it } from "vitest";
import {
  isUsefulNetworkUrl,
  normalizeUrl,
  redactText,
  stripDomForFixture,
} from "../src/scene/redact.ts";

describe("redact", () => {
  it("strips gmitm tokens from urls", () => {
    const url = normalizeUrl(
      "https://sem.3ue.co/analytics/overview/?searchType=domain&q=seedream-4.ai&__gmitm=secret-token",
    );
    expect(url).toContain("q=seedream-4.ai");
    expect(url).not.toContain("secret-token");
    expect(url).not.toContain("__gmitm");
  });

  it("redacts jwt-looking strings", () => {
    const text = redactText(
      "cookie=eyJhbGciOiJSUzI1NiJ9.eyJ1bmFtZSI6Inlhb3RhbyJ9.signature_part_here_is_long_enough",
    );
    expect(text).toContain("[REDACTED_JWT]");
  });

  it("keeps api calls and drops analytics assets", () => {
    expect(isUsefulNetworkUrl("https://zh.semrush.com/dpa/rpc")).toBe(true);
    expect(
      isUsefulNetworkUrl(
        "https://pro.similarweb.com/widgetApi/WebsiteOverview/EngagementVisits/SingleMetric?keys=a.com",
      ),
    ).toBe(true);
    expect(isUsefulNetworkUrl("https://www.googletagmanager.com/gtm.js?id=1")).toBe(false);
    expect(isUsefulNetworkUrl("https://static.semrush.com/app.js")).toBe(false);
  });

  it("strips scripts from frozen html", () => {
    const html = stripDomForFixture(
      `<html><body><h1>ok</h1><script>window.steal="eyJhbGciOiJSUzI1NiJ9.aaaa.bbbbbbbbbb"</script></body></html>`,
    );
    expect(html).toContain("ok");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("steal");
  });
});
