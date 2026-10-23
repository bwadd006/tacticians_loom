import { useEffect, useState } from 'react';
import type { ClassLibraryData, ReferenceApi, ReferenceOverview } from '../../shared/api';
import type { Character } from '../../shared/source_models';
import { CharacterLibrary } from '../features/character_browser/character_library';
import { ClassLibrary } from '../features/class_library/class_library';

declare global { interface Window { loom: ReferenceApi } }
export function App() {
  const [data, setData] = useState<{ characters: Character[]; classes: ClassLibraryData; overview: ReferenceOverview }>();
  const [view, setView] = useState<'characters' | 'classes'>('characters');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setError(false);
    Promise.all([window.loom.characters('all'), window.loom.classLibrary(), window.loom.overview()])
      .then(([characters, classes, overview]) => { if (current) setData({ characters, classes, overview }); })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [attempt]);
  return <main>
    <header className="app_header"><div><p className="eyebrow">Fortune’s Weave · Local planner</p><h1>Tactician’s Loom</h1></div><nav className="app_navigation" aria-label="Libraries"><button aria-current={view === 'characters' ? 'page' : undefined} onClick={() => setView('characters')}>Character Library</button><button aria-current={view === 'classes' ? 'page' : undefined} onClick={() => setView('classes')}>Class Library</button></nav><span className="chapter_marker">{view === 'characters' ? 'Act 1 Characters' : 'All Classes'}</span></header>
    {error ? <div role="alert"><p>Reference data could not be loaded.</p><button onClick={() => setAttempt(attempt + 1)}>Try again</button></div>
      : data ? <><section hidden={view !== 'characters'}><CharacterLibrary characters={data.characters} overview={data.overview} /></section><section hidden={view !== 'classes'}><ClassLibrary data={data.classes} overview={data.overview} /></section></> : <p role="status">Opening the libraries…</p>}
  </main>;
}
