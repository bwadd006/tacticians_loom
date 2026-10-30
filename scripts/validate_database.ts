import path from 'node:path';
import { openReference } from '../src/main/database/reference_queries';
import { validateDatabase } from './database_validation';

const args=process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--candidate')) throw new Error('Usage: npm run data:validate -- [--candidate <candidate.sqlite>]');
const db = openReference(args.length ? path.resolve(args[1]) : path.join(process.cwd(), 'database/generated/reference.sqlite'),{allowCandidate:args.length>0});
try { console.log(JSON.stringify(validateDatabase(db), null, 2)); }
finally { db.close(); }
