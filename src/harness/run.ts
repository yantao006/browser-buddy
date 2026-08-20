import type { Extractor, ExtractResult, LoadedScene } from "../scene/types.ts";
import { replayScene } from "./replay.ts";

export function runExtractor(extractor: Extractor, scene: LoadedScene): ExtractResult {
  if (extractor.source !== scene.source || extractor.pageType !== scene.pageType) {
    throw new Error(
      `Extractor ${extractor.id} does not match scene ${scene.id} (${scene.source}/${scene.pageType})`,
    );
  }
  return extractor.extract(replayScene(scene));
}
