import { Fragment } from 'react';
import { STATS, TIERS, type Skill, type Tier } from '../../../shared/catalog';
import type { CharacterClass, CertificationRules, ClassUnlock } from '../../../shared/source_models';
import type { ClassLibrarySetup } from '../../../shared/class_library_setup';
import { classFieldLabel } from '../../../shared/class_library_setup';
import { skillLabel, STAT_HEADERS, STAT_LABELS } from '../../../shared/library_setup';
import { unlocksFor } from '../../../shared/class_library_query';
import { ClassIcon } from '../../components/class_icon';
import { SkillIcon } from '../../components/skill_icon';

function modifier(value: number | null) { return value === null ? <span title="Unknown">—</span> : value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'; }

function UnlockSummary({ unlocks }: { unlocks: ClassUnlock[] }) {
  if (!unlocks.length) return <span className="muted">No specific unlock documented</span>;
  const first = unlocks[0];
  return <><strong>{first.activity_name}</strong><span className="compact_facts">{first.part === null ? 'Part unknown' : `Part ${first.part}`}{first.route_id ? ` · ${skillLabel(first.route_id)}` : ''}</span>{unlocks.length > 1 && <span className="more_count">+{unlocks.length - 1} more method{unlocks.length > 2 ? 's' : ''}</span>}</>;
}

export function ClassTable({ classes, allClasses, certificationRules, unlocks, setup, expanded, selectedId, onSelect, onSort, onToggleTier }: {
  classes: CharacterClass[]; allClasses: CharacterClass[]; certificationRules: CertificationRules; unlocks: ClassUnlock[]; setup: ClassLibrarySetup;
  expanded: Record<Tier, boolean>; selectedId: string | null;
  onSelect: (id: string, target: HTMLButtonElement) => void; onSort: (field: string) => void; onToggleTier: (tier: Tier) => void;
}) {
  function heading(field: string, text: string, className?: string) {
    const index = setup.sorts.findIndex(rule => rule.field === field), sort = setup.sorts[index];
    return <th key={field} scope="col" className={className} aria-sort={index === 0 ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}><button onClick={() => onSort(field)} aria-label={`Sort by ${classFieldLabel(field)}`} title={`Add ${classFieldLabel(field)} as the next sort priority; click again to reverse`}>{text}{index >= 0 && <small> {sort.direction === 'asc' ? '↑' : '↓'}{index + 1}</small>}</button></th>;
  }
  function row(characterClass: CharacterClass) {
    const classUnlocks = unlocksFor(characterClass, unlocks);
    const grades = characterClass.certification.recommended_skill_grades;
    return <tr key={characterClass.id} data-class-id={characterClass.id} className={selectedId === characterClass.id ? 'selected' : ''}>
      <th scope="row" className="class_name_cell"><button className="class_name" aria-expanded={selectedId === characterClass.id} aria-controls={selectedId === characterClass.id ? 'class_details' : undefined} onClick={event => onSelect(characterClass.id, event.currentTarget)}><ClassIcon id={characterClass.id} name={characterClass.name} variant="table" /><span>{characterClass.name}</span></button></th>
      <td>{characterClass.movement_tags.length ? characterClass.movement_tags.map(skillLabel).join(', ') : <span className="muted">Not documented</span>}</td>
      <td className="class_training">{Object.entries(characterClass.skill_exp_bonuses).length ? Object.entries(characterClass.skill_exp_bonuses).map(([skill, bonus]) => <span className="training_chip" key={skill}><SkillIcon skill={skill as Skill} variant="neutral" /> <span>{skillLabel(skill)} <strong>{bonus! > 0 ? '+' : ''}{bonus}</strong></span></span>) : <span className="muted">No positive bonus documented</span>}</td>
      {STATS.map(stat => <td className={`class_growth ${characterClass.class_growth_rate_modifiers_percent[stat] === null ? 'muted' : characterClass.class_growth_rate_modifiers_percent[stat]! > 0 ? 'positive' : characterClass.class_growth_rate_modifiers_percent[stat]! < 0 ? 'negative' : ''}`} key={stat} aria-label={`${STAT_LABELS[stat]} modifier: ${characterClass.class_growth_rate_modifiers_percent[stat] ?? 'Unknown'}`}>{modifier(characterClass.class_growth_rate_modifiers_percent[stat])}</td>)}
      <td className="certification_cell">{grades === null ? <span className="muted">Not documented</span> : grades.map(grade => <span className="grade_chip" key={grade.skill_id}><SkillIcon skill={grade.skill_id} variant="neutral" /> {skillLabel(grade.skill_id)} {grade.grade}</span>)}</td>
      <td className="mastery_cell"><strong>{characterClass.mastery.ability_name ?? 'Unknown'}</strong>{characterClass.mastery.effect === null && <span className="uncertainty_note">Effect unknown</span>}</td>
      <td className="unlock_cell"><UnlockSummary unlocks={classUnlocks} /></td>
    </tr>;
  }
  return <div className="class_table_scroll" role="region" aria-label="Class results by tier, scroll for all rows and columns" tabIndex={0}>
    <table className="class_table"><thead><tr>{heading('name', 'Class', 'class_name_cell')}{heading('movement', 'Movement')}<th scope="col">Training</th>{STATS.map(stat => heading(stat, STAT_HEADERS[stat]))}{heading('certification', 'Recommended grades', 'certification_column')}{heading('mastery', 'Mastery', 'mastery_column')}{heading('unlock', 'Known unlock', 'unlock_column')}</tr></thead>
      <tbody>{TIERS.map(tier => {
        const tierRows = classes.filter(characterClass => characterClass.tier === tier), total = allClasses.filter(characterClass => characterClass.tier === tier).length, rule = certificationRules[tier];
        return <Fragment key={tier}><tr className="tier_title_row"><th colSpan={15} scope="rowgroup"><button className="tier_heading" aria-expanded={expanded[tier]} onClick={() => onToggleTier(tier)}><span><strong>{skillLabel(tier)}</strong><small>{tierRows.length} of {total} classes</small></span><span className="tier_rule">{rule.license ?? 'No license documented'} · {rule.ideal_character_level === null ? 'Level guidance unknown' : `Ideal level ${rule.ideal_character_level}`} · {rule.minimum_renown_level === null ? 'Renown unknown/not applicable' : `Renown ${rule.minimum_renown_level}`}{rule.additional_unlock_item ? ` · ${rule.additional_unlock_item}` : ''}</span><span aria-hidden="true">{expanded[tier] ? '▾' : '▸'}</span></button></th></tr>{expanded[tier] && (tierRows.length ? tierRows.map(row) : <tr className="tier_empty_row"><td colSpan={15}>No {skillLabel(tier).toLocaleLowerCase('en')} classes match the current rules.</td></tr>)}</Fragment>;
      })}</tbody>
    </table>
  </div>;
}
