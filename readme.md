# Tactician's Loom

See the [change log](change_log.md) for features, fixes, data updates, and save
compatibility notes.

Standalone Electron/React/TypeScript desktop application. The opening Character
Profile covers all 63 maintained characters with a searchable portrait picker,
a persistent summary and five tabs: Arts & Abilities, Recruitment, Liked Gifts,
Bird Time and Supports. It restores the last viewed character, shares shortlist
membership and notes, and preserves unknown starting/stat/story information.
The picker shows about six portraits per row at desktop widths. Class preview
remains a deferred stretch goal. The Character Library retains its existing
Act 1 scope and behavior.

Click an ability, combat art, spell or Blaze action to open a detail popup with
reported stats, effects, upgrades, acquisition requirements and large learner
portraits. Skill lists group combat arts before abilities and hide shared
Lv. 1–5 skill abilities while retaining Faire abilities; the underlying reference
records remain complete. Bloodmarks and crests show local icons and open popups
with effects, dragon associations and documented bearers. The maintained catalog
contains all 15 crests and 80 bearer associations. Temperance and Entirety have
no reported effects or available icons in the reviewed source and use explicit
fallbacks. Close a popup or press Escape to return to the same profile position.

The reference-data foundation, Character Library, Class Library, Shortlist & Compare workspace,
and Paralogue Library are implemented. The Character Library provides its route selector, growth
table, filters, prioritized sorting,
details panel and saved per-route setups. Its ordered controls can sort by
Chapter, Renown, or Support independently for every route even in All Routes,
while the table retains one combined recruitment column per route. Ch, R, and
S header buttons provide direct sorting. Successive column clicks append sort
priorities in click order, while clicking an active column reverses its direction.
The Class Library provides one all-class table with tier title rows, class dossiers,
filters, ordered sorting, unlock evidence, and one global saved setup.
The shared shortlist adds immediate persistent membership, retained global
notes, a temporary Character Library shortlist scope, a sortable compact list,
and an unlimited session comparison with focus fields, collapsible evidence,
route focus, and accessible column reordering. It compares growths, affinities,
personal abilities, and four-route recruitment facts without scoring candidates.
The Paralogue Library compares all nine reviewed Act 1 paralogues in permanent
Cai, Dietrich, Theodora, and Leda columns, including chapters, disjoint
acceptance windows, deadlines, forced starts, and requirements. Its detail panel
shows full route facts, linked records, notable outcomes, and visible conflicts;
one global browsing setup is saved without completion or shortlist state.
Portraits and skill affinity icons are bundled game artwork (see the asset
manifest for attribution and the few documented gaps and derived recreations).

The current interface uses desktop navigation among Character Profile and the
four existing planning views, with a
responsive deep-dark layout with a 16-pixel text
baseline and enlarged local artwork. Its table always ends with recruitment for
Cai, Dietrich, Theodora, and Leda. Recruitable/tutorial entries show Chapter,
Renown, Support, and additional requirements; automatic joins show only their
join chapter. The dossier includes recruitment only on documented available
routes. The Character Library dossier hides maintenance provenance, conflict
records, general source notes and starting information. Character Profile shows
the fuller reported starting observations separately, and player-authored notes
remain available in the profile and shortlist.

## Develop

Use Node.js 24 or newer and npm. Run from this directory:

```sh
npm ci
npm run data:build
npm start
```

Build the reference database once after setup and explicitly after changing maintained
reference data. `npm start` compiles the application and opens its desktop window
using the existing database. Restarting does not rebuild data or contact sources.

## Maintained data

Current application version: `0.1.0`; dataset `2026.10.30.2`; reference schema 3;
player schema 5. The player migration adds the last-viewed character preference
while preserving existing library setups, shortlist membership, notes and
unresolved stable IDs.

`data/source/` contains the complete maintained reference records, their source
citations, uncertainty states, and retained conflicting evidence. Stable character,
class, and paralogue IDs preserve saved player choices. `data/dataset_manifest.json`
records the dataset version and input hashes. Update those hashes and the dataset
version when changing maintained inputs. `resources/asset_manifest.json` maps local
artwork to stable IDs and records attribution, missing assets, and derived artwork.

The build consumes these local files only. It does not require source websites,
external maintenance tools, captured website files, or old database builds.
The generated read-only reference database contains current records, citations,
and compact validation metadata. Player saves remain in the operating system's
application-data directory and are never opened by the data builder.

## Validate and package

```sh
npm run check
npm run data:validate
npm run assets:validate
npm run release:validate
npm run package
```

`check` runs TypeScript, automated tests, and the application distribution boundary
check. Build reference data before running tests on a fresh checkout. `package`
and `make` build and validate reference data explicitly before packaging. Packaged
users need no Node.js, npm, database tools, or network connection.

Release validation checks application relationships and isolated player-save
fixtures. Linux packages are tested locally; Windows packaging/runtime validation
remains pending.

## Source distribution

Only application code, maintained data, bundled artwork, build configuration, and
functional tests belong in this repository. The distribution check rejects private
maintenance directories, acquisition tools, and embedded original document bodies.
It also runs before Forge packaging.

To prepare a source tree without any existing Git history or generated files:

```sh
npm run source:export -- --output /path/to/new_directory
```

The destination must be new and outside this application directory. The export is
suitable for review before creating a fresh repository. Deleting files in a working
tree does not erase them from existing Git history.

## Sources and artwork

Reference information credits [Yu Phas' Temple](https://yuphastemple.com/).
Additional sources remain attached to individual facts and retained evidence.
Portrait provenance includes the Fortune's Weave Support Browser and Fire Emblem
Wiki; skill-affinity artwork includes Fire Emblem Wiki assets. Exact source URLs
and attribution are retained in the asset manifest. Four missing bane variants are
marked as locally derived composites, and missing source artwork remains explicit.

Game artwork © Nintendo / Intelligent Systems / Koei Tecmo. No artwork license or
authentic-rip status is asserted. This remains a private, non-distributed project.
