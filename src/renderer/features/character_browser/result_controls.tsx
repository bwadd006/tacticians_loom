import { useState } from 'react';
import { SKILLS, type RouteContext } from '../../../shared/catalog';
import { type FilterRule, type LibrarySetup, fieldLabel, numericFields, skillLabel, sortableFields, unresolvedFilter } from '../../../shared/library_setup';

function NumberRule({ rule, onChange }: { rule: Extract<FilterRule, { kind: 'number' }>; onChange: (r: FilterRule) => void }) {
  const [error, setError] = useState('');
  return <>
    {(['min', 'max'] as const).map(bound => <label key={bound}>{bound === 'min' ? 'At least' : 'At most'}<input type="number" step="any" aria-label={`${fieldLabel(rule.field)} ${bound}`} defaultValue={rule[bound] ?? ''} key={`${bound}:${rule[bound]}`} disabled={rule.unknown === 'only'} onBlur={event => {
      const input = event.currentTarget;
      if (input.validity.badInput) { setError('Enter a valid number.'); return; }
      const value = input.value === '' ? null : input.valueAsNumber;
      const next = { ...rule, [bound]: value };
      if ((value !== null && !Number.isFinite(value)) || (next.min !== null && next.max !== null && next.min > next.max)) {
        setError('Minimum must be no greater than maximum. The previous rule remains active.');
        input.value = rule[bound] === null ? '' : String(rule[bound]);
        return;
      }
      setError(''); onChange(next);
    }} /></label>)}
    <label>Unknown values<select value={rule.unknown} onChange={e => onChange({ ...rule, unknown: e.target.value as typeof rule.unknown })}><option value="exclude">Exclude</option><option value="include">Include</option><option value="only">Only unknown</option></select></label>
    {error && <span role="alert" className="warning">{error}</span>}
  </>;
}
export function ResultControls({ setup, route, onChange }: { setup: LibrarySetup; route: RouteContext; onChange: (s: LibrarySetup) => void }) {
  const fields = sortableFields(route);
  const updateFilter = (index: number, rule: FilterRule) => onChange({ ...setup, filters: setup.filters.map((r, i) => i === index ? rule : r) });
  const moveSort = (index: number, delta: number) => { const sorts = [...setup.sorts]; [sorts[index], sorts[index + delta]] = [sorts[index + delta], sorts[index]]; onChange({ ...setup, sorts }); };
  return <details className="customize">
    <summary>Customize Results <span className="muted">{setup.filters.length} filters · {setup.sorts.length} sort priorities</span></summary>
    <div className="control_sections">
      <section aria-labelledby="filters_heading"><div className="section_heading"><h3 id="filters_heading">Filter rules</h3><label>Match<select aria-label="Rule matching" value={setup.mode} onChange={e => onChange({ ...setup, mode: e.target.value as 'all' | 'any' })}><option value="all">All rules</option><option value="any">Any rule</option></select></label></div>
        <p className="hint">Name search and route scope always apply. Number edits apply when you leave the field.</p>
        {setup.filters.map((rule, index) => <div className="rule" key={`${index}:${rule.kind}:${rule.kind === 'number' ? rule.field : rule.skill}`}>
          {rule.kind === 'number' ? <><label>Number<select aria-label={`Filter ${index + 1} field`} value={rule.field} onChange={e => updateFilter(index, { ...rule, field: e.target.value })}>{!numericFields(route).includes(rule.field) && <option value={rule.field}>{rule.field} (unresolved)</option>}{numericFields(route).map(f => <option key={f} value={f}>{fieldLabel(f)}</option>)}</select></label><NumberRule rule={rule} onChange={r => updateFilter(index, r)} /></>
            : <><label>Skill<select aria-label={`Filter ${index + 1} skill`} value={rule.skill} onChange={e => updateFilter(index, { ...rule, skill: e.target.value })}>{!(SKILLS as readonly string[]).includes(rule.skill) && <option value={rule.skill}>{rule.skill} (unresolved)</option>}{SKILLS.map(s => <option key={s} value={s}>{skillLabel(s)}</option>)}</select></label><label>Interest<select aria-label={`Filter ${index + 1} interest`} value={rule.match} onChange={e => updateFilter(index, { ...rule, match: e.target.value as typeof rule.match })}><option value="boon">Has a boon</option><option value="bane">Has a bane</option><option value="neutral">Known neutral</option><option value="not_bane">No known bane (known data)</option><option value="unknown">Unknown affinity</option><option value="ability">Related ability (partial coverage)</option></select></label></>}
          <button className="quiet" aria-label={`Remove filter ${index + 1}`} onClick={() => onChange({ ...setup, filters: setup.filters.filter((_, i) => i !== index) })}>Remove</button>
          {unresolvedFilter(rule, route) && <span className="warning">Unresolved — retained but not applied</span>}
        </div>)}
        <div className="button_row"><button onClick={() => onChange({ ...setup, filters: [...setup.filters, { kind: 'number', field: 'strength', min: null, max: null, unknown: 'exclude' }] })}>Add number rule</button><button onClick={() => onChange({ ...setup, filters: [...setup.filters, { kind: 'skill', skill: 'swords', match: 'boon' }] })}>Add skill interest</button></div>
        <p className="hint">Affinities describe training, not weapon access. Related abilities use reviewed effect text; coverage is incomplete.</p>
      </section>
      <section aria-labelledby="sort_heading"><div className="section_heading"><h3 id="sort_heading">Sort priorities</h3></div>
        <p className="hint">Each priority breaks ties in the one above. Unknowns stay last. Affinity ascending: boon, neutral, bane.</p>
        {setup.sorts.map((rule, index) => <div className="rule" key={rule.field}><span className="priority">{index + 1}</span><label>Field<select aria-label={`Sort ${index + 1} field`} value={rule.field} onChange={e => onChange({ ...setup, sorts: setup.sorts.map((r, i) => i === index ? { ...r, field: e.target.value } : r) })}>{!fields.includes(rule.field) && <option value={rule.field}>{rule.field} (unresolved)</option>}{fields.filter(f => f === rule.field || !setup.sorts.some(r => r.field === f)).map(f => <option key={f} value={f}>{fieldLabel(f)}</option>)}</select></label><label>Direction<select aria-label={`Sort ${index + 1} direction`} value={rule.direction} onChange={e => onChange({ ...setup, sorts: setup.sorts.map((r, i) => i === index ? { ...r, direction: e.target.value as 'asc' | 'desc' } : r) })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
          <button disabled={index === 0} aria-label={`Move sort ${index + 1} up`} onClick={() => moveSort(index, -1)}>↑</button><button disabled={index === setup.sorts.length - 1} aria-label={`Move sort ${index + 1} down`} onClick={() => moveSort(index, 1)}>↓</button><button className="quiet" aria-label={`Remove sort ${index + 1}`} onClick={() => onChange({ ...setup, sorts: setup.sorts.filter((_, i) => i !== index) })}>Remove</button>
          {!fields.includes(rule.field) && <span className="warning">Unresolved — retained but not applied</span>}
        </div>)}
        <button disabled={fields.every(f => setup.sorts.some(r => r.field === f))} onClick={() => { const field = fields.find(f => !setup.sorts.some(r => r.field === f)); if (field) onChange({ ...setup, sorts: [...setup.sorts, { field, direction: 'desc' }] }); }}>Add sort priority</button>
      </section>
    </div>
  </details>;
}
