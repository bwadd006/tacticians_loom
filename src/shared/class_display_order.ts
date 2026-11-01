import { TIERS, type Tier } from './catalog';

// Presentation order reviewed at https://yuphastemple.com/classes/ on 2026-11-01.
// Preserve the maintained tiers: Noble follows Commoner in Unique (the site
// omits Noble), and Elephant Rider stays in Advanced at its observed position.
export const CLASS_DISPLAY_ORDER: Record<Tier, readonly string[]> = {
  unique: ['commoner', 'noble'],
  beginner: ['gladiator', 'hunter', 'soldier', 'ornius-rider', 'diviner'],
  specialty: [
    'myrmidon', 'brigand', 'pugilist', 'archer', 'rogue', 'armored-knight',
    'light-cavalry', 'charioteer', 'armored-ornius-rider', 'wing-soldier', 'shaman', 'priest',
  ],
  advanced: [
    'shido', 'dancer', 'warrior', 'blacksmith', 'sniper', 'forest-knight', 'ranger',
    'guardian', 'dreadnought', 'bardinger', 'cataphract', 'caladrius', 'elephant-rider',
    'dragoon', 'ovate', 'bishop', 'troubadour',
  ],
  master: [
    'swordmaster', 'high-savant', 'battlemaster', 'war-monk', 'bow-adept', 'bow-knight',
    'shadow-seeker', 'sentinel', 'castle-knight', 'orichaldia', 'great-knight',
    'celestial-trooper', 'bau-lord', 'druid', 'wiseman', 'valkyrium',
  ],
  divine: [
    'the-blade', 'the-apsara', 'the-eternal', 'the-godhand', 'the-calamity',
    'the-trident', 'the-cavalier', 'the-avatar',
  ],
};

const ranks = new Map(TIERS.flatMap(tier => CLASS_DISPLAY_ORDER[tier]).map((id, index) => [id, index]));
export function classDisplayRank(id: string): number | null { return ranks.get(id) ?? null; }
