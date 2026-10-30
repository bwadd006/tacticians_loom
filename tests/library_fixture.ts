import path from 'node:path';
import { openReference,getCharacter,getClassLibrary,getParalogueLibrary } from '../src/main/database/reference_queries';
import retained from '../data/contracts/retained_core_ids.json';
// Exercise the maintained application dataset rather than a historical import snapshot.
const db=openReference(path.join(process.cwd(),'database/generated/reference.sqlite'));
export const characters=retained.filter(e=>e.kind==='character').map(e=>getCharacter(db,e.id)!);
export const classLibrary=getClassLibrary(db);
export const paralogueLibrary=getParalogueLibrary(db);
db.close();
