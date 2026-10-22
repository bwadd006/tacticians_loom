import { useEffect, useRef, useState } from 'react';
import { ROUTES, ROUTE_NAMES, STATS, type RouteContext } from '../../../shared/catalog';
import type { Character } from '../../../shared/source_models';
import type { ReferenceConflict } from '../../../shared/api';
import { skillLabel, STAT_HEADERS } from '../../../shared/library_setup';
import { statusLabel } from '../../../shared/library_query';
import { Portrait } from '../../components/portrait';
import { SkillIcon } from '../../components/skill_icon';

function ReadableValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">Unknown</span>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((v, i) => <li key={i}><ReadableValue value={v} /></li>)}</ul> : <span>None listed</span>;
  if (typeof value === 'object') return <dl className="fact_list">{Object.entries(value).map(([key, v]) => <div key={key}><dt>{skillLabel(key)}</dt><dd><ReadableValue value={v} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}
function Source({ url }: { url: string | null }) {
  const [message, setMessage] = useState('');
  return url ? <div className="source"><span>{url}</span><button className="quiet" onClick={() => { navigator.clipboard.writeText(url).then(() => setMessage('Copied')).catch(() => setMessage('Could not copy; select the address above.')); }}>Copy source URL</button><small role="status">{message}</small></div> : <p className="hint">Source unknown.</p>;
}
export function CharacterDetails({ character: c, route, conflicts, onClose }: { character: Character; route: RouteContext; conflicts: ReferenceConflict[]; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); title.current?.closest('aside')?.scrollTo(0, 0); }, [c.id]);
  return <aside id="character_details" className="details_panel" aria-labelledby="detail_name" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="panel_header"><div className="detail_identity"><Portrait id={c.id} name={c.name} variant="details" /><div><p className="eyebrow">Character dossier</p><h2 id="detail_name" tabIndex={-1} ref={title}>{c.name}</h2></div></div><button aria-label="Close character details" onClick={onClose}>Close</button></div>
    <section><h3>Personal growths</h3><p className="hint">Personal level-up growth rates. Class modifiers are excluded.</p><dl className="stat_strip">{STATS.map(stat => <div key={stat}><dt>{STAT_HEADERS[stat]}</dt><dd>{c.growth_rates_percent[stat] ?? '—'}</dd></div>)}</dl>
      {c.effective_personal_growth_rates_percent && <><h4>With personal ability adjustment</h4><dl className="stat_strip">{STATS.map(stat => <div key={stat}><dt>{STAT_HEADERS[stat]}</dt><dd>{c.effective_personal_growth_rates_percent![stat] ?? '—'}</dd></div>)}</dl><p>{c.effective_growth_rates_note}</p></>}
      <Source url={c.growth_rates_source} />
    </section>
    <section><h3>Skill affinities</h3><p className="boons"><strong>Boons:</strong> {c.skill_proficiencies.boons === null ? 'Unknown' : c.skill_proficiencies.boons.length === 0 ? 'None listed' : c.skill_proficiencies.boons.map(s => <span className="affinity_chip" key={s}><SkillIcon skill={s} variant="boon" /> {skillLabel(s)}</span>)}</p><p className="banes"><strong>Banes:</strong> {c.skill_proficiencies.banes === null ? 'Unknown' : c.skill_proficiencies.banes.length === 0 ? 'None listed' : c.skill_proficiencies.banes.map(s => <span className="affinity_chip" key={s}><SkillIcon skill={s} variant="bane" /> {skillLabel(s)}</span>)}</p><p className="hint">{c.skill_proficiencies.verified ? 'Marked verified in the supplied dataset.' : 'Not verified in the supplied dataset.'} These describe training, not weapon permissions.</p><Source url={c.skill_proficiencies.source} /></section>
    <section><h3>Personal abilities</h3>{c.personal_abilities.map((a, i) => <article className="ability" key={i}><h4>{a.name} <small>Rank {a.rank}</small></h4><p>{a.effect ?? 'Effect unknown.'}</p><p className="hint">{skillLabel(a.acquisition.type)} · {a.acquisition.level === null ? 'Acquisition level unknown' : `Level ${a.acquisition.level}`}{a.upgrade_of ? ` · Upgrades ${a.upgrade_of}` : ''}</p><Source url={a.source} /></article>)}</section>
    <section><h3>Recruitment by route</h3><p className="hint">Reported availability does not confirm that you meet the conditions in your current playthrough.</p>{ROUTES.map(r => {
      const recruitment = c.recruitment_by_route[r];
      return <article className={`route_details ${r === route ? 'current_route' : ''}`} key={r}><h4>{ROUTE_NAMES[r]}{r === route ? ' · Current route' : ''}</h4><p>{statusLabel(recruitment.status)}</p>
        <dl className="fact_list"><div><dt>Earliest chapter</dt><dd>{recruitment.earliest_chapter ?? 'Unknown'}</dd></div><div><dt>Renown</dt><dd>{recruitment.min_renown ?? 'Unknown'}</dd></div><div><dt>Support</dt><dd>{recruitment.min_support ?? 'Unknown'}</dd></div><div><dt>Missable</dt><dd>{recruitment.missable === null ? 'Unknown' : recruitment.missable ? 'Yes' : 'No, as reported'}</dd></div></dl>
        {recruitment.requirements.length ? <><h5>Additional conditions</h5><ReadableValue value={recruitment.requirements} /></> : <p className="hint">No additional conditions listed; this does not establish unrestricted recruitment.</p>}
        {Object.entries(recruitment).filter(([key]) => !['status','earliest_chapter','min_renown','min_support','missable','requirements','source'].includes(key)).map(([key, value]) => <div key={key}><strong>{skillLabel(key)}: </strong><ReadableValue value={value} /></div>)}
        <Source url={recruitment.source} />
      </article>;
    })}</section>
    <section><h3>Starting information</h3><dl className="fact_list"><div><dt>Level</dt><dd>{c.starting_level ?? 'Unknown'}</dd></div><div><dt>Class</dt><dd>{c.starting_class ?? 'Unknown'}</dd></div><div><dt>Base stats</dt><dd><ReadableValue value={c.base_stats} /></dd></div></dl><p className="hint">{c.base_stats_note}</p></section>
    <section><h3>Source conflicts & notes</h3>{conflicts.length ? conflicts.map((conflict, index) => <article className="conflict" key={index}><h4>{conflict.field.split('.').map(skillLabel).join(' → ')}</h4><ReadableValue value={Object.fromEntries(Object.entries(conflict).filter(([key]) => !['character_id','field'].includes(key)))} /></article>) : <p className="hint">No conflicts recorded for this character. This does not establish completeness.</p>}{c.notes.map((note, i) => <p key={i}>{note}</p>)}<p className="hint">Source data is provisional. An unknown value is not zero or a confirmed absence.</p></section>
  </aside>;
}
