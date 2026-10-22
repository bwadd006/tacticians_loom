import manifest from '../../../resources/asset_manifest.json';

interface WebpackContext { keys(): string[]; (id: string): string }
// Webpack require.context bundles every image in a resources directory as an
// asset module, so the packaged app displays them offline without hotlinking.
// Webpack only recognizes direct require.context calls with literal arguments;
// after ts-loader strips the casts, these are exactly that.
interface RequireWithContext { context(dir: string, sub: boolean, pattern: RegExp): WebpackContext }
function toMap(context: WebpackContext): Map<string, string> {
  return new Map(context.keys().map(key => [key.replace(/^\.\//, '').replace(/\.(webp|png)$/, ''), context(key)]));
}
const portraits = toMap((require as unknown as RequireWithContext).context('../../../resources/portraits', false, /\.(webp|png)$/));
const classIcons = toMap((require as unknown as RequireWithContext).context('../../../resources/class_icons', false, /\.(webp|png)$/));
const skillIcons = toMap((require as unknown as RequireWithContext).context('../../../resources/skill_icons', false, /\.(webp|png)$/));
const characterArt = manifest.characters as Record<string, { portrait?: string; source?: string }>;
const classArt = manifest.classes as Record<string, { icon?: string; source?: string }>;
const skillArt = manifest.skills as Record<string, { neutral?: string; boon?: string; bane?: string; source?: string }>;

export function portraitUrl(characterId: string): string | null {
  const key = characterArt[characterId]?.portrait;
  return key ? portraits.get(key) ?? null : null;
}
export function classIconUrl(classId: string): string | null {
  const key = classArt[classId]?.icon;
  return key ? classIcons.get(key) ?? null : null;
}
export type AffinityVariant = 'boon' | 'bane' | 'neutral';
export function skillIconUrl(skillId: string, variant: AffinityVariant): string | null {
  const key = skillArt[skillId]?.[variant];
  return key ? skillIcons.get(key) ?? null : null;
}
