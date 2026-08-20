import { unimplementedExtractor } from "./unimplemented.ts";
import type { Extractor } from "../scene/types.ts";

export const extractors: Extractor[] = [
  unimplementedExtractor("semrush", "domain-overview"),
  unimplementedExtractor("similarweb", "website-performance"),
];

export function findExtractor(source: string, pageType: string): Extractor {
  const found = extractors.find((item) => item.source === source && item.pageType === pageType);
  if (!found) {
    throw new Error(`No extractor registered for ${source}/${pageType}`);
  }
  return found;
}
