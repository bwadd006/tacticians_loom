import type { Route, RouteContext } from './catalog';
import type { Character, CharacterClass, Paralogue } from './source_models';
import type { CertificationRules, ClassUnlock } from './source_models';
import type { LibrarySetup, SavedSetup } from './library_setup';
import type { ClassLibrarySetup, SavedClassSetup } from './class_library_setup';
import type { CharacterPlanning } from './character_planning';
import type { ParalogueLibrarySetup, SavedParalogueSetup } from './paralogue_library_setup';

export interface ReferenceConflict extends Record<string, unknown> { character_id: string | null; field: string; status: string }

export interface ReferenceOverview {
  datasetVersion: string;
  changeSummary: string;
  characterCount: number;
  actOneCount: number;
  classCount: number;
  paralogueCount: number;
  conflictCount: number;
  routes: { id: Route; name: string; count: number }[];
}
export interface ClassLibraryData {
  classes: CharacterClass[];
  certificationRules: CertificationRules;
  unlocks: ClassUnlock[];
  restrictions: { verified: boolean; note: string };
  conflicts: { classId: string | null; field: string; status: string }[];
}
export interface ParalogueLibraryData {
  paralogues: Paralogue[];
  conflicts: { paralogueId: string; routeId: Route | null; field: string; status: string; details: string }[];
}
export interface ReferenceApi {
  overview(): Promise<ReferenceOverview>;
  characters(route: RouteContext): Promise<Character[]>;
  character(id: string): Promise<Character | null>;
  characterClass(id: string): Promise<CharacterClass | null>;
  classLibrary(): Promise<ClassLibraryData>;
  paralogueLibrary(): Promise<ParalogueLibraryData>;
  conflicts(): Promise<ReferenceConflict[]>;
  saveSetup(route: RouteContext, setup: LibrarySetup): Promise<SavedSetup>;
  loadSetup(route: RouteContext): Promise<SavedSetup | null>;
  saveClassSetup(setup: ClassLibrarySetup): Promise<SavedClassSetup>;
  loadClassSetup(): Promise<SavedClassSetup | null>;
  saveParalogueSetup(setup: ParalogueLibrarySetup): Promise<SavedParalogueSetup>;
  loadParalogueSetup(): Promise<SavedParalogueSetup | null>;
  listCharacterPlanning(): Promise<CharacterPlanning[]>;
  setCharacterShortlisted(characterId: string, shortlisted: boolean): Promise<CharacterPlanning>;
  setCharacterNote(characterId: string, note: string): Promise<CharacterPlanning>;
  clearCharacterNote(characterId: string): Promise<CharacterPlanning | null>;
}
export const CHANNELS = {
  overview: 'reference:overview', characters: 'reference:characters',
  character: 'reference:character', characterClass: 'reference:class',
  classLibrary: 'reference:class_library',
  paralogueLibrary: 'reference:paralogue_library',
  conflicts: 'reference:conflicts', saveSetup: 'library:save_setup', loadSetup: 'library:load_setup',
  saveClassSetup: 'class_library:save_setup', loadClassSetup: 'class_library:load_setup',
  saveParalogueSetup: 'paralogue_library:save_setup', loadParalogueSetup: 'paralogue_library:load_setup',
  listCharacterPlanning: 'planning:list_characters', setCharacterShortlisted: 'planning:set_shortlisted',
  setCharacterNote: 'planning:set_note', clearCharacterNote: 'planning:clear_note',
} as const;
