import { z } from "zod";
import { SOURCE_IDS } from "./types.ts";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("goto"), url: z.string() }),
  z.object({
    type: z.literal("wait"),
    seconds: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("click"),
    label: z.string(),
    selector: z.string().optional(),
  }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);

export const sceneMetaSchema = z.object({
  id: z.string().min(1),
  source: z.enum(SOURCE_IDS),
  pageType: z.string().min(1),
  subject: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  capturedAt: z.string().min(1),
  locale: z.string().optional(),
});

export const networkFixtureSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  method: z.string().min(1),
  status: z.number().int(),
  contentType: z.string(),
  request: z.unknown().optional(),
  body: z.unknown().optional(),
  bodyPath: z.string().optional(),
});

export const sceneSchema = sceneMetaSchema.extend({
  actions: z.array(actionSchema),
  domPath: z.string().min(1),
  expectedPath: z.string().min(1),
  network: z.array(networkFixtureSchema),
});
