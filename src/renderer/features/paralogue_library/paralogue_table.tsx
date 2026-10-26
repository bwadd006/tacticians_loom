import { ROUTES, ROUTE_NAMES, type Route } from '../../../shared/catalog';
import type { Paralogue } from '../../../shared/source_models';
import { formatAcceptanceWindow, formatGameDate } from '../../../shared/paralogue_library_query';
import { paralogueFieldLabel, paralogueRouteSortField, type ParalogueLibrarySetup } from '../../../shared/paralogue_library_setup';

function routeRequirements(paralogue: Paralogue, route: Route) {
  return paralogue.requirements.filter(requirement => requirement.route_ids.includes(route));
}

function RouteSummary({ paralogue, route }: { paralogue: Paralogue; route: Route }) {
  const availability = paralogue.route_availability[route];
  if (availability.status === 'unavailable') return <span className="route_state unavailable">Unavailable</span>;
  if (availability.status === 'unknown') return <span className="route_state unknown">Unknown / not verified</span>;
  const deadline = availability.effective_completion_deadline ?? availability.listed_completion_deadline;
  const requirements = routeRequirements(paralogue, route);
  return <div className="paralogue_route_summary">
    <strong className="route_state available">Available{availability.verification_status === 'conflicting' || availability.verification_status === 'unknown' ? ' ?' : ''}</strong>
    <span><b>Chapter:</b> {availability.earliest_chapter ?? 'Unknown'}</span>
    <span><b>Accept:</b> {availability.acceptance_windows.length ? availability.acceptance_windows.map(formatAcceptanceWindow).join(', ') : 'Unknown'}</span>
    <span><b>Deadline:</b> {formatGameDate(deadline)}</span>
    {availability.forced_start_date && <span><b>Forced start:</b> {formatGameDate(availability.forced_start_date)}</span>}
    {requirements.length > 0 && <span className="requirement_summary"><b>Requires:</b> {requirements.map(value => value.text).join('; ')}</span>}
  </div>;
}

export function ParalogueTable({ paralogues, setup, selectedId, onSelect, onSort }: {
  paralogues: Paralogue[]; setup: ParalogueLibrarySetup; selectedId: string | null;
  onSelect: (id: string, target: HTMLButtonElement) => void; onSort: (field: string) => void;
}) {
  function heading(field: string, text: string, className?: string) {
    const index = setup.sorts.findIndex(rule => rule.field === field), sort = setup.sorts[index];
    return <th scope="col" className={className} aria-sort={index === 0 ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>
      <button onClick={() => onSort(field)} aria-label={`Sort by ${paralogueFieldLabel(field)}`}>{text}{index >= 0 && <small> {sort.direction === 'asc' ? '↑' : '↓'}{index + 1}</small>}</button>
    </th>;
  }
  return <div className="paralogue_table_scroll" role="region" aria-label="Paralogue results, scroll for all routes" tabIndex={0}>
    <table className="paralogue_table"><thead><tr>
      {heading('name', 'Paralogue', 'paralogue_name_cell')}
      {ROUTES.map(route => <th scope="col" className="paralogue_route_heading" key={route}>
        <button className="route_title" onClick={() => onSort(paralogueRouteSortField(route, 'status'))} aria-label={`Sort by ${ROUTE_NAMES[route]} Availability`}>{ROUTE_NAMES[route]}</button>
        <span className="paralogue_sort_shortcuts">
          <button onClick={() => onSort(paralogueRouteSortField(route, 'chapter'))} aria-label={`Sort by ${ROUTE_NAMES[route]} Chapter`}>Ch</button>
          <button onClick={() => onSort(paralogueRouteSortField(route, 'open'))} aria-label={`Sort by ${ROUTE_NAMES[route]} Opening date`}>Open</button>
          <button onClick={() => onSort(paralogueRouteSortField(route, 'deadline'))} aria-label={`Sort by ${ROUTE_NAMES[route]} Deadline`}>End</button>
        </span>
      </th>)}
    </tr></thead><tbody>{paralogues.map(paralogue => <tr key={paralogue.id} data-paralogue-id={paralogue.id} className={selectedId === paralogue.id ? 'selected' : ''}>
      <th scope="row" className="paralogue_name_cell"><button className="paralogue_name" aria-expanded={selectedId === paralogue.id} aria-controls={selectedId === paralogue.id ? 'paralogue_details' : undefined} onClick={event => onSelect(paralogue.id, event.currentTarget)}><strong>{paralogue.name}</strong><span>{paralogue.associated_character_name}</span></button></th>
      {ROUTES.map(route => <td className="paralogue_route_cell" key={route}><RouteSummary paralogue={paralogue} route={route} /></td>)}
    </tr>)}</tbody></table>
  </div>;
}
