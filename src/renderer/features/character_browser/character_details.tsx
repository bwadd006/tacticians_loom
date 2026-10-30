import { ActionIcon } from '../../components/action_icon';
import { useEffect, useRef } from 'react';
import { ROUTES, ROUTE_NAMES, STATS, type RouteContext } from '../../../shared/catalog';
import type { Character } from '../../../shared/source_models';
import { skillLabel, STAT_HEADERS } from '../../../shared/library_setup';
import { isAvailable, statusLabel } from '../../../shared/library_query';
import { Portrait } from '../../components/portrait';
import { SkillIcon } from '../../components/skill_icon';
import type { CharacterPlanning } from '../../../shared/character_planning';

function ReadableValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">Unknown</span>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((v, i) => <li key={i}><ReadableValue value={v} /></li>)}</ul> : <span>None listed</span>;
  if (typeof value === 'object') return <dl className="fact_list">{Object.entries(value).map(([key, v]) => <div key={key}><dt>{skillLabel(key)}</dt><dd><ReadableValue value={v} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}
export function CharacterDetails({ character: c, route, planning, pending, onToggleShortlist, onClose }: { character: Character; route: RouteContext; planning?: CharacterPlanning; pending: boolean; onToggleShortlist: (shortlisted: boolean) => Promise<void>; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); title.current?.closest('aside')?.scrollTo(0, 0); }, [c.id]);
  return <aside id="character_details" className="details_panel" aria-labelledby="detail_name" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="panel_header"><div className="detail_identity"><Portrait id={c.id} name={c.name} variant="details" /><div><p className="eyebrow">Character dossier</p><h2 id="detail_name" tabIndex={-1} ref={title}>{c.name}</h2></div></div><div className="button_row"><button className={planning?.shortlisted ? 'shortlist_toggle selected' : 'shortlist_toggle'} disabled={pending} aria-pressed={planning?.shortlisted ?? false} onClick={() => void onToggleShortlist(!(planning?.shortlisted ?? false))}>{planning?.shortlisted ? '★ Shortlisted' : '☆ Add to shortlist'}</button><button aria-label="Close character details" onClick={onClose}>Close</button></div></div>
    <section><h3>Personal growths</h3><p className="hint">Personal level-up growth rates. Class modifiers are excluded.</p><dl className="stat_strip">{STATS.map(stat => <div key={stat}><dt>{STAT_HEADERS[stat]}</dt><dd>{c.growth_rates_percent[stat] ?? '—'}</dd></div>)}</dl>
      {c.effective_personal_growth_rates_percent && <><h4>With personal ability adjustment</h4><dl className="stat_strip">{STATS.map(stat => <div key={stat}><dt>{STAT_HEADERS[stat]}</dt><dd>{c.effective_personal_growth_rates_percent![stat] ?? '—'}</dd></div>)}</dl><p>{c.effective_growth_rates_note}</p></>}
    </section>
    <section><h3>Skill affinities</h3><p className="boons"><strong>Boons:</strong> {c.skill_proficiencies.boons === null ? 'Unknown' : c.skill_proficiencies.boons.length === 0 ? 'None listed' : c.skill_proficiencies.boons.map(s => <span className="affinity_chip" key={s}><SkillIcon skill={s} variant="boon" /> {skillLabel(s)}</span>)}</p><p className="banes"><strong>Banes:</strong> {c.skill_proficiencies.banes === null ? 'Unknown' : c.skill_proficiencies.banes.length === 0 ? 'None listed' : c.skill_proficiencies.banes.map(s => <span className="affinity_chip" key={s}><SkillIcon skill={s} variant="bane" /> {skillLabel(s)}</span>)}</p><p className="hint">These describe training, not weapon permissions.</p></section>
    <section><h3>Recruitment by route</h3><p className="hint">Reported availability does not confirm that you meet the conditions in your current playthrough.</p>{ROUTES.filter(r => isAvailable(c.recruitment_by_route[r].status)).map(r => {
      const recruitment = c.recruitment_by_route[r];
      return <article className={`route_details ${r === route ? 'current_route' : ''}`} key={r}><div className="route_heading"><h4>{ROUTE_NAMES[r]}{r === route ? ' · Current route' : ''}</h4><span className="route_status">{statusLabel(recruitment.status)}</span></div>
        <p className="recruitment_facts"><span>Chapter: <strong>{recruitment.earliest_chapter ?? 'Unknown'}</strong></span><span>Renown: <strong>{recruitment.min_renown ?? 'Unknown'}</strong></span><span>Support: <strong>{recruitment.min_support ?? 'Unknown'}</strong></span><span>Missable: <strong>{recruitment.missable === null ? 'Unknown' : recruitment.missable ? 'Yes' : 'No, as reported'}</strong></span></p>
        {recruitment.requirements.length > 0 && <><h5>Additional conditions</h5><ReadableValue value={recruitment.requirements} /></>}
        {Object.entries(recruitment).filter(([key]) => !['status','earliest_chapter','min_renown','min_support','missable','requirements','source'].includes(key)).map(([key, value]) => <div key={key}><strong>{skillLabel(key)}: </strong><ReadableValue value={value} /></div>)}
      </article>;
    })}</section>
    <section><h3>Personal abilities</h3>{c.personal_abilities.map((a, i) => <article className="ability" key={i}><h4><ActionIcon id={a.action_id} />{a.name} <small>{a.rank===null?'Rank unknown':`Rank ${a.rank}`}</small></h4><p>{a.effect ?? 'Effect unknown.'}</p><p className="hint">{skillLabel(a.acquisition.type)} · {a.acquisition.level === null ? 'Acquisition level unknown' : `Level ${a.acquisition.level}`}{a.upgrade_of ? ` · Upgrades ${a.upgrade_of}` : ''}</p></article>)}</section>
  </aside>;
}
