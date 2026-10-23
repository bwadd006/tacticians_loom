import { useEffect, useState } from 'react';
import type { ReferenceApi, ReferenceOverview } from '../../shared/api';
import type { Character } from '../../shared/source_models';
import { CharacterLibrary } from '../features/character_browser/character_library';

declare global { interface Window { loom: ReferenceApi } }
export function App() {
  const [data, setData] = useState<{ characters: Character[]; overview: ReferenceOverview }>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setError(false);
    Promise.all([window.loom.characters('all'), window.loom.overview()])
      .then(([characters, overview]) => { if (current) setData({ characters, overview }); })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [attempt]);
  return <main>
    <header className="app_header"><div><p className="eyebrow">Fortune’s Weave · Act 1</p><h1>Tactician’s Loom</h1></div><span className="chapter_marker">Character Library</span></header>
    {error ? <div role="alert"><p>Reference data could not be loaded.</p><button onClick={() => setAttempt(attempt + 1)}>Try again</button></div>
      : data ? <CharacterLibrary {...data} /> : <p role="status">Opening the character library…</p>}
  </main>;
}
