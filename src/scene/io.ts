import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isUsefulNetworkUrl,
  normalizeUrl,
  parseMaybeJson,
  redactText,
  safeSegment,
  sceneId,
  stripDomForFixture,
} from "./redact.ts";
import { FIXTURES_ROOT, sceneDir } from "./paths.ts";
import { sceneSchema } from "./schema.ts";
import type {
  LoadedScene,
  NetworkFixture,
  RawCapture,
  RawNetworkCall,
  Scene,
  SceneAction,
} from "./types.ts";

export async function loadScene(dir: string): Promise<LoadedScene> {
  const raw = await readFile(path.join(dir, "scene.json"), "utf8");
  const scene = sceneSchema.parse(JSON.parse(raw)) as Scene;
  const html = await readFile(path.join(dir, scene.domPath), "utf8");
  const expected = JSON.parse(await readFile(path.join(dir, scene.expectedPath), "utf8"));

  const network: NetworkFixture[] = [];
  for (const item of scene.network) {
    if (!item.bodyPath) {
      network.push(item);
      continue;
    }
    const bodyRaw = await readFile(path.join(dir, item.bodyPath), "utf8");
    network.push({ ...item, body: parseMaybeJson(bodyRaw) });
  }

  return { ...scene, network, dir, html, expected };
}

export async function listScenes(): Promise<string[]> {
  const sources = await readDirSafe(FIXTURES_ROOT);
  const dirs: string[] = [];
  for (const source of sources) {
    const pageTypes = await readDirSafe(path.join(FIXTURES_ROOT, source));
    for (const pageType of pageTypes) {
      const subjects = await readDirSafe(path.join(FIXTURES_ROOT, source, pageType));
      for (const subject of subjects) {
        dirs.push(path.join(FIXTURES_ROOT, source, pageType, subject));
      }
    }
  }
  return dirs.sort();
}

export async function writeSceneFromCapture(raw: RawCapture): Promise<string> {
  const dir = sceneDir(raw.source, raw.pageType, raw.subject);
  await rm(path.join(dir, "network"), { recursive: true, force: true });
  await mkdir(path.join(dir, "network"), { recursive: true });

  const html = stripDomForFixture(raw.html);
  await writeFile(path.join(dir, "dom.html"), html, "utf8");

  const network = await writeNetworkFixtures(dir, raw.calls);
  const id = sceneId(raw.source, raw.pageType, raw.subject);
  const expectedPath = "expected.json";
  const expectedFile = path.join(dir, expectedPath);
  if (!(await exists(expectedFile))) {
    await writeFile(
      expectedFile,
      `${JSON.stringify({ status: "unimplemented", data: null }, null, 2)}\n`,
      "utf8",
    );
  }

  const scene: Scene = {
    id,
    source: raw.source,
    pageType: raw.pageType,
    subject: raw.subject,
    url: normalizeUrl(raw.url),
    title: redactText(raw.title),
    capturedAt: raw.capturedAt ?? new Date().toISOString(),
    ...(raw.locale ? { locale: raw.locale } : {}),
    actions: (raw.actions ?? [{ type: "goto", url: raw.url }]).map(normalizeAction),
    domPath: "dom.html",
    expectedPath,
    network: network.map(({ body: _body, ...meta }) => meta),
  };

  sceneSchema.parse(scene);
  await writeFile(path.join(dir, "scene.json"), `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  return dir;
}

async function writeNetworkFixtures(
  dir: string,
  calls: RawNetworkCall[],
): Promise<NetworkFixture[]> {
  const useful = calls.filter((call) => isUsefulNetworkUrl(call.url));
  const fixtures: NetworkFixture[] = [];
  const seen = new Set<string>();

  for (const call of useful) {
    if ((call.status ?? 0) >= 400) continue;
    const rawBody = call.body ?? call.text;
    if (typeof rawBody === "string" && /^\s*</.test(rawBody)) continue;
    const url = normalizeUrl(call.url);
    const method = (call.method ?? "GET").toUpperCase();
    const body = parseMaybeJson(rawBody);
    const fingerprint = `${method} ${url} ${stablePreview(call.request)} ${stablePreview(body)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const id = String(fixtures.length + 1).padStart(3, "0");
    const slug = networkSlug(url, method);
    const bodyPath = `network/${id}-${slug}.json`;
    await writeFile(path.join(dir, bodyPath), `${JSON.stringify(body, null, 2)}\n`, "utf8");

    fixtures.push({
      id,
      url,
      method,
      status: call.status ?? 0,
      contentType: call.contentType ?? "application/json",
      ...(call.request == null ? {} : { request: parseMaybeJson(call.request) }),
      bodyPath,
      body,
    });
  }

  return fixtures;
}

function networkSlug(url: string, method: string): string {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname
      .replace(/\.json$/i, "")
      .split("/")
      .filter(Boolean)
      .slice(-3)
      .join("-");
    return safeSegment(`${method}-${tail || parsed.hostname}`).slice(0, 60);
  } catch {
    return safeSegment(`${method}-request`).slice(0, 60);
  }
}

function normalizeAction(action: SceneAction): SceneAction {
  if (action.type === "goto") return { ...action, url: normalizeUrl(action.url) };
  return action;
}

function stablePreview(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value).slice(0, 200);
  } catch {
    return String(value).slice(0, 200);
  }
}

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}
