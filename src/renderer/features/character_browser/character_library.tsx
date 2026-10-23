import './character_library.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ROUTES, ROUTE_NAMES, type RouteContext } from '../../../shared/catalog';
import type { Character } from '../../../shared/source_models';
import type { ReferenceOverview } from '../../../shared/api';
import { defaultSetup, fieldLabel, initialDrafts, setupIssues, skillLabel, type LibrarySetup } from '../../../shared/library_setup';
import { queryLibrary } from '../../../shared/library_query';
import { ResultControls } from './result_controls';
import { CharacterTable } from './character_table';
import { CharacterDetails } from './character_details';

export function CharacterLibrary({ characters, overview }: { characters: Character[]; overview: ReferenceOverview }) {
  const [route, setRoute] = useState<RouteContext>('all');
  const [drafts, setDrafts] = useState(initialDrafts);
  const [baselines, setBaselines] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmLoad, setConfirmLoad] = useState(false);
  const tableScroll = useRef<HTMLDivElement>(null);
  const lastSelectedButton = useRef<HTMLButtonElement | null>(null);
  const routeControl = useRef<HTMLSelectElement>(null);
  const loadButton = useRef<HTMLButtonElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const setup = drafts[route];
  const dirty = JSON.stringify(setup) !== JSON.stringify(baselines[route]);
  const rows = useMemo(() => queryLibrary(characters, route, setup), [characters, route, setup]);
  const scopeCount = useMemo(() => queryLibrary(characters, route, defaultSetup()).length, [characters, route]);
  const selected = rows.find(c => c.id === selectedId);
  const issues = setupIssues(setup, route);
  const routeName = route === 'all' ? 'All Routes' : ROUTE_NAMES[route];
  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null);
      tableScroll.current?.focus({ preventScroll: true });
    }
  }, [selectedId, selected]);
  useEffect(() => { if (confirmLoad) confirmDialog.current?.showModal(); }, [confirmLoad]);
  function change(next: LibrarySetup) { if (busy) return; setDrafts(current => ({ ...current, [route]: next })); setMessage(''); }
  function resetFilters() { change({ ...setup, search: '', filters: [], mode: 'all' }); }
  function resetSorting() { change({ ...setup, sorts: [{ field: 'name', direction: 'asc' }] }); }
  function closeDetails() {
    setSelectedId(null);
    if (lastSelectedButton.current?.isConnected) lastSelectedButton.current.focus({ preventScroll: true });
    else routeControl.current?.focus({ preventScroll: true });
  }
  async function save() {
    const snapshot = structuredClone(setup);
    setBusy(true); setError('');
    try {
      const result = await window.loom.saveSetup(route, snapshot);
      setBaselines(previous => ({ ...previous, [route]: result.setup }));
      setMessage(`${routeName} setup saved.`);
    } catch { setError('Could not save this setup. Your previous save and current draft are unchanged. Please try again.'); }
    finally { setBusy(false); }
  }
  async function load() {
    setConfirmLoad(false); setBusy(true); setError('');
    try {
      const result = await window.loom.loadSetup(route);
      if (!result) { setMessage(`No saved setup for ${routeName} yet. Your draft is unchanged.`); return; }
      setDrafts(previous => ({ ...previous, [route]: result.setup }));
      setBaselines(previous => ({ ...previous, [route]: result.setup }));
      setMessage(`${routeName} setup loaded.${result.datasetVersion !== overview.datasetVersion ? ' Reference data has changed since this save; results have been recalculated.' : ''}`);
    } catch { setError('Could not load this setup. Its stored data has been preserved and your draft is unchanged. The save may require another app version.'); }
    finally { setBusy(false); loadButton.current?.focus(); }
  }
  function sortBy(field: string) {
    const primary = setup.sorts[0];
    const direction = primary?.field === field ? primary.direction === 'asc' ? 'desc' : 'asc' : field === 'name' || field.startsWith('availability:') ? 'asc' : 'desc';
    change({ ...setup, sorts: [{ field, direction }, ...setup.sorts.filter(rule => rule.field !== field)] });
  }
  return <div className="library">
    <div className="library_heading"><div><h2>Character Library</h2><p>Explore your Act 1 candidates, one route at a time.</p></div><span className="dataset_badge">Dataset {overview.datasetVersion}</span></div>
    <fieldset disabled={busy} className="library_controls">
      <legend className="visually_hidden">Browsing setup</legend>
      <div className="toolbar"><label>Route<select id="route_selector" ref={routeControl} value={route} onChange={e => { setRoute(e.target.value as RouteContext); setMessage(''); setError(''); }}><option value="all">All Routes</option>{ROUTES.map(r => <option key={r} value={r}>{ROUTE_NAMES[r]}</option>)}</select></label>
        <label className="search_label">Find a character<input type="search" placeholder="Search by name…" aria-label="Search characters" value={setup.search} onChange={e => change({ ...setup, search: e.target.value })} /></label>
        <div className="setup_actions"><span className={dirty ? 'unsaved' : 'muted'}>{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span><button className="primary" onClick={save}>Save setup</button><button ref={loadButton} onClick={() => dirty ? setConfirmLoad(true) : void load()}>Load setup</button></div>
      </div>
      <ResultControls setup={setup} route={route} onChange={change} />
    </fieldset>
    {busy && <p role="status">Updating setup…</p>}
    {message && <p role="status" className="feedback">{message}</p>}
    {error && <p role="alert" className="warning">{error}</p>}
    {issues.length > 0 && <div role="alert" className="warning"><strong>Saved rules need attention.</strong> These rules are retained but not applied: {issues.join('; ')}. Edit or remove them in Customize Results.</div>}
    <div className="active_rules" aria-label="Active rules">
      {setup.search && <span>Search: {setup.search}</span>}
      {setup.filters.length > 0 && <strong>{setup.mode === 'all' ? 'All' : 'Any'} rules:</strong>}
      {setup.filters.map((rule, i) => <span key={i}>{rule.kind === 'number' ? `${fieldLabel(rule.field)} ${rule.unknown === 'only' ? 'unknown only' : `${rule.min === null ? '' : `≥ ${rule.min}`} ${rule.max === null ? '' : `≤ ${rule.max}`} (${rule.unknown} unknowns)`}` : `${skillLabel(rule.skill)}: ${rule.match === 'ability' ? 'related ability (partial coverage)' : rule.match.replace('_', ' ')}`}</span>)}
      <span className="sort_summary">Sort: {setup.sorts.map((r, i) => `${i + 1}. ${fieldLabel(r.field)} ${r.direction === 'asc' ? '↑' : '↓'}`).join(' · ') || 'Name ↑ (tie-breaker)'}</span>
    </div>
    <div className="result_bar"><p role="status" id="result_count"><strong>{rows.length}</strong> of {scopeCount} candidates · {routeName}</p><div className="result_actions"><button className="quiet" disabled={busy} onClick={resetFilters}>Reset Filters</button><button className="quiet" disabled={busy} onClick={resetSorting}>Reset Sorting</button></div><span className="hint">Personal growths · — unknown</span></div>
    <div className={`library_workspace ${selected ? 'with_details' : ''}`}>
      <div className="results">
        <CharacterTable characters={rows} route={route} setup={setup} selectedId={selectedId} onSelect={(id, button) => { lastSelectedButton.current = button; setSelectedId(id); }} onSort={sortBy} scrollRef={tableScroll} />
        {rows.length === 0 && <div className="empty_state"><h3>No characters match these rules</h3><p>Try broader growth ranges or fewer skill interests.</p><button onClick={resetFilters}>Clear filters</button></div>}
      </div>
      {selected && <CharacterDetails character={selected} route={route} onClose={closeDetails} />}
    </div>
    <footer><p>Availability is reported recruitment, not a check of your current progress. “Not listed” is not confirmed unavailability.</p></footer>
    {confirmLoad && <dialog ref={confirmDialog} aria-labelledby="load_confirmation" onCancel={() => setConfirmLoad(false)} onClose={() => { setConfirmLoad(false); loadButton.current?.focus(); }}><h2 id="load_confirmation">Load saved {routeName} setup?</h2><p>This replaces your unsaved filters and sort priorities for this context.</p><div className="button_row"><button autoFocus onClick={() => { confirmDialog.current?.close(); setConfirmLoad(false); }}>Keep current draft</button><button className="primary" onClick={load}>Load saved setup</button></div></dialog>}
  </div>;
}
