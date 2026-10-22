import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { SKILLS } from '../src/shared/catalog';

const appRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'resources/asset_manifest.json'), 'utf8')) as {
  schema_version: number;
  sources: Record<string, { name: string; url: string }>;
  characters: Record<string, { portrait: string; source: string }>;
  classes: Record<string, { icon: string; source: string }>;
  skills: Record<string, { neutral?: string; boon?: string; bane?: string; source: string; bane_source?: string }>;
  abilities: Record<string, unknown>;
};
const characterIds = new Set((JSON.parse(fs.readFileSync(path.join(appRoot, 'data/source/fire_emblem_fortunes_weave_characters.json'), 'utf8')) as { characters: { id: string }[] }).characters.map(c => c.id));
const classIds = new Set((JSON.parse(fs.readFileSync(path.join(appRoot, 'data/source/fire_emblem_fortunes_weave_classes.json'), 'utf8')) as { classes: { id: string }[] }).classes.map(c => c.id));
const portraitDir = path.join(appRoot, 'resources/portraits');
const iconDir = path.join(appRoot, 'resources/class_icons');
const skillIconDir = path.join(appRoot, 'resources/skill_icons');
// Deliberate gaps documented in design_docs/artwork_assets_design.md.
const CHARACTER_GAPS = ['klapka'];
const CLASS_GAPS = ['commoner', 'noble'];
// Bane variants unavailable as rips; these are derived recreations pending official art.
const DERIVED_BANE = ['authority', 'gauntlets', 'infantry', 'spears'];

function magic(file: string): Buffer {
  const handle = fs.openSync(file, 'r');
  const header = Buffer.alloc(12);
  fs.readSync(handle, header, 0, 12, 0);
  fs.closeSync(handle);
  return header;
}
function isWebp(header: Buffer): boolean { return header.subarray(0, 4).toString('latin1') === 'RIFF' && header.subarray(8, 12).toString('latin1') === 'WEBP'; }
function isPng(header: Buffer): boolean { return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); }

test('manifest maps only real IDs to real attributed image files', () => {
  assert.equal(manifest.schema_version, 1);
  for (const [id, entry] of Object.entries(manifest.characters)) {
    assert.ok(characterIds.has(id), `unknown character ID: ${id}`);
    assert.ok(manifest.sources[entry.source], `unknown source for ${id}`);
    const file = path.join(portraitDir, `${entry.portrait}.webp`);
    assert.ok(fs.existsSync(file), `missing portrait file for ${id}`);
    assert.ok(isWebp(magic(file)), `portrait is not WebP: ${id}`);
    assert.ok(fs.statSync(file).size > 100, `portrait suspiciously small: ${id}`);
  }
  for (const [id, entry] of Object.entries(manifest.classes)) {
    assert.ok(classIds.has(id), `unknown class ID: ${id}`);
    assert.ok(manifest.sources[entry.source], `unknown source for ${id}`);
    const file = path.join(iconDir, `${entry.icon}.png`);
    assert.ok(fs.existsSync(file), `missing class icon file for ${id}`);
    assert.ok(isPng(magic(file)), `class icon is not PNG: ${id}`);
    assert.ok(fs.statSync(file).size > 100, `class icon suspiciously small: ${id}`);
  }
});

test('every bundled image file is referenced and only documented gaps are unmapped', () => {
  const referencedPortraits = new Set(Object.values(manifest.characters).map(e => e.portrait));
  const referencedIcons = new Set(Object.values(manifest.classes).map(e => e.icon));
  for (const file of fs.readdirSync(portraitDir)) assert.ok(referencedPortraits.has(file.replace(/\.webp$/, '')), `unreferenced portrait file: ${file}`);
  for (const file of fs.readdirSync(iconDir)) assert.ok(referencedIcons.has(file.replace(/\.png$/, '')), `unreferenced class icon file: ${file}`);
  assert.deepEqual([...characterIds].filter(id => !manifest.characters[id]).sort(), CHARACTER_GAPS);
  assert.deepEqual([...classIds].filter(id => !manifest.classes[id]).sort(), CLASS_GAPS);
  // Ability icon maps stay empty until their artwork is sourced.
  assert.deepEqual(Object.keys(manifest.abilities), []);
});

test('skill icons cover all skills in every variant; derived banes are marked as recreations', () => {
  const referenced = new Set<string>();
  for (const skill of SKILLS) {
    const entry = manifest.skills[skill];
    assert.ok(entry, `skill missing from manifest: ${skill}`);
    assert.ok(manifest.sources[entry.source], `unknown source for ${skill}`);
    if (DERIVED_BANE.includes(skill)) assert.equal(entry.bane_source, 'derived_composite', `derived bane not marked: ${skill}`);
    else assert.equal(entry.bane_source, undefined, `unexpected derived bane marking: ${skill}`);
    for (const variant of ['neutral', 'boon', 'bane'] as const) {
      const key = entry[variant];
      assert.ok(key, `missing ${variant} icon key for ${skill}`);
      const file = path.join(skillIconDir, `${key}.png`);
      assert.ok(fs.existsSync(file), `missing skill icon file: ${key}`);
      assert.ok(isPng(magic(file)), `skill icon is not PNG: ${key}`);
      referenced.add(key);
    }
  }
  assert.ok(manifest.sources.derived_composite, 'derived composite source record missing');
  assert.deepEqual(Object.keys(manifest.skills).sort(), [...SKILLS].sort());
  for (const file of fs.readdirSync(skillIconDir)) assert.ok(referenced.has(file.replace(/\.png$/, '')), `unreferenced skill icon file: ${file}`);
});
