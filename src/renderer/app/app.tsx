import { useEffect, useRef, useState } from 'react';
import type { ClassLibraryData, ReferenceApi, ReferenceOverview } from '../../shared/api';
import type { Character } from '../../shared/source_models';
import { CharacterLibrary } from '../features/character_browser/character_library';
import { ClassLibrary } from '../features/class_library/class_library';
import type { CharacterPlanning } from '../../shared/character_planning';
import { ShortlistWorkspace } from '../features/shortlist/shortlist_workspace';
import type { PlanningController } from '../features/shortlist/types';

declare global { interface Window { loom: ReferenceApi } }
export function App() {
  const [data, setData] = useState<{ characters: Character[]; classes: ClassLibraryData; overview: ReferenceOverview }>();
  const [planning, setPlanning] = useState<CharacterPlanning[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [planningError, setPlanningError] = useState('');
  const [view, setView] = useState<'characters' | 'classes' | 'shortlist'>('characters');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const planningQueues = useRef(new Map<string, Promise<void>>());
  useEffect(() => {
    let current = true;
    setError(false);
    Promise.all([window.loom.characters('all'), window.loom.classLibrary(), window.loom.overview(), window.loom.listCharacterPlanning()])
      .then(([characters, classes, overview, playerPlanning]) => { if (current) { setData({ characters, classes, overview }); setPlanning(playerPlanning); } })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [attempt]);
  function replacePlanning(record: CharacterPlanning | null, characterId: string) {
    setPlanning(current => record ? [...current.filter(value => value.characterId !== characterId), record] : current.filter(value => value.characterId !== characterId));
  }
  function withPending(characterId: string, operation: () => Promise<CharacterPlanning | null>): Promise<void> {
    setPendingIds(current => new Set(current).add(characterId)); setPlanningError('');
    const previous = planningQueues.current.get(characterId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      try { replacePlanning(await operation(), characterId); }
      catch (error) { setPlanningError(error instanceof Error ? error.message : 'Player planning data could not be saved.'); throw error; }
    });
    planningQueues.current.set(characterId, current);
    return current.finally(() => {
      if (planningQueues.current.get(characterId) !== current) return;
      planningQueues.current.delete(characterId);
      setPendingIds(pending => { const next = new Set(pending); next.delete(characterId); return next; });
    });
  }
  const planningController: PlanningController = {
    records: planning, pendingIds, error: planningError,
    setShortlisted: (characterId, shortlisted) => withPending(characterId, () => window.loom.setCharacterShortlisted(characterId, shortlisted)),
    saveNote: (characterId, note) => withPending(characterId, () => window.loom.setCharacterNote(characterId, note)),
    clearNote: characterId => withPending(characterId, () => window.loom.clearCharacterNote(characterId)),
  };
  const shortlistCount = planning.filter(record => record.shortlisted).length;
  return <main>
    <header className="app_header"><div><p className="eyebrow">Fortune’s Weave · Local planner</p><h1>Tactician’s Loom</h1></div><nav className="app_navigation" aria-label="Planning views"><button aria-current={view === 'characters' ? 'page' : undefined} onClick={() => setView('characters')}>Character Library</button><button aria-current={view === 'classes' ? 'page' : undefined} onClick={() => setView('classes')}>Class Library</button><button aria-current={view === 'shortlist' ? 'page' : undefined} onClick={() => setView('shortlist')}>Shortlist &amp; Compare ({shortlistCount})</button></nav><span className="chapter_marker">{view === 'characters' ? 'Act 1 Characters' : view === 'classes' ? 'All Classes' : 'Player Shortlist'}</span></header>
    {error ? <div role="alert"><p>Reference data could not be loaded.</p><button onClick={() => setAttempt(attempt + 1)}>Try again</button></div>
      : data ? <><section hidden={view !== 'characters'}><CharacterLibrary characters={data.characters} overview={data.overview} planning={planningController} /></section><section hidden={view !== 'classes'}><ClassLibrary data={data.classes} overview={data.overview} /></section><section hidden={view !== 'shortlist'}><ShortlistWorkspace characters={data.characters} overview={data.overview} planning={planningController} onBrowseCharacters={() => setView('characters')} /></section></> : <p role="status">Opening the libraries…</p>}
  </main>;
}
