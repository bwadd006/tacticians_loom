# Change log

User-facing changes to Tactician's Loom. Add new entries under **Unreleased**,
then group them by application version and release date when a release is made.
Keep entries focused on features, fixes, data updates, and save compatibility.

## Unreleased

Entries started October 30, 2026. The application version remains `0.1.0`.

### Added

- Dedicated Map page covering the four Part I routes and Part III, with all
  309 documented locations across those views, local map tiles and marker art,
  category filters, pan/zoom, and keyboard navigation.
- Search for locations, regions, items, mounts, and battalions; content searches
  show distinct destinations and retain exact weapon variants. Location panels
  show context-specific chests, gatherables, shops, mounts, farming options, and
  battalions, with focused item/mount/battalion reference dialogs.
- Automatic restoration of map context, viewport, category filters, committed
  search, and location selection, with separate search/filter/view resets and
  Reset All Map. Missing information remains explicit; Part III does not imply
  any particular route or add completion tracking.
- Character Profile as the opening page, with a searchable portrait picker for
  all 63 characters, a persistent summary, and Arts & Abilities, Recruitment,
  Liked Gifts, Bird Time, and Supports tabs.
- Full character learnsets, scoped recruitment, starting-stat observations,
  crests and Blaze information, linked action/item details, and support-partner
  navigation. Missing information remains explicit.
- Automatic restoration of the last viewed character, with Alexandra selected
  alphabetically on a fresh installation. Profile notes and shortlist membership
  share the existing player records.
- This change log, linked from the application README.
- Expanded local reference data covering learnsets, abilities, spells, supports,
  Bird Time, preferences, items, acquisition sources, mounts, and map records.
- Bundled portraits, thumbnails, class and action icons, and map artwork, with
  readable fallbacks and explicit missing or derived artwork information.

### Changed

- Development packaging can use a matching local Electron archive through
  `LOOM_ELECTRON_ZIP_DIR`, allowing packaging without an Electron download.
- Character bloodmarks and crests display bundled icons and open detailed popups
  with reported effects, dragon associations, and documented bearers. All 15
  records are retained; unavailable effects and the two missing icons stay explicit.
- Enlarged learner portraits and grade badges in action popups, using full-size
  artwork and fewer portraits per row for readability.
- Clicking an ability, combat art, spell, or Blaze action opens a compact popup
  with its stats, effects, reported upgrades, acquisition details, related items,
  and learner portraits. Closing returns to the same profile position.
- Profile learnsets omit the shared Lv. 1–5 skill abilities while retaining Faire
  abilities and other documented learning. The reference data remains complete.
- Character skill learnsets group combat arts before abilities, retaining grade
  order within each action type. Magic lists keep spells distinct from abilities.
- Updated the reference dataset to `2026.10.30.2`, retaining source citations,
  conflicting evidence, and unknown values.
- Preserved distinctions between personal and class growths, training and weapon
  access, and inherent abilities and mastery rewards.
- Reduced the bundled database size while preserving current reference facts.

### Fixed

- Map marker artwork and clickable areas now grow with zoom and stay over their
  underlying tile symbols. Partially visible enlarged markers remain clickable.
- Updated TypeScript module resolution to remove the deprecated Node10 setting
  reported by newer editor TypeScript versions, and declared renderer stylesheet
  imports for TypeScript 6 compatibility.
- Widened the character picker to show about six portraits per row on desktop,
  with fewer columns on narrower windows.
- `npm start` now uses the existing reference database instead of rebuilding it
  on every launch. Initial setup and reference-data changes use an explicit build.
- Missing development reference data now produces an actionable build instruction.
- Added portraits for Klapka and class icons for Commoner and Noble.

### Compatibility

- Player schema 6 adds an independent map browsing preference while preserving
  earlier notes, shortlist membership, library setups, profile selection, and
  unresolved saved IDs. Reference schema 3 and dataset `2026.10.30.2` are unchanged.
- Existing shortlist membership, character notes, and saved library setups retain
  their stable IDs. The earlier schema-5 migration stores the last viewed
  character and remains intact in schema 6.
- Current planning workflows remain focused on Act 1 across Cai, Dietrich,
  Theodora, and Leda. Expanded reference data does not add later-part planning.

## Existing 0.1.0 baseline

Recorded October 30, 2026; this documents the existing application rather than
announcing a new release.

- Standalone offline desktop application with a responsive deep-dark interface.
- Character Library with growths, affinities, abilities, four-route recruitment,
  filters, ordered sorting, dossiers, and saved browsing setups.
- Class Library covering all 60 classes, with tier groups, training, certification,
  growths, mastery, unlock evidence, and a saved browsing setup.
- Persistent shortlist and character notes, plus session comparisons without
  automatic scoring or team selection.
- Paralogue Library covering nine Act 1 paralogues, with route availability,
  timing evidence, requirements, outcomes, filters, sorting, and a saved setup.
- Player saves stored separately from the read-only reference database.
