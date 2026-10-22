import type { RefObject } from 'react';
import { ROUTES, ROUTE_NAMES, STATS, type RouteContext } from '../../../shared/catalog';
import type { Character } from '../../../shared/source_models';
import type { LibrarySetup } from '../../../shared/library_setup';
import { fieldLabel, RECRUITMENT_FIELDS, skillLabel, STAT_HEADERS, STAT_LABELS } from '../../../shared/library_setup';
import { abilityMatches, availabilityLabel, statusLabel } from '../../../shared/library_query';
import { Portrait } from '../../components/portrait';
import { SkillIcon } from '../../components/skill_icon';

export function CharacterTable({ characters, route, setup, selectedId, onSelect, onSort, scrollRef, disputed }: {
  characters: Character[]; route: RouteContext; setup: LibrarySetup; selectedId: string | null;
  onSelect: (id: string, target: HTMLButtonElement) => void; onSort: (field: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>; disputed: Set<string>;
}) {
  function heading(field: string, label: string, className?: string) {
    const index = setup.sorts.findIndex(r => r.field === field);
    const sort = setup.sorts[index];
    return <th key={field} scope="col" className={className} aria-sort={index === 0 ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>
      <button onClick={() => onSort(field)} title={`Sort by ${fieldLabel(field)}; click again to reverse`} aria-label={`Sort by ${fieldLabel(field)}`}>{label}{index >= 0 && <small> {sort.direction === 'asc' ? '↑' : '↓'}{index + 1}</small>}</button>
    </th>;
  }
  return <div className="table_scroll" ref={scrollRef} role="region" aria-label="Character results, scroll horizontally for all columns" tabIndex={0}>
    <table className="character_table" aria-label="Act 1 characters">
      <thead><tr>{heading('name', 'Character', 'name_cell')}{STATS.map(stat => heading(stat, STAT_HEADERS[stat]))}<th scope="col">Skill affinities</th>{route !== 'all' && <>{heading('status', 'Recruitment')}{RECRUITMENT_FIELDS.map(field => heading(field, fieldLabel(field)))}</>}{ROUTES.map(r => heading(`availability:${r}`, ROUTE_NAMES[r]))}</tr></thead>
      <tbody>{characters.map(c => <tr key={c.id} data-character-id={c.id} className={selectedId === c.id ? 'selected' : ''}>
        <th scope="row" className="name_cell"><button className="character_name" aria-expanded={selectedId === c.id} aria-controls={selectedId === c.id ? 'character_details' : undefined} onClick={e => onSelect(c.id, e.currentTarget)}><Portrait id={c.id} name={c.name} variant="table" /><span>{c.name}{disputed.has(c.id) && <span className="disputed" title="Source conflicts: open details" aria-label="Source conflicts"> †</span>}</span></button></th>
        {STATS.map(stat => <td key={stat} className="growth" aria-label={`${STAT_LABELS[stat]}: ${c.growth_rates_percent[stat] ?? 'Unknown'}`}>{c.growth_rates_percent[stat] ?? <span title="Unknown">—</span>}</td>)}
        <td className="affinities"><div className="boons">+ {c.skill_proficiencies.boons === null ? 'Unknown' : c.skill_proficiencies.boons.length === 0 ? 'None' : c.skill_proficiencies.boons.map(s => <SkillIcon key={s} skill={s} variant="boon" />)}</div><div className="banes">− {c.skill_proficiencies.banes === null ? 'Unknown' : c.skill_proficiencies.banes.length === 0 ? 'None' : c.skill_proficiencies.banes.map(s => <SkillIcon key={s} skill={s} variant="bane" />)}</div>
          {setup.filters.flatMap(rule => rule.kind === 'skill' && rule.match === 'ability' ? abilityMatches(c, rule.skill).map(a => <div className="ability_match" key={`${rule.skill}:${a.abilityName}`} title={a.evidence}>Ability: {a.abilityName} ({skillLabel(a.skill)})</div>) : [])}
        </td>
        {route !== 'all' && <><td className="recruitment_status">{statusLabel(c.recruitment_by_route[route].status)}{(c.recruitment_by_route[route].requirements.length > 0 || c.recruitment_by_route[route].missable === true) && <small>Conditions in details{c.recruitment_by_route[route].missable === true ? ' · Missable' : ''}</small>}</td>{RECRUITMENT_FIELDS.map(field => <td key={field}>{c.recruitment_by_route[route][field] ?? <span title="Unknown">—</span>}</td>)}</>}
        {ROUTES.map(r => <td key={r} className={`availability ${availabilityLabel(c.recruitment_by_route[r].status) === 'Available' ? 'available' : 'muted'}`} title={statusLabel(c.recruitment_by_route[r].status)}>{availabilityLabel(c.recruitment_by_route[r].status)}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
