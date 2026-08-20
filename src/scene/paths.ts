import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeSegment } from "./redact.ts";
import type { SourceId } from "./types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "../..");
export const FIXTURES_ROOT = path.join(REPO_ROOT, "fixtures/scenes");

export function sceneDir(source: SourceId, pageType: string, subject: string): string {
  return path.join(FIXTURES_ROOT, source, safeSegment(pageType), safeSegment(subject));
}

export function listSceneGlob(): string {
  return path.join(FIXTURES_ROOT, "*/*/*/scene.json");
}
