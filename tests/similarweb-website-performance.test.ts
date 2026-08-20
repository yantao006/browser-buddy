import { describe, expect, it } from "vitest";
import { documentText, replayScene } from "../src/harness/index.ts";
import { loadScene } from "../src/scene/io.ts";
import { sceneDir } from "../src/scene/paths.ts";

describe("similarweb website-performance fixture", () => {
  it("keeps the rendered traffic cards and widget api traffic", async () => {
    const scene = await loadScene(sceneDir("similarweb", "website-performance", "wavespeed.ai"));
    const text = documentText(replayScene(scene).document);

    expect(text).toContain("wavespeed.ai");
    expect(text).toMatch(/总访问量|6\.118/);
    expect(scene.network.some((item) => /widgetApi\/WebsiteOverview\/EngagementVisits/i.test(item.url))).toBe(
      true,
    );
  });
});
