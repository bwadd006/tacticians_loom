import { portraitUrl } from './images';
import { ArtworkStub } from './artwork_stub';

export function Portrait({ id, name, variant }: { id: string; name: string; variant: 'table' | 'details' }) {
  const url = portraitUrl(id);
  if (url) {
    // In the table the adjacent name makes the image decorative; in details it is informative.
    return variant === 'table'
      ? <img className="portrait portrait_table" src={url} alt="" aria-hidden="true" />
      : <img className="portrait portrait_details" src={url} alt={`${name} portrait`} />;
  }
  return variant === 'table'
    ? <span className="portrait_stub" aria-hidden="true">{name.slice(0, 1)}</span>
    : <ArtworkStub label={`${name} portrait`} />;
}
