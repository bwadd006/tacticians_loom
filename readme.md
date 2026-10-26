# Tactician's Loom

Standalone Electron/React/TypeScript desktop application. The reference-data
foundation, Character Library, Class Library, Shortlist & Compare workspace,
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

The current interface uses desktop navigation among all four planning views and a
responsive deep-dark layout with a 16-pixel text
baseline and enlarged local artwork. Its table always ends with recruitment for
Cai, Dietrich, Theodora, and Leda. Recruitable/tutorial entries show Chapter,
Renown, Support, and additional requirements; automatic joins show only their
join chapter. The dossier includes recruitment only on documented available
routes. Provenance, conflict records, notes, and starting information remain in
the maintained data for updates but are intentionally absent from the app UI.

## Develop

Use Node.js 24 or newer and npm. From this directory:

```sh
npm ci
npm start
```

`npm start` validates and builds the local reference database before opening the
desktop window. It does not open an external browser. Run commands from this app
directory, not the outer design workspace.

The lockfile pins dependencies. Forge uses a pinned Electron `node-gyp` Git
dependency, declared directly to work with npm 12's `allow-git=root` setting.
The package script policy permits Electron/esbuild setup and skips rebuilding
`better-sqlite3` 13, which supplies native prebuilds. No global npm settings are
required. Initial dependency installation needs network access; the packaged
application works offline.

## Check and package

```sh
npm run check
npm run data:build
npm run data:validate
npm run package
npm run make
```

`package` creates a platform application directory under `out/`; `make` creates a
ZIP. Both run checks and rebuild the reference data. Linux is the initial target.
Run packaging and runtime checks on Windows before distributing a Windows build.
Installer formats and automatic updates are deferred.

The executable accepts `--smoke-test` to exercise the packaged renderer, preload,
IPC, all libraries' reference queries, saved-setup and shortlist/note round
trips, comparison rendering, bundled-image loading,
print `SMOKE_PASSED` and exit. A graphical desktop is normally required; a CI
environment may supply a virtual display.

## Data and boundaries

- Edit the reviewed JSON in `data/source/`, never the generated SQLite database.
- Run `npm run data:audit` before and after a review batch to inspect the
  validated completeness baseline and coverage delta.
- Update `data/dataset_manifest.json` for a changed dataset, then rebuild.
- `data:build` reports entity changes and replaces the previous database only
  after candidate validation succeeds.
- Unknown values and source disagreements are retained; an import check does
  not verify the underlying game claims.
- `resources/asset_manifest.json` maps character/class/skill IDs to the
  bundled portraits, class icons, and skill affinity icons with source
  attribution. Ability maps remain empty until their artwork is sourced;
  unmapped IDs use stub fallbacks, and four bane icons are locally derived
  recreations marked `derived_composite` in the manifest. Artwork is
  © Nintendo / Intelligent Systems / Koei Tecmo and is bundled for this
  private, non-distributed app only.
- Runtime reference access is read-only. Player saves (library setups,
  shortlist membership, and notes) use a separate `user_data.sqlite` in the
  operating system's application-data directory. Active comparison selection
  and open detail-panel selection are session-only. Paralogue progress is not
  tracked.

Design documents and agent instructions live outside this application directory.

## Roadmap

The recommended next feature is the cross-route recruitment planner. Later
phases are:

1. Cross-route recruitment planning.
2. Saved route team building with optional roles, classes, and notes.
3. Coverage, overlap, and player-directed swap comparison.
4. Windows validation, migrations, export/import, and release hardening.

These are planned phases, not implemented features. Act 2 mechanics, repeated
route history, automatic team optimization, combat simulation, cloud sync, and
automatic data updates remain separate deferred work.
