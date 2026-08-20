import { describe, expect, it } from "vitest";
import { documentText, replayScene } from "../src/harness/index.ts";
import { loadScene } from "../src/scene/io.ts";
import { sceneDir } from "../src/scene/paths.ts";

describe("semrush domain-overview fixture", () => {
  it("keeps the rendered overview metrics and dpa traffic", async () => {
    const scene = await loadScene(sceneDir("semrush", "domain-overview", "seedream-4.ai"));
    const text = documentText(replayScene(scene).document);

    expect(text).toContain("seedream-4.ai");
    expect(text).toMatch(/自然流量|Authority Score/);
    expect(scene.network.some((item) => /dpa\/rpc/i.test(item.url))).toBe(true);
    expect(JSON.stringify(scene.network)).toContain("authorityScore");
  });
});
