const SECRET_QUERY_KEYS = new Set([
  "__gmitm",
  "gmitm",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
]);

const SECRET_COOKIE_NAMES = [
  "GMITM_token",
  "GMITM_ec",
  "aws-waf-token",
  "_dd_s",
];

const SECRET_HEADER_NAMES = new Set([
  "cookie",
  "authorization",
  "x-api-key",
  "x-csrf-token",
]);

export function sceneId(source: string, pageType: string, subject: string): string {
  return `${source}/${pageType}/${safeSegment(subject)}`;
}

export function safeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw, "https://invalid.local");
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase()) || /token|secret|sig/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = url.hash.replace(/__gmitm=[^&]*/g, "");
    return url.toString();
  } catch {
    return raw.replace(/(__gmitm|token|access_token)=[^&#\s]*/gi, "$1=REDACTED");
  }
}

export function redactText(input: string): string {
  let text = input;
  text = text.replace(/(__gmitm|gmitm)=[^&#"'\s]*/gi, "$1=REDACTED");
  text = text.replace(
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_|~.*-]{10,}/g,
    "[REDACTED_JWT]",
  );
  for (const name of SECRET_COOKIE_NAMES) {
    const pattern = new RegExp(`(${name})=([^;\\s"']+)`, "gi");
    text = text.replace(pattern, "$1=REDACTED");
  }
  text = text.replace(
    /(authorization|x-api-key)\s*[:=]\s*["']?[^"'\s]+/gi,
    "$1: REDACTED",
  );
  return text;
}

export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    next[key] = SECRET_HEADER_NAMES.has(key.toLowerCase()) ? "REDACTED" : redactText(value);
  }
  return next;
}

export function stripDomForFixture(html: string): string {
  let out = html;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  out = redactText(out);
  return out;
}

export function isUsefulNetworkUrl(url: string): boolean {
  if (!url) return false;
  if (/^(data:|blob:|chrome-extension:)/i.test(url)) return false;
  if (/\.(js|css|mjs|map|woff2?|ttf|eot|png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(url)) {
    return false;
  }
  if (
    /gtm|google-analytics|googletagmanager|doubleclick|facebook|linkedin|tiktok|quora|marketo|mouseflow|speedcurve|amplitude|intercom|cookiehub|appcues|matomo|cello|cloudflareinsights|ads\.|telemetry|gcdn-cgi|education\.json|sw-track|i18n\/cdn/i.test(
      url,
    )
  ) {
    return false;
  }
  if (
    /mf-manifest\.json|remote-integrations|csat-feedback|notes\/api|search-bar\/api|\/api\/userdata\/|\/api\/identities|\/api\/googletag|\/api\/startupSettings|\/api\/fit-score|\/api\/account\/|sales-api|notouch\/addons/i.test(
      url,
    )
  ) {
    return false;
  }
  return /\/api\/|\/widgetApi\/|\/dpa\/|\/graphql|\/rpc\b/i.test(url);
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"'))) {
    return redactText(trimmed).slice(0, 20_000);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return redactText(trimmed).slice(0, 20_000);
  }
}
