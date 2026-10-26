import { z } from 'zod';

export const characterPlanningSchema = z.object({
  characterId: z.string().min(1).max(200),
  shortlisted: z.boolean(),
  note: z.string().max(10_000),
  shortlistedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  datasetVersionAtUpdate: z.string(),
}).strict();

export const setShortlistedRequestSchema = z.object({
  characterId: z.string().min(1).max(200),
  shortlisted: z.boolean(),
}).strict();

export const setCharacterNoteRequestSchema = z.object({
  characterId: z.string().min(1).max(200),
  note: z.string().max(10_000),
}).strict();

export type CharacterPlanning = z.infer<typeof characterPlanningSchema>;

export function planningById(records: CharacterPlanning[]): Map<string, CharacterPlanning> {
  return new Map(records.map(record => [record.characterId, record]));
}

export function filterToShortlisted<T extends { id: string }>(rows: T[], shortlistedIds: ReadonlySet<string>, enabled: boolean): T[] {
  return enabled ? rows.filter(row => shortlistedIds.has(row.id)) : rows;
}
