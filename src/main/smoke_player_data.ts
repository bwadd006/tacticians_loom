import type Database from 'better-sqlite3';
import { setCharacterNote,setCharacterShortlisted } from './database/user_database';
import { defaultSetup } from '../shared/library_setup';
import { defaultClassSetup } from '../shared/class_library_setup';
import { defaultParalogueSetup } from '../shared/paralogue_library_setup';
const oldVersion='2026.10.25.2',savedAt='2026-10-26T12:34:56.000Z';
export function seedExistingSmokeSave(db:Database.Database) {
 const setup={...defaultSetup(),sorts:[{field:'earliest_chapter',direction:'asc' as const},{field:'future_sort',direction:'desc' as const},{field:'name',direction:'asc' as const}]};
 db.prepare('INSERT INTO library_setups VALUES (?,?,?,?)').run('cai',JSON.stringify(setup),savedAt,oldVersion);
 db.prepare('INSERT INTO class_library_setup VALUES (1,?,?,?)').run(JSON.stringify(defaultClassSetup()),savedAt,oldVersion);
 db.prepare('INSERT INTO paralogue_library_setup VALUES (1,?,?,?)').run(JSON.stringify(defaultParalogueSetup()),savedAt,oldVersion);
 setCharacterNote(db,{characterId:'eshmel',note:'Retained before upgrade — out-of-scope character'},oldVersion);setCharacterShortlisted(db,{characterId:'eshmel',shortlisted:true},oldVersion);
 setCharacterNote(db,{characterId:'unresolved_saved_character',note:'Preserve this unresolved stable ID'},oldVersion);
}
