import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeSceneFromCapture } from "../../src/scene/io.ts";
import type { RawCapture } from "../../src/scene/types.ts";

const input = process.argv[2];
if (!input) {
  console.error("Usage: pnpm ingest <raw-capture.json>");
  process.exit(1);
}

const raw = JSON.parse(await readFile(path.resolve(input), "utf8")) as RawCapture;
if (!raw.source || !raw.pageType || !raw.subject || !raw.html) {
  console.error("raw capture is missing source, pageType, subject, or html");
  process.exit(1);
}

const dir = await writeSceneFromCapture(raw);
console.log(`wrote scene ${raw.source}/${raw.pageType}/${raw.subject}`);
console.log(dir);
console.log(`network fixtures: ${(raw.calls ?? []).length} raw -> see scene.json`);
