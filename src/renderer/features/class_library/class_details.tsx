import { useEffect, useRef } from 'react';
import { ROUTE_NAMES, STATS, type Route, type Skill, type Tier } from '../../../shared/catalog';
import type { ClassLibraryData } from '../../../shared/api';
import type { CharacterClass } from '../../../shared/source_models';
import { skillLabel, STAT_HEADERS } from '../../../shared/library_setup';
import { unlocksFor } from '../../../shared/class_library_query';
import { ClassIcon } from '../../components/class_icon';
import { SkillIcon } from '../../components/skill_icon';

function modifier(value: number | null) { return value === null ? '—' : value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'; }
function yesNoUnknown(value: boolean | null) { return value === null ? 'Unknown' : value ? 'Yes' : 'No'; }
function ReadableValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">Unknown</span>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}><ReadableValue value={item} /></li>)}</ul> : <span>None listed</span>;
  if (typeof value === 'object') return <dl className="fact_list">{Object.entries(value).map(([key, nested]) => <div key={key}><dt>{skillLabel(key)}</dt><dd><ReadableValue value={nested} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}

export function ClassDetails({ characterClass, data, onClose }: { characterClass: CharacterClass; data: ClassLibraryData; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  const rule = data.certificationRules[characterClass.tier as Tier];
  const unlocks = unlocksFor(characterClass, data.unlocks);
  const conflicts = data.conflicts.filter(conflict => conflict.classId === characterClass.id);
  useEffect(() => { title.current?.focus({ preventScroll: true }); title.current?.closest('aside')?.scrollTo(0, 0); }, [characterClass.id]);
  return <aside id="class_details" className="details_panel class_details" aria-labelledby="class_detail_name" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className="panel_header"><div className="detail_identity"><ClassIcon id={characterClass.id} name={characterClass.name} variant="details" /><div><p className="eyebrow">{skillLabel(characterClass.tier)} class</p><h2 id="class_detail_name" tabIndex={-1} ref={title}>{characterClass.name}</h2></div></div><button aria-label="Close class details" onClick={onClose}>Close</button></div>
    {conflicts.length > 0 && <p className="data_notice">Some reported facts conflict or are incomplete: {conflicts.map(conflict => classIssueLabel(conflict.field, conflict.status)).join('; ')}.</p>}
    <section><h3>Movement</h3><p>{characterClass.movement_tags.length ? characterClass.movement_tags.map(skillLabel).join(', ') : 'Not documented'}</p></section>
    <section><h3>Class growth modifiers</h3><p className="hint">Percentage-point modifiers applied by this class, not complete character growths.</p><dl className="stat_strip">{STATS.map(stat => <div key={stat}><dt>{STAT_HEADERS[stat]}</dt><dd>{modifier(characterClass.class_growth_rate_modifiers_percent[stat])}</dd></div>)}</dl>{STATS.some(stat => characterClass.class_growth_rate_modifiers_percent[stat] === null) && <p className="data_notice">Growth modifiers are not documented for this class. Unknown values are not zero.</p>}</section>
    <section><h3>Training</h3><div className="detail_chips">{Object.entries(characterClass.skill_exp_bonuses).length ? Object.entries(characterClass.skill_exp_bonuses).map(([skill, bonus]) => <span className="training_chip" key={skill}><SkillIcon skill={skill as Skill} variant="neutral" /> {skillLabel(skill)} <strong>{bonus! > 0 ? '+' : ''}{bonus}</strong></span>) : <span className="muted">No positive bonus documented</span>}</div><h4>Explicitly listed without a bonus</h4><p>{characterClass.skills_listed_without_exp_bonus.length ? characterClass.skills_listed_without_exp_bonus.map(skillLabel).join(', ') : 'None listed'}</p><p className="hint">Training bonuses do not establish weapon or magic access.</p></section>
    <section><h3>Weapon and magic access</h3>{characterClass.weapon_access.verified ? <><p><strong>Weapons:</strong> {characterClass.weapon_access.usable_weapon_types?.map(skillLabel).join(', ') || 'None listed'}</p><p><strong>Magic:</strong> {characterClass.weapon_access.usable_magic_types?.map(skillLabel).join(', ') || 'None listed'}</p></> : <p className="data_notice">Weapon and magic access is not verified and cannot be inferred from training bonuses.</p>}</section>
    <section><h3>Certification</h3><dl className="detail_facts"><div><dt>License</dt><dd>{rule.license ?? 'Unknown or not applicable'}</dd></div><div><dt>Ideal level</dt><dd>{rule.ideal_character_level === null ? 'Unknown' : `${rule.ideal_character_level} (guidance, not a verified minimum)`}</dd></div><div><dt>Minimum Renown</dt><dd>{rule.minimum_renown_level ?? 'Unknown or not applicable'}</dd></div><div><dt>Exam required</dt><dd>{yesNoUnknown(rule.requires_exam)}</dd></div>{rule.additional_unlock_item && <div><dt>Additional item</dt><dd>{rule.additional_unlock_item}</dd></div>}</dl><h4>Reported recommended grades</h4>{characterClass.certification.recommended_skill_grades === null ? <p className="muted">Not documented; this does not establish that no skills are required.</p> : <div className="detail_chips">{characterClass.certification.recommended_skill_grades.map(grade => <span className="grade_chip" key={grade.skill_id}><SkillIcon skill={grade.skill_id} variant="neutral" /> {skillLabel(grade.skill_id)} {grade.grade}</span>)}</div>}<p className="data_notice">The complete requirement logic and exam-success formula are not verified. Listed grades are not interpreted as AND or OR.</p></section>
    <section><h3>Active class abilities</h3>{characterClass.active_class_abilities.length ? characterClass.active_class_abilities.map((ability, index) => <article className="ability" key={index}><h4>{ability.name}</h4><p>{ability.effect ?? 'Effect unknown.'}</p></article>) : <p className="muted">No active class abilities documented.</p>}</section>
    <section><h3>Mastery reward</h3><article className="ability"><h4>{characterClass.mastery.ability_name ?? 'Name unknown'}</h4><p>{characterClass.mastery.effect ?? 'Effect unknown.'}</p><p className="hint">Class EXP required: {characterClass.mastery.class_exp_required ?? 'Unknown'} · Retained after reclassing: {yesNoUnknown(characterClass.mastery.retained_on_reclass)}</p></article></section>
    <section><h3>Known unlock methods</h3>{unlocks.length ? unlocks.map(unlock => <article className="unlock_details" key={unlock.id}><div className="route_heading"><h4>{unlock.activity_name}</h4><span className="route_status">{unlock.part === null ? 'Part unknown' : `Part ${unlock.part}`}{unlock.route_id ? ` · ${ROUTE_NAMES[unlock.route_id as Route]}` : ' · Shared/later-story record'}</span></div><dl className="detail_facts"><div><dt>Earliest chapter</dt><dd>{unlock.earliest_chapter ?? 'Unknown'}</dd></div><div><dt>Missable</dt><dd>{yesNoUnknown(unlock.missable)}</dd></div><div><dt>Persists across routes</dt><dd>{yesNoUnknown(unlock.persists_across_routes)}</dd></div><div><dt>Evidence status</dt><dd>{skillLabel(unlock.status)}</dd></div><div className="wide_fact"><dt>Requirements</dt><dd><ReadableValue value={unlock.requirements} /></dd></div>{unlock.deadline_in_game && <div><dt>Deadline</dt><dd>{unlock.deadline_in_game}</dd></div>}</dl></article>) : <p className="data_notice">No specific unlock is documented. This does not establish automatic or universal availability.</p>}</section>
    <section><h3>Character eligibility</h3>{characterClass.known_character_restrictions?.length ? <ReadableValue value={characterClass.known_character_restrictions} /> : <p className="data_notice">{data.restrictions.note}</p>}</section>
  </aside>;
}

function classIssueLabel(field: string, status: string) {
  if (field.includes('growth_rate')) return `growth modifiers ${skillLabel(status)}`;
  if (field.includes('certification')) return `certification guidance ${skillLabel(status)}`;
  if (field.includes('route_unlock')) return `unlock requirement ${skillLabel(status)}`;
  return `${skillLabel(field.split('.').at(-1) ?? field)} ${skillLabel(status)}`;
}
