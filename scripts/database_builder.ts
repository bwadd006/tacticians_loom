import path from 'node:path';
import { buildReferenceV3 } from './reference_v3_builder';
export function buildDatabase(appRoot: string, outputFile = path.join(appRoot,'database/generated/reference.sqlite')) {
  return buildReferenceV3(appRoot,outputFile);
}
