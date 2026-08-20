export const SOURCE_IDS = ["semrush", "similarweb"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export type SceneAction =
  | { type: "goto"; url: string }
  | { type: "wait"; seconds: number; reason?: string }
  | { type: "click"; label: string; selector?: string }
  | { type: "note"; text: string };

export type SceneMeta = {
  id: string;
  source: SourceId;
  pageType: string;
  subject: string;
  url: string;
  title: string;
  capturedAt: string;
  locale?: string;
};

export type NetworkFixture = {
  id: string;
  url: string;
  method: string;
  status: number;
  contentType: string;
  request?: unknown;
  body?: unknown;
  bodyPath?: string;
};

export type Scene = SceneMeta & {
  actions: SceneAction[];
  domPath: string;
  expectedPath: string;
  network: NetworkFixture[];
};

export type LoadedScene = Scene & {
  dir: string;
  html: string;
  expected: unknown;
};

export type ExtractContext = {
  scene: SceneMeta;
  document: Document;
  network: NetworkFixture[];
};

export type ExtractResult<T = unknown> = {
  extractorId: string;
  unimplemented: boolean;
  data: T | null;
  warnings: string[];
};

export type Extractor<T = unknown> = {
  id: string;
  source: SourceId;
  pageType: string;
  extract: (ctx: ExtractContext) => ExtractResult<T>;
};

export type RawCapture = {
  source: SourceId;
  pageType: string;
  subject: string;
  url: string;
  title: string;
  locale?: string;
  capturedAt?: string;
  actions?: SceneAction[];
  html: string;
  calls: RawNetworkCall[];
};

export type RawNetworkCall = {
  url: string;
  method?: string;
  status?: number;
  contentType?: string;
  request?: unknown;
  body?: unknown;
  text?: string;
};
