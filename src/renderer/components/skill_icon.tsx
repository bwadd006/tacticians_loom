import { skillIconUrl, type AffinityVariant } from './images';
import { skillLabel } from '../../shared/library_setup';
import { useState } from 'react';

export function SkillIcon({ skill, variant }: { skill: string; variant: AffinityVariant }) {
  const url = skillIconUrl(skill, variant);
  const label = `${skillLabel(skill)} ${variant}`;
  const [failed,setFailed]=useState<string|null>(null);
  if (url&&url!==failed) return <img className={`skill_icon skill_${variant}`} src={url} alt={label} title={label} onError={()=>setFailed(url)} />;
  // Keep a readable fallback for any future manifest gap or missing bundled file.
  return <span className={`skill_icon_fallback skill_${variant}`} role="img" aria-label={`${label}: icon not yet available`} title={`${label}: icon not yet available`}>{skillLabel(skill)}</span>;
}
