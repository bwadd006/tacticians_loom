import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { distributionFiles,validateDistributionBoundary } from './distribution_boundary';
const args=process.argv.slice(2);
assert.ok(args.length===2&&args[0]==='--output','Usage: npm run source:export -- --output <new directory>');
const root=fs.realpathSync(process.cwd()),output=path.resolve(args[1]);
assert.ok(!fs.existsSync(output),'Export requires a new destination');
assert.ok(output!==root&&!output.startsWith(root+path.sep),'Export outside the application');
validateDistributionBoundary(root);
try{for(const name of distributionFiles(root)){const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);}validateDistributionBoundary(output);}
catch(error){fs.rmSync(output,{recursive:true,force:true});throw error;}
console.log(`Application source exported without Git history or generated files: ${output}`);
