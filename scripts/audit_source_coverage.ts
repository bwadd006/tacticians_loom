import fs from 'node:fs';
import path from 'node:path';
import { buildDataCoverageReport } from '../src/shared/data_coverage';
import { validateSources } from '../src/shared/validate_sources';

const appRoot = process.cwd();
const sourceDirectory = path.join(appRoot, 'data', 'source');
const readJson = (filename: string) => JSON.parse(fs.readFileSync(path.join(sourceDirectory, filename), 'utf8')) as unknown;

const { characters, classes } = validateSources(
  readJson('fire_emblem_fortunes_weave_characters.json'),
  readJson('fire_emblem_fortunes_weave_classes.json'),
);

console.log(JSON.stringify(buildDataCoverageReport(characters, classes), null, 2));
