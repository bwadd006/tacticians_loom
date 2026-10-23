import './class_library.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TIERS, type Tier } from '../../../shared/catalog';
import type { ClassLibraryData, ReferenceOverview } from '../../../shared/api';
import { classFieldLabel, classFilterLabel, classSetupIssues, defaultClassSetup, type ClassLibrarySetup } from '../../../shared/class_library_setup';
import { queryClassLibrary } from '../../../shared/class_library_query';
import { skillLabel } from '../../../shared/library_setup';
import { ClassResultControls } from './class_result_controls';
import { ClassTable } from './class_table';
import { ClassDetails } from './class_details';

function expandedTiers(value: boolean): Record<Tier, boolean> { return Object.fromEntries(TIERS.map(tier => [tier, value])) as Record<Tier, boolean>; }

export function ClassLibrary({ data, overview }: { data: ClassLibraryData; overview: ReferenceOverview }) {
  const initial = useMemo(defaultClassSetup, []);
  const [setup, setSetup] = useState<ClassLibrarySetup>(initial);
  const [baseline, setBaseline] = useState<ClassLibrarySetup>(initial);
  const [expanded, setExpanded] = useState(() => expandedTiers(true));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [confirmLoad, setConfirmLoad] = useState(false);
  const lastSelectedButton = useRef<HTMLButtonElement | null>(null), loadButton = useRef<HTMLButtonElement>(null), confirmDialog = useRef<HTMLDialogElement>(null), results = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => queryClassLibrary(data.classes, data.unlocks, setup), [data, setup]);
  const selected = rows.find(characterClass => characterClass.id === selectedId);
  const issues = classSetupIssues(setup), dirty = JSON.stringify(setup) !== JSON.stringify(baseline);
  useEffect(() => { if (selectedId && !selected) { setSelectedId(null); results.current?.focus({ preventScroll: true }); } }, [selectedId, selected]);
  useEffect(() => { if (confirmLoad) confirmDialog.current?.showModal(); }, [confirmLoad]);
  function change(next: ClassLibrarySetup) { if (!busy) { setSetup(next); setMessage(''); } }
  function resetFilters() { change({ ...setup, search: '', tiers: [...TIERS], mode: 'all', filters: [] }); }
  function resetSorting() { change({ ...setup, sorts: [{ field: 'name', direction: 'asc' }] }); }
  function sortBy(field: string) { const primary = setup.sorts[0]; const direction = primary?.field === field ? primary.direction === 'asc' ? 'desc' : 'asc' : field === 'name' ? 'asc' : 'desc'; change({ ...setup, sorts: [{ field, direction }, ...setup.sorts.filter(rule => rule.field !== field)] }); }
  function closeDetails() { setSelectedId(null); if (lastSelectedButton.current?.isConnected) lastSelectedButton.current.focus({ preventScroll: true }); else results.current?.focus({ preventScroll: true }); }
  async function save() {
    const snapshot = structuredClone(setup); setBusy(true); setError('');
    try { const saved = await window.loom.saveClassSetup(snapshot); setBaseline(saved.setup); setMessage('Class Library setup saved.'); }
    catch { setError('Could not save this setup. Your previous save and current draft are unchanged. Please try again.'); }
    finally { setBusy(false); }
  }
  async function load() {
    setConfirmLoad(false); setBusy(true); setError('');
    try { const saved = await window.loom.loadClassSetup(); if (!saved) { setMessage('No saved Class Library setup yet. Your draft is unchanged.'); return; } setSetup(saved.setup); setBaseline(saved.setup); setMessage(`Class Library setup loaded.${saved.datasetVersion !== overview.datasetVersion ? ' Reference data has changed since this save; results have been recalculated.' : ''}`); }
    catch { setError('Could not load this setup. Its stored data has been preserved and your draft is unchanged. The save may require another app version.'); }
    finally { setBusy(false); loadButton.current?.focus(); }
  }
  return <div className="library class_library">
    <div className="library_heading"><div><h2>Class Library</h2><p>Compare every class by tier, growth, training, certification, mastery, and known unlock method.</p></div><span className="dataset_badge">Dataset {overview.datasetVersion}</span></div>
    <fieldset disabled={busy} className="library_controls"><legend className="visually_hidden">Class browsing setup</legend><div className="toolbar"><label className="search_label">Find a class<input type="search" placeholder="Search by name…" aria-label="Search classes" value={setup.search} onChange={event => change({ ...setup, search: event.target.value })} /></label><div className="setup_actions"><span className={dirty ? 'unsaved' : 'muted'}>{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span><button className="primary" onClick={save}>Save setup</button><button ref={loadButton} onClick={() => dirty ? setConfirmLoad(true) : void load()}>Load setup</button></div></div><ClassResultControls setup={setup} onChange={change} /></fieldset>
    {busy && <p role="status">Updating setup…</p>}{message && <p role="status" className="feedback">{message}</p>}{error && <p role="alert" className="warning">{error}</p>}{issues.length > 0 && <div role="alert" className="warning"><strong>Saved rules need attention.</strong> These rules are retained but not applied: {issues.join('; ')}. Edit or remove them in Customize Results.</div>}
    <div className="active_rules" aria-label="Active class rules">{setup.search && <span>Search: {setup.search}</span>}<span>Tiers: {setup.tiers.map(skillLabel).join(', ')}</span>{setup.filters.length > 0 && <strong>{setup.mode === 'all' ? 'All' : 'Any'} rules:</strong>}{setup.filters.map((rule, index) => <span key={index}>{classFilterLabel(rule)}</span>)}<span className="sort_summary">Sort within tiers: {setup.sorts.map((rule, index) => `${index + 1}. ${classFieldLabel(rule.field)} ${rule.direction === 'asc' ? '↑' : '↓'}`).join(' · ') || 'Name ↑ (tie-breaker)'}</span></div>
    <div className="result_bar"><p role="status" id="class_result_count"><strong>{rows.length}</strong> of {data.classes.length} classes</p><div className="result_actions"><button className="quiet" onClick={resetFilters}>Reset Filters</button><button className="quiet" onClick={resetSorting}>Reset Sorting</button><button className="quiet" onClick={() => setExpanded(expandedTiers(true))}>Expand All</button><button className="quiet" onClick={() => setExpanded(expandedTiers(false))}>Collapse All</button></div><span className="hint">Class growth modifiers · — unknown</span></div>
    <div className={`library_workspace class_workspace ${selected ? 'with_details' : ''}`}><div className="class_results" ref={results} tabIndex={-1}><ClassTable classes={rows} allClasses={data.classes} certificationRules={data.certificationRules} unlocks={data.unlocks} setup={setup} expanded={expanded} selectedId={selectedId} onSelect={(id, button) => { lastSelectedButton.current = button; setSelectedId(id); }} onSort={sortBy} onToggleTier={tier => setExpanded(current => ({ ...current, [tier]: !current[tier] }))} />{rows.length === 0 && <div className="empty_state"><h3>No classes match these rules</h3><p>Try broader growth ranges, more tiers, or fewer evidence filters.</p><button onClick={resetFilters}>Clear filters</button></div>}</div>{selected && <ClassDetails characterClass={selected} data={data} onClose={closeDetails} />}</div>
    <footer><p>Training bonuses do not prove weapon access. Missing unlock records do not establish automatic or universal availability.</p></footer>
    {confirmLoad && <dialog ref={confirmDialog} aria-labelledby="class_load_confirmation" onCancel={() => setConfirmLoad(false)} onClose={() => { setConfirmLoad(false); loadButton.current?.focus(); }}><h2 id="class_load_confirmation">Load saved Class Library setup?</h2><p>This replaces your unsaved filters and sort priorities.</p><div className="button_row"><button autoFocus onClick={() => { confirmDialog.current?.close(); setConfirmLoad(false); }}>Keep current draft</button><button className="primary" onClick={load}>Load saved setup</button></div></dialog>}
  </div>;
}
