import { Window } from "happy-dom";
import type { ExtractContext, LoadedScene } from "../scene/types.ts";

export function replayScene(scene: LoadedScene): ExtractContext {
  const window = new Window({ url: scene.url });
  window.document.write(scene.html);
  window.document.close();

  return {
    scene: {
      id: scene.id,
      source: scene.source,
      pageType: scene.pageType,
      subject: scene.subject,
      url: scene.url,
      title: scene.title,
      capturedAt: scene.capturedAt,
      ...(scene.locale ? { locale: scene.locale } : {}),
    },
    document: window.document as unknown as Document,
    network: scene.network,
  };
}

export function documentText(document: Document): string {
  return (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}
