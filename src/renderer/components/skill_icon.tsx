import { skillIconUrl, type AffinityVariant } from './images';
import { skillLabel } from '../../shared/library_setup';

export function SkillIcon({ skill, variant }: { skill: string; variant: AffinityVariant }) {
  const url = skillIconUrl(skill, variant);
  const label = `${skillLabel(skill)} ${variant}`;
  if (url) return <img className={`skill_icon skill_${variant}`} src={url} alt={label} title={label} />;
  // Keep a readable fallback for any future manifest gap or missing bundled file.
  return <span className={`skill_icon_fallback skill_${variant}`} role="img" aria-label={`${label}: icon not yet available`} title={`${label}: icon not yet available`}>{skillLabel(skill)}</span>;
}
