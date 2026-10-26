import type { CharacterPlanning } from '../../../shared/character_planning';

export interface PlanningController {
  records: CharacterPlanning[];
  pendingIds: Set<string>;
  error: string;
  setShortlisted(characterId: string, shortlisted: boolean): Promise<void>;
  saveNote(characterId: string, note: string): Promise<void>;
  clearNote(characterId: string): Promise<void>;
}
