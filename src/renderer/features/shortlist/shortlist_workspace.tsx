import './shortlist.css';
import { useEffect, useMemo, useState } from 'react';
import { ROUTES, ROUTE_NAMES, SKILLS, STATS, type Route, type RouteContext, type Skill, type Stat } from '../../../shared/catalog';
import type { Character } from '../../../shared/source_models';
import type { ReferenceOverview } from '../../../shared/api';
import { planningById } from '../../../shared/character_planning';
import { SHORTLIST_SORT_FIELDS, affinityDisplay, applyShortlistColumnSort, comparisonValuesDiffer, defaultShortlistSorts, shortlistDefaultDirection, shortlistFieldLabel, sortShortlist, type ShortlistEntry } from '../../../shared/character_comparison';
import { availabilityLabel, affinity, isAvailable, statusLabel } from '../../../shared/library_query';
import { skillLabel, STAT_HEADERS, STAT_LABELS, type SortRule } from '../../../shared/library_setup';
import { Portrait } from '../../components/portrait';
import { SkillIcon } from '../../components/skill_icon';
import { CharacterNoteEditor } from './character_note_editor';
import type { PlanningController } from './types';
import { CharacterDetails } from '../character_browser/character_details';

type SectionKey = 'growths' | 'affinities' | 'abilities' | 'recruitment';
function move<T>(values: T[], index: number, delta: number): T[] {
  const next = [...values], target = index + delta;
  if (target < 0 || target >= values.length) return values;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
function requirementText(value: unknown): string {
  if (value === null || value === undefined) return 'Unknown';
  if (Array.isArray(value)) return value.map(requirementText).join(', ');
  if (typeof value === 'object') return Object.entries(value).filter(([key]) => key !== 'type').map(([key, nested]) => `${skillLabel(key)} ${requirementText(nested)}`).join(' · ');
  return String(value);
}
function iconVariant(character: Character, skill: Skill): 'boon' | 'bane' | 'neutral' {
  const value = affinity(character, skill);
  return value === 'boon' || value === 'bane' ? value : 'neutral';
}

export function ShortlistWorkspace({ characters, overview, planning, onBrowseCharacters }: {
  characters: Character[]; overview: ReferenceOverview; planning: PlanningController; onBrowseCharacters: () => void;
}) {
  const records = useMemo(() => planningById(planning.records), [planning.records]);
  const charactersById = useMemo(() => new Map(characters.map(character => [character.id, character])), [characters]);
  const entries = useMemo<ShortlistEntry[]>(() => planning.records.filter(record => record.shortlisted).map(record => ({ planning: record, character: charactersById.get(record.characterId) ?? null })), [planning.records, charactersById]);
  const [search, setSearch] = useState('');
  const [sorts, setSorts] = useState<SortRule[]>(defaultShortlistSorts);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [focusStats, setFocusStats] = useState<Stat[]>([]);
  const [focusSkills, setFocusSkills] = useState<Skill[]>([]);
  const [routeFocus, setRouteFocus] = useState<RouteContext>('all');
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ growths: true, affinities: true, abilities: false, recruitment: true });
  const sorted = useMemo(() => sortShortlist(entries.filter(entry => (entry.character?.name ?? entry.planning.characterId).toLocaleLowerCase('en').includes(search.trim().toLocaleLowerCase('en'))), sorts), [entries, search, sorts]);
  useEffect(() => { setSelectedIds(ids => ids.filter(id => records.get(id)?.shortlisted && charactersById.has(id))); }, [records, charactersById]);
  useEffect(() => { if (detailId && !records.get(detailId)?.shortlisted) setDetailId(null); }, [detailId, records]);
  const selected = selectedIds.map(id => charactersById.get(id)).filter((character): character is Character => Boolean(character));
  const detailedCharacter = detailId ? charactersById.get(detailId) : undefined;
  const addableSort = SHORTLIST_SORT_FIELDS.find(field => !sorts.some(rule => rule.field === field));
  function toggleSelected(id: string) { setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  function toggleFocusStat(stat: Stat) { setFocusStats(current => current.includes(stat) ? current.filter(value => value !== stat) : [...current, stat]); }
  function toggleFocusSkill(skill: Skill) { setFocusSkills(current => current.includes(skill) ? current.filter(value => value !== skill) : [...current, skill]); }
  function sectionHeading(key: SectionKey, label: string, columnCount: number) {
    return <tr className="comparison_section"><th colSpan={columnCount}><button aria-expanded={expanded[key]} onClick={() => setExpanded(current => ({ ...current, [key]: !current[key] }))}><span>{label}</span><span aria-hidden="true">{expanded[key] ? '▾' : '▸'}</span></button></th></tr>;
  }
  function comparisonRow(label: string, values: unknown[], cells: React.ReactNode[], focused = false) {
    const differs = comparisonValuesDiffer(values);
    return <tr key={label} className={`${differs ? 'varies' : 'same'} ${focused ? 'focused' : ''}`}><th scope="row">{label}</th>{cells.map((cell, index) => <td key={selected[index].id}>{cell}</td>)}</tr>;
  }
  return <div className="shortlist_workspace">
    <div className="library_heading"><div><h2>Shortlist &amp; Compare</h2><p>Keep appealing candidates together and compare the evidence without assigning a winner.</p></div><span className="dataset_badge">Dataset {overview.datasetVersion}</span></div>
    {planning.error && <p role="alert" className="warning">{planning.error}</p>}
    {!entries.length ? <div className="empty_state shortlist_empty"><h3>Your shortlist is empty</h3><p>Add candidates from the Character Library. Shortlisting records interest; it does not recruit them or place them on a team.</p><button className="primary" onClick={onBrowseCharacters}>Browse characters</button></div> : <>
      <div className="shortlist_toolbar"><label className="search_label">Find a shortlisted character<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><div><strong>{entries.length}</strong> shortlisted · <strong>{selected.length}</strong> selected</div><button className="quiet" disabled={!selected.length} onClick={() => setSelectedIds([])}>Clear comparison</button></div>
      <details className="shortlist_controls"><summary>Focus fields and sorting</summary><div className="shortlist_control_grid">
        <section><h3>Focus growths</h3><div className="choice_grid">{STATS.map(stat => <label key={stat}><input type="checkbox" checked={focusStats.includes(stat)} onChange={() => toggleFocusStat(stat)} /> {STAT_LABELS[stat]}</label>)}</div></section>
        <section><h3>Focus skills</h3><div className="choice_grid">{SKILLS.map(skill => <label key={skill}><input type="checkbox" checked={focusSkills.includes(skill)} onChange={() => toggleFocusSkill(skill)} /> {skillLabel(skill)}</label>)}</div></section>
        <section className="shortlist_sort_controls"><h3>Sort priorities</h3><p className="hint">New fields append in priority order. Unknowns stay last.</p>{sorts.map((rule, index) => <div className="rule" key={`${index}:${rule.field}`}><span className="priority">{index + 1}</span><select aria-label={`Shortlist sort ${index + 1} field`} value={rule.field} onChange={event => setSorts(current => current.map((value, position) => position === index ? { field: event.target.value, direction: shortlistDefaultDirection(event.target.value) } : value))}>{SHORTLIST_SORT_FIELDS.filter(field => field === rule.field || !sorts.some(value => value.field === field)).map(field => <option key={field} value={field}>{shortlistFieldLabel(field)}</option>)}</select><select aria-label={`Shortlist sort ${index + 1} direction`} value={rule.direction} onChange={event => setSorts(current => current.map((value, position) => position === index ? { ...value, direction: event.target.value as 'asc' | 'desc' } : value))}><option value="asc">Ascending</option><option value="desc">Descending</option></select><button disabled={index === 0} aria-label={`Move shortlist sort ${index + 1} up`} onClick={() => setSorts(current => move(current, index, -1))}>↑</button><button disabled={index === sorts.length - 1} aria-label={`Move shortlist sort ${index + 1} down`} onClick={() => setSorts(current => move(current, index, 1))}>↓</button><button className="quiet" onClick={() => setSorts(current => current.filter((_, position) => position !== index))}>Remove</button></div>)}<div className="button_row"><button disabled={!addableSort} onClick={() => addableSort && setSorts(current => applyShortlistColumnSort(current, addableSort))}>Add sort priority</button><button className="quiet" onClick={() => setSorts(defaultShortlistSorts())}>Reset Sorting</button></div></section>
      </div></details>
      <div className="shortlist_table_scroll" role="region" aria-label="Shortlisted characters" tabIndex={0}><table className="shortlist_table"><thead><tr><th scope="col">Compare</th><th scope="col" className="shortlist_identity"><button onClick={() => setSorts(current => applyShortlistColumnSort(current, 'name'))}>Character</button></th>{focusStats.map(stat => <th key={stat}><button onClick={() => setSorts(current => applyShortlistColumnSort(current, stat))}>{STAT_HEADERS[stat]}</button></th>)}{focusSkills.map(skill => <th key={skill}><button onClick={() => setSorts(current => applyShortlistColumnSort(current, `affinity:${skill}`))}>{skillLabel(skill)}</button></th>)}{ROUTES.map(route => <th key={route}><button onClick={() => setSorts(current => applyShortlistColumnSort(current, `availability:${route}`))}>{ROUTE_NAMES[route]}</button></th>)}<th scope="col">Personal note</th><th scope="col">Actions</th></tr></thead><tbody>{sorted.map(entry => {
        const character = entry.character, id = entry.planning.characterId;
        return <tr key={id} data-shortlist-id={id}><td><label className="compare_choice"><input type="checkbox" checked={selectedIds.includes(id)} disabled={!character} onChange={() => toggleSelected(id)} /><span className="visually_hidden">Compare {character?.name ?? id}</span></label></td><th scope="row" className="shortlist_identity">{character ? <button className="shortlist_name" onClick={() => setDetailId(id)}><Portrait id={id} name={character.name} variant="table" /> {character.name}</button> : <span>Unresolved: {id}</span>}</th>{focusStats.map(stat => <td className="numeric" key={stat}>{character?.growth_rates_percent[stat] ?? '—'}</td>)}{focusSkills.map(skill => <td key={skill}>{character ? <span className={`affinity_value ${affinity(character, skill)}`}><SkillIcon skill={skill} variant={iconVariant(character, skill)} /> {affinityDisplay(character, skill)}</span> : '—'}</td>)}{ROUTES.map(route => <td key={route} className={character && isAvailable(character.recruitment_by_route[route].status) ? 'available' : 'muted'}>{character ? availabilityLabel(character.recruitment_by_route[route].status) : 'Unknown'}</td>)}<td className="note_cell"><CharacterNoteEditor planning={entry.planning} onSave={note => planning.saveNote(id, note)} onClear={() => planning.clearNote(id)} /></td><td><button className="quiet" disabled={planning.pendingIds.has(id)} onClick={() => void planning.setShortlisted(id, false)}>Remove</button></td></tr>;
      })}</tbody></table>{!sorted.length && <div className="empty_state"><h3>No shortlisted characters match</h3><button onClick={() => setSearch('')}>Clear search</button></div>}</div>
      {detailedCharacter && <div className="shortlist_detail"><CharacterDetails character={detailedCharacter} route="all" planning={records.get(detailedCharacter.id)} pending={planning.pendingIds.has(detailedCharacter.id)} onToggleShortlist={shortlisted => planning.setShortlisted(detailedCharacter.id, shortlisted)} onClose={() => setDetailId(null)} /></div>}
      <section className="comparison_area" aria-labelledby="comparison_heading"><div className="comparison_heading"><div><h2 id="comparison_heading">Character comparison</h2><p>{selected.length ? `${selected.length} character${selected.length === 1 ? '' : 's'} selected. Columns remain in selection order.` : 'Select characters in the shortlist table to compare them.'}</p></div><label>Recruitment focus<select value={routeFocus} onChange={event => setRouteFocus(event.target.value as RouteContext)}><option value="all">All Routes</option>{ROUTES.map(route => <option key={route} value={route}>{ROUTE_NAMES[route]}</option>)}</select></label></div>
        {selected.length > 0 && <div className="comparison_scroll" role="region" aria-label="Side-by-side character comparison" tabIndex={0}><table className="comparison_table"><thead><tr><th scope="col">Evidence</th>{selected.map((character, index) => <th scope="col" key={character.id}><div className="comparison_character"><Portrait id={character.id} name={character.name} variant="details" /><strong>{character.name}</strong><div className="comparison_order"><button disabled={index === 0} aria-label={`Move ${character.name} left`} onClick={() => setSelectedIds(current => move(current, index, -1))}>←</button><button disabled={index === selected.length - 1} aria-label={`Move ${character.name} right`} onClick={() => setSelectedIds(current => move(current, index, 1))}>→</button><button className="quiet" aria-label={`Remove ${character.name} from comparison`} onClick={() => toggleSelected(character.id)}>Remove</button></div>{records.get(character.id)?.note && <p>{records.get(character.id)?.note}</p>}</div></th>)}</tr></thead><tbody>
          {sectionHeading('growths', 'Personal growths', selected.length + 1)}
          {expanded.growths && <>{STATS.map(stat => comparisonRow(STAT_LABELS[stat], selected.map(character => character.growth_rates_percent[stat]), selected.map(character => character.growth_rates_percent[stat] ?? <span className="muted">Unknown</span>), focusStats.includes(stat)))}{selected.some(character => character.effective_personal_growth_rates_percent) && comparisonRow('Personal ability adjustment', selected.map(character => character.effective_personal_growth_rates_percent), selected.map(character => character.effective_personal_growth_rates_percent ? <div className="adjusted_growths">{STATS.map(stat => <span key={stat}>{STAT_HEADERS[stat]} <strong>{character.effective_personal_growth_rates_percent![stat] ?? '—'}</strong></span>)}<small>{character.effective_growth_rates_note}</small></div> : <span className="muted">No adjustment documented</span>))}</>}
          {sectionHeading('affinities', 'Skill affinities', selected.length + 1)}
          {expanded.affinities && SKILLS.map(skill => comparisonRow(skillLabel(skill), selected.map(character => affinity(character, skill)), selected.map(character => <span className={`affinity_value ${affinity(character, skill)}`}><SkillIcon skill={skill} variant={iconVariant(character, skill)} /> {affinityDisplay(character, skill)}</span>), focusSkills.includes(skill)))}
          {sectionHeading('abilities', 'Personal abilities', selected.length + 1)}
          {expanded.abilities && comparisonRow('Abilities', selected.map(character => character.personal_abilities), selected.map(character => <div className="comparison_abilities">{character.personal_abilities.map((ability, index) => <article key={index}><strong>{ability.name}</strong> <small>Rank {ability.rank}</small><p>{ability.effect ?? 'Effect unknown.'}</p><span className="hint">{skillLabel(ability.acquisition.type)} · {ability.acquisition.level === null ? 'Level unknown' : `Level ${ability.acquisition.level}`}{ability.upgrade_of ? ` · Upgrades ${ability.upgrade_of}` : ''}</span></article>)}</div>))}
          {sectionHeading('recruitment', 'Recruitment by route', selected.length + 1)}
          {expanded.recruitment && ROUTES.map(route => comparisonRow(ROUTE_NAMES[route], selected.map(character => { const value = character.recruitment_by_route[route]; return { status: value.status, earliest_chapter: value.earliest_chapter, min_renown: value.min_renown, min_support: value.min_support, missable: value.missable, requirements: value.requirements }; }), selected.map(character => {
            const recruitment = character.recruitment_by_route[route];
            return <div className="comparison_recruitment"><strong>{statusLabel(recruitment.status)}</strong>{isAvailable(recruitment.status) && <>{recruitment.status === 'automatic' ? <p>Chapter: <b>{recruitment.earliest_chapter ?? 'Unknown'}</b></p> : <p>Chapter: <b>{recruitment.earliest_chapter ?? 'Unknown'}</b><br />Renown: <b>{recruitment.min_renown ?? 'Unknown'}</b><br />Support: <b>{recruitment.min_support ?? 'Unknown'}</b><br />Missable: <b>{recruitment.missable === null ? 'Unknown' : recruitment.missable ? 'Yes' : 'No, as reported'}</b></p>}{recruitment.requirements.length > 0 && <ul>{recruitment.requirements.map((requirement, index) => <li key={index}>{skillLabel(requirement.type)}{requirementText(requirement) ? `: ${requirementText(requirement)}` : ''}</li>)}</ul>}</>}</div>;
          }), routeFocus === route))}
        </tbody></table></div>}
      </section>
    </>}
    <footer><p>Shortlisting records interest only. Comparison highlights differences without ranking characters, assigning classes, or planning recruitment.</p></footer>
  </div>;
}
