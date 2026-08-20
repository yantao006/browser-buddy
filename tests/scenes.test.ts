import { describe, expect, it } from "vitest";
import { findExtractor } from "../src/extractors/registry.ts";
import { documentText, replayScene, runExtractor } from "../src/harness/index.ts";
import { listScenes, loadScene } from "../src/scene/io.ts";
import { sceneSchema } from "../src/scene/schema.ts";

describe("captured scenes", () => {
  it("loads every scene and runs its extractor contract", async () => {
    const dirs = await listScenes();
    expect(dirs.length).toBeGreaterThan(0);

    for (const dir of dirs) {
      const scene = await loadScene(dir);
      expect(() => sceneSchema.parse(scene)).not.toThrow();
      expect(scene.html.length).toBeGreaterThan(500);
      expect(scene.html).not.toMatch(/<script[\s>]/i);
      expect(scene.url).not.toMatch(/__gmitm=/i);
      expect(scene.html).not.toMatch(/__gmitm=(?!REDACTED)[^&\s"']+/i);
      expect(scene.html).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\./);
      expect(scene.network.length).toBeGreaterThan(0);

      const extractor = findExtractor(scene.source, scene.pageType);
      const result = runExtractor(extractor, scene);
      expect(result.extractorId).toBe(extractor.id);
      if (result.unimplemented) {
        expect(result.data).toBeNull();
      } else {
        expect(result.data).not.toBeNull();
      }

      const text = documentText(replayScene(scene).document);
      expect(text.toLowerCase()).toContain(scene.subject.toLowerCase());
    }
  });
});
