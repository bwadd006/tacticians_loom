import { useEffect, useRef } from 'react';
import { ROUTES, ROUTE_NAMES } from '../../../shared/catalog';
import type { ParalogueLibraryData } from '../../../shared/api';
import type { Character, CharacterClass, Paralogue } from '../../../shared/source_models';
import { formatAcceptanceWindow, formatGameDate } from '../../../shared/paralogue_library_query';
import { skillLabel } from '../../../shared/library_setup';
import { Portrait } from '../../components/portrait';
import { ClassIcon } from '../../components/class_icon';

function verification(value: string) { return value === 'confirmed' ? null : <span className="verification">{skillLabel(value)}</span>; }
function routeNames(routes: readonly string[]) { return routes.map(route => ROUTE_NAMES[route as keyof typeof ROUTE_NAMES]).join(', '); }

export function ParalogueDetails({ paralogue, data, characters, classes, onClose }: {
  paralogue: Paralogue; data: ParalogueLibraryData; characters: Character[]; classes: CharacterClass[]; onClose: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const owner = characters.find(character => character.id === paralogue.associated_character_id);
  const conflicts = data.conflicts.filter(conflict => conflict.paralogueId === paralogue.id);
  useEffect(() => { title.current?.focus({ preventScroll: true }); title.current?.closest('aside')?.scrollTo(0, 0); }, [paralogue.id]);
  return <aside id="paralogue_details" className="details_panel paralogue_details" aria-labelledby="paralogue_detail_name" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className="panel_header"><div className="detail_identity">{owner && <Portrait id={owner.id} name={owner.name} variant="details" />}<div><p className="eyebrow">{paralogue.associated_character_name} paralogue</p><h2 id="paralogue_detail_name" tabIndex={-1} ref={title}>{paralogue.name}</h2></div></div><button aria-label="Close paralogue details" onClick={onClose}>Close</button></div>
    <section><h3>Availability by route</h3>{ROUTES.map(route => {
      const availability = paralogue.route_availability[route];
      return <article className="paralogue_route_card" key={route}><div className="route_heading"><h4>{ROUTE_NAMES[route]}</h4><span className={`route_status ${availability.status}`}>{skillLabel(availability.status)} {verification(availability.verification_status)}</span></div>
        {availability.status === 'available' ? <dl className="detail_facts">
          <div><dt>Earliest chapter</dt><dd>{availability.earliest_chapter ?? 'Unknown'}</dd></div>
          <div className="wide_fact"><dt>Acceptance window{availability.acceptance_windows.length === 1 ? '' : 's'}</dt><dd>{availability.acceptance_windows.length ? <ul>{availability.acceptance_windows.map((window, index) => <li key={index}>{formatAcceptanceWindow(window)}{window.note ? ` — ${window.note}` : ''}</li>)}</ul> : 'Unknown'}</dd></div>
          <div><dt>Listed deadline</dt><dd>{formatGameDate(availability.listed_completion_deadline)}</dd></div>
          <div><dt>Effective deadline</dt><dd>{formatGameDate(availability.effective_completion_deadline)}</dd></div>
          <div><dt>Forced start</dt><dd>{availability.forced_start_date ? formatGameDate(availability.forced_start_date) : 'None documented'}</dd></div>
          <div><dt>Missable</dt><dd>{availability.missable === null ? 'Unknown' : availability.missable ? 'Yes' : 'No'}</dd></div>
          {Boolean(availability.reported_timing?.length) && <div className="wide_fact"><dt>Reported timing</dt><dd><ul>{availability.reported_timing?.map((time,index) => <li key={index}>{time.text} — {skillLabel(time.role)} ({skillLabel(time.semantics)})</li>)}</ul></dd></div>}<div className="wide_fact"><dt>Trigger</dt><dd>{availability.trigger ?? 'Not documented'}</dd></div>
        </dl> : <p>{availability.status === 'unavailable' ? 'Not available on this route.' : 'Availability has not been verified for this route.'}</p>}
      </article>;
    })}</section>
    <section><h3>Requirements and participants</h3>{paralogue.requirements.length ? paralogue.requirements.map((requirement, index) => {
      const character = characters.find(value => value.id === requirement.character_id);
      return <article className="linked_fact" key={index}>{character && <Portrait id={character.id} name={character.name} variant="table" />}<div><h4>{skillLabel(requirement.type)}</h4><p>{requirement.text}</p><small>{routeNames(requirement.route_ids)} {verification(requirement.verification_status)}</small>{requirement.character_id && !character && <p className="warning">Linked character is unavailable in this dataset.</p>}</div></article>;
    }) : <p className="muted">No additional requirement is documented; this does not prove none exists.</p>}</section>
    <section><h3>Notable outcomes</h3>{paralogue.outcomes.length ? paralogue.outcomes.map((outcome, index) => {
      const character = characters.find(value => value.id === outcome.character_id), characterClass = classes.find(value => value.id === outcome.class_id);
      return <article className="linked_fact" key={index}>{character && <Portrait id={character.id} name={character.name} variant="table" />}{characterClass && <ClassIcon id={characterClass.id} name={characterClass.name} variant="table" />}<div><h4>{outcome.name}{outcome.quantity && outcome.quantity > 1 ? ` × ${outcome.quantity}` : ''}</h4><p>{outcome.text}</p><small>{skillLabel(outcome.type)} · {routeNames(outcome.route_ids)} {verification(outcome.verification_status)}</small>{outcome.condition && <p><strong>Condition:</strong> {outcome.condition}</p>}{((outcome.character_id && !character) || (outcome.class_id && !characterClass)) && <p className="warning">A linked record is unavailable in this dataset.</p>}</div></article>;
    }) : <p className="muted">No notable outcomes documented.</p>}</section>
    {(conflicts.length > 0 || paralogue.verification_status !== 'confirmed') && <section className="data_notice"><h3>Data notice</h3><p>Some displayed facts remain reported, incomplete, or conflicting.</p>{conflicts.length > 0 && <ul>{conflicts.map((conflict, index) => <li key={index}>{conflict.routeId ? `${ROUTE_NAMES[conflict.routeId]}: ` : ''}{skillLabel(conflict.field.split('.').at(-1) ?? conflict.field)} has conflicting reports.</li>)}</ul>}</section>}
  </aside>;
}
