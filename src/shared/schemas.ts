/**
 * Zod schemas for everything stored in Redis or crossing the wire.
 * Parsing stored JSON through these guards the state layer against
 * corrupted or malformed data — no casts needed anywhere.
 */

import { z } from "zod";

import { MAX_HP } from "./types";

export const posSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) });

export const tileKindSchema = z.enum([
  "wall",
  "floor",
  "moss",
  "salt",
  "dew",
  "entrance",
  "burrow",
]);

export const floorGenSchema = z.object({
  id: z.number().int().positive(),
  seed: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tiles: z.array(z.array(tileKindSchema)),
  entrance: posSchema,
  burrow: posSchema,
  flavor: z.string().min(1),
  twist: z.enum(["calm", "saltstorm", "dewrich", "restless"]),
});

export const floorStatusSchema = z.enum(["open", "cleared", "failed"]);

export const floorStateSchema = z.object({
  v: z.number().int().nonnegative(),
  hero: posSchema,
  hp: z.number().int().min(0).max(MAX_HP),
  moves: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  status: floorStatusSchema,
  clearedAt: z.number().nullable(),
  collected: z.array(posSchema),
  saltBy: z.record(z.string(), z.number().int().nonnegative()),
  medicBy: z.string().nullable(),
  bestStep: z.object({ u: z.string(), gain: z.number() }).nullable(),
  finisherBy: z.string().nullable(),
});

export const actionSchema = z.enum(["up", "down", "left", "right", "shell"]);

export const moveLogEntrySchema = z.object({
  u: z.string().min(1).max(60),
  action: actionSchema,
  t: z.number(),
});

export const floorSummarySchema = z.object({
  id: z.number().int().positive(),
  status: floorStatusSchema,
  moves: z.number().int().nonnegative(),
  movers: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  flavor: z.string().min(1),
});

export const streakSchema = z.object({
  n: z.number().int().nonnegative(),
  last: z.number().int().nonnegative(),
  /** floor id where the one-per-7-floors streak freeze was last used (0 = never) */
  graceAt: z.number().int().nonnegative().default(0),
});

export const practiceRecordSchema = z.object({
  attempt: z.number().int().nonnegative(),
  state: floorStateSchema,
});
