import { classIconUrl } from './images';
import { useState } from 'react';

export function ClassIcon({ id, name, variant }: { id: string; name: string; variant: 'table' | 'details' }) {
  const src = classIconUrl(id);
  const [failed,setFailed]=useState<string|null>(null);
  if (src&&src!==failed) return <img className={`class_icon class_icon_${variant}`} src={src} alt={`${name} class icon`} onError={()=>setFailed(src)} />;
  return <span className={`class_icon_stub class_icon_${variant}`} role="img" aria-label={`${name} class icon not available`}>{name.slice(0, 1)}</span>;
}
