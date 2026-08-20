import type { ExtractContext, Extractor, ExtractResult, SourceId } from "../scene/types.ts";

export function unimplementedExtractor(source: SourceId, pageType: string): Extractor {
  const id = `${source}.${pageType}`;
  return {
    id,
    source,
    pageType,
    extract(ctx: ExtractContext): ExtractResult {
      return {
        extractorId: id,
        unimplemented: true,
        data: null,
        warnings: [
          `Extractor ${id} is a contract stub. Scene ${ctx.scene.id} loaded ${ctx.network.length} network fixtures.`,
        ],
      };
    },
  };
}
