import { useState } from 'react';
import { ROUTES, ROUTE_NAMES, SKILLS, type Route, type RouteContext } from '../../../shared/catalog';
import { RECRUITMENT_FIELDS, RECRUITMENT_SORT_FIELDS, type FilterRule, type LibrarySetup, type RecruitmentField, fieldLabel, numericFields, parseRecruitmentSortField, recruitmentSortField, skillLabel, sortableFields, unresolvedFilter } from '../../../shared/library_setup';

const RECRUITMENT_SORT_KIND = '__recruitment__';

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
  const ordinarySortFields = fields.filter(field => !parseRecruitmentSortField(field));
  const availableRecruitmentField = RECRUITMENT_SORT_FIELDS.find(field => !setup.sorts.some(rule => rule.field === field));
  const updateFilter = (index: number, rule: FilterRule) => onChange({ ...setup, filters: setup.filters.map((r, i) => i === index ? rule : r) });
  const updateSort = (index: number, field: string, direction?: 'asc' | 'desc') => onChange({ ...setup, sorts: setup.sorts.map((rule, position) => position === index ? { ...rule, field, direction: direction ?? rule.direction } : rule) });
  const changeRecruitmentRoute = (index: number, route: Route, preferred: RecruitmentField) => {
    const field = [preferred, ...RECRUITMENT_FIELDS.filter(candidate => candidate !== preferred)].find(candidate => !setup.sorts.some((rule, position) => position !== index && rule.field === recruitmentSortField(route, candidate)));
    if (field) updateSort(index, recruitmentSortField(route, field));
  };
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
        <p className="hint">Each priority breaks ties in the one above. Recruitment priorities work across all four routes. Unknowns stay last; affinity ascending is boon, neutral, bane.</p>
        {setup.sorts.map((rule, index) => {
          const recruitment = parseRecruitmentSortField(rule.field);
          const ordinaryValue = recruitment ? RECRUITMENT_SORT_KIND : rule.field;
          return <div className="rule" key={`${index}:${rule.field}`}><span className="priority">{index + 1}</span>
            <label>Field<select aria-label={`Sort ${index + 1} field`} value={ordinaryValue} onChange={event => {
              if (event.target.value === RECRUITMENT_SORT_KIND) {
                const field = recruitment?.route ? rule.field : availableRecruitmentField;
                if (field) updateSort(index, field, 'asc');
              } else updateSort(index, event.target.value);
            }}>
              {!fields.includes(rule.field) && <option value={rule.field}>{rule.field} (unresolved)</option>}
              {ordinarySortFields.filter(field => field === rule.field || !setup.sorts.some(sort => sort.field === field)).map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}
              {(recruitment || availableRecruitmentField) && <option value={RECRUITMENT_SORT_KIND}>Recruitment requirement</option>}
            </select></label>
            {recruitment && <><label>Route<select aria-label={`Sort ${index + 1} recruitment route`} value={recruitment.route} onChange={event => changeRecruitmentRoute(index, event.target.value as Route, recruitment.field)}>{ROUTES.map(candidate => <option key={candidate} value={candidate} disabled={RECRUITMENT_FIELDS.every(field => setup.sorts.some((sort, position) => position !== index && sort.field === recruitmentSortField(candidate, field)))}>{ROUTE_NAMES[candidate]}</option>)}</select></label>
              <label>Requirement<select aria-label={`Sort ${index + 1} recruitment requirement`} value={recruitment.field} onChange={event => updateSort(index, recruitmentSortField(recruitment.route, event.target.value as RecruitmentField))}>{RECRUITMENT_FIELDS.map(candidate => <option key={candidate} value={candidate} disabled={setup.sorts.some((sort, position) => position !== index && sort.field === recruitmentSortField(recruitment.route, candidate))}>{fieldLabel(candidate)}</option>)}</select></label></>}
            <label>Direction<select aria-label={`Sort ${index + 1} direction`} value={rule.direction} onChange={event => onChange({ ...setup, sorts: setup.sorts.map((current, position) => position === index ? { ...current, direction: event.target.value as 'asc' | 'desc' } : current) })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
            <button disabled={index === 0} aria-label={`Move sort ${index + 1} up`} onClick={() => moveSort(index, -1)}>↑</button><button disabled={index === setup.sorts.length - 1} aria-label={`Move sort ${index + 1} down`} onClick={() => moveSort(index, 1)}>↓</button><button className="quiet" aria-label={`Remove sort ${index + 1}`} onClick={() => onChange({ ...setup, sorts: setup.sorts.filter((_, position) => position !== index) })}>Remove</button>
            {!fields.includes(rule.field) && <span className="warning">Unresolved — retained but not applied</span>}
          </div>;
        })}
        <div className="button_row"><button disabled={ordinarySortFields.every(field => setup.sorts.some(rule => rule.field === field))} onClick={() => { const field = ordinarySortFields.find(candidate => !setup.sorts.some(rule => rule.field === candidate)); if (field) onChange({ ...setup, sorts: [...setup.sorts, { field, direction: 'desc' }] }); }}>Add sort priority</button><button disabled={!availableRecruitmentField} onClick={() => { if (availableRecruitmentField) onChange({ ...setup, sorts: [...setup.sorts, { field: availableRecruitmentField, direction: 'asc' }] }); }}>Add recruitment priority</button></div>
      </section>
    </div>
  </details>;
}
