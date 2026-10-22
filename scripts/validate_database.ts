import path from 'node:path';
import { openReference } from '../src/main/database/reference_queries';
import { validateDatabase } from './database_validation';

const db = openReference(path.join(process.cwd(), 'database/generated/reference.sqlite'));
try { console.log(JSON.stringify(validateDatabase(db), null, 2)); }
finally { db.close(); }
