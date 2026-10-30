import { buildDatabase } from './database_builder';
import { buildReferenceV3 } from './reference_v3_builder';
import path from 'node:path';
try {
  const args=process.argv.slice(2);
  if (args.length && (args.length !== 4 || args[0] !== '--manifest' || args[2] !== '--output')) throw new Error('Usage: npm run data:build -- [--manifest <application-relative manifest> --output <candidate.sqlite>]');
  const result=args.length ? buildReferenceV3(process.cwd(),path.resolve(args[3]),args[1]) : buildDatabase(process.cwd());
  console.log(JSON.stringify('changeReport' in result ? {validation:result.validation,overview:result.overview,outputFile:result.outputFile,changes:result.changeReport.counts} : result, null, 2));
} catch (error) {
  console.error('Reference build failed; the previous database was not replaced.', error);
  process.exitCode = 1;
}
