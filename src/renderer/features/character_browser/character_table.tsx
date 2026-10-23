import type { RefObject } from 'react';
import { ROUTES, ROUTE_NAMES, STATS, type Route, type RouteContext } from '../../../shared/catalog';
import type { Character } from '../../../shared/source_models';
import type { LibrarySetup } from '../../../shared/library_setup';
import { fieldLabel, skillLabel, STAT_HEADERS, STAT_LABELS } from '../../../shared/library_setup';
import { abilityMatches, isAvailable, statusLabel } from '../../../shared/library_query';
import { Portrait } from '../../components/portrait';
import { SkillIcon } from '../../components/skill_icon';

type Requirement = Character['recruitment_by_route'][Route]['requirements'][number];

function simpleValue(value: unknown): string {
  if (value === null || value === undefined) return 'Unknown';
  if (Array.isArray(value)) return value.map(simpleValue).join(', ');
  if (typeof value === 'object') return Object.entries(value).map(([key, nested]) => `${skillLabel(key)} ${simpleValue(nested)}`).join(', ');
  return String(value);
}

function requirementLabel(requirement: Requirement): string {
  if (requirement.type === 'item') return `${simpleValue(requirement.quantity)} × ${simpleValue(requirement.name)}`;
  if (requirement.type === 'gold') return `${simpleValue(requirement.amount)} G`;
  if (requirement.type === 'request') return `Request: ${simpleValue(requirement.detail)}`;
  if (requirement.type === 'paralogue') return `Paralogue: ${simpleValue(requirement.detail)}`;
  if (requirement.type === 'dialogue') return `Dialogue: ${simpleValue(requirement.detail)}`;
  if (requirement.type === 'story') return `Story: ${simpleValue(requirement.detail)}`;
  if (requirement.type === 'negotiation') return `Negotiation: ${simpleValue(requirement.instruction ?? requirement.cost_gold)}`;
  const details = Object.entries(requirement).filter(([key]) => key !== 'type').map(([key, value]) => `${skillLabel(key)} ${simpleValue(value)}`).join(', ');
  return details ? `${skillLabel(requirement.type)}: ${details}` : skillLabel(requirement.type);
}

export function CharacterTable({ characters, route, setup, selectedId, onSelect, onSort, scrollRef }: {
  characters: Character[]; route: RouteContext; setup: LibrarySetup; selectedId: string | null;
  onSelect: (id: string, target: HTMLButtonElement) => void; onSort: (field: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
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
      <thead><tr>{heading('name', 'Character', 'name_cell')}{STATS.map(stat => heading(stat, STAT_HEADERS[stat]))}<th scope="col">Skill affinities</th>{ROUTES.map(r => heading(`availability:${r}`, ROUTE_NAMES[r], 'route_summary_column'))}</tr></thead>
      <tbody>{characters.map(c => <tr key={c.id} data-character-id={c.id} className={selectedId === c.id ? 'selected' : ''}>
        <th scope="row" className="name_cell"><button className="character_name" aria-expanded={selectedId === c.id} aria-controls={selectedId === c.id ? 'character_details' : undefined} onClick={e => onSelect(c.id, e.currentTarget)}><Portrait id={c.id} name={c.name} variant="table" /><span>{c.name}</span></button></th>
        {STATS.map(stat => <td key={stat} className="growth" aria-label={`${STAT_LABELS[stat]}: ${c.growth_rates_percent[stat] ?? 'Unknown'}`}>{c.growth_rates_percent[stat] ?? <span title="Unknown">—</span>}</td>)}
        <td className="affinities"><div className="boons">+ {c.skill_proficiencies.boons === null ? 'Unknown' : c.skill_proficiencies.boons.length === 0 ? 'None' : c.skill_proficiencies.boons.map(s => <SkillIcon key={s} skill={s} variant="boon" />)}</div><div className="banes">− {c.skill_proficiencies.banes === null ? 'Unknown' : c.skill_proficiencies.banes.length === 0 ? 'None' : c.skill_proficiencies.banes.map(s => <SkillIcon key={s} skill={s} variant="bane" />)}</div>
          {setup.filters.flatMap(rule => rule.kind === 'skill' && rule.match === 'ability' ? abilityMatches(c, rule.skill).map(a => <div className="ability_match" key={`${rule.skill}:${a.abilityName}`} title={a.evidence}>Ability: {a.abilityName} ({skillLabel(a.skill)})</div>) : [])}
        </td>
        {ROUTES.map(r => {
          const recruitment = c.recruitment_by_route[r];
          const available = isAvailable(recruitment.status);
          return <td key={r} className={`route_summary_cell ${available ? 'available' : 'muted'}`}>
            <strong className="route_summary_status">{statusLabel(recruitment.status)}</strong>
            {available && (recruitment.status === 'automatic'
              ? <div className="route_summary_facts"><span>Chapter: <strong>{recruitment.earliest_chapter ?? 'Unknown'}</strong></span></div>
              : <><div className="route_summary_facts"><span>Chapter: <strong>{recruitment.earliest_chapter ?? 'Unknown'}</strong></span><span>Renown: <strong>{recruitment.min_renown ?? 'Unknown'}</strong></span><span>Support: <strong>{recruitment.min_support ?? 'Unknown'}</strong></span></div>{recruitment.requirements.length > 0 && <ul className="route_requirements">{recruitment.requirements.map((requirement, index) => <li key={index}>{requirementLabel(requirement)}</li>)}</ul>}</>)}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
