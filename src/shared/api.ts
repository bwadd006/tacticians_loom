import type { Route, RouteContext } from './catalog';
import type { Character, CharacterClass } from './source_models';
import type { LibrarySetup, SavedSetup } from './library_setup';

export interface ReferenceConflict extends Record<string, unknown> { character_id: string | null; field: string; status: string }

export interface ReferenceOverview {
  datasetVersion: string;
  changeSummary: string;
  characterCount: number;
  actOneCount: number;
  classCount: number;
  conflictCount: number;
  routes: { id: Route; name: string; count: number }[];
}
export interface ReferenceApi {
  overview(): Promise<ReferenceOverview>;
  characters(route: RouteContext): Promise<Character[]>;
  character(id: string): Promise<Character | null>;
  characterClass(id: string): Promise<CharacterClass | null>;
  conflicts(): Promise<ReferenceConflict[]>;
  saveSetup(route: RouteContext, setup: LibrarySetup): Promise<SavedSetup>;
  loadSetup(route: RouteContext): Promise<SavedSetup | null>;
}
export const CHANNELS = {
  overview: 'reference:overview', characters: 'reference:characters',
  character: 'reference:character', characterClass: 'reference:class',
  conflicts: 'reference:conflicts', saveSetup: 'library:save_setup', loadSetup: 'library:load_setup',
} as const;
