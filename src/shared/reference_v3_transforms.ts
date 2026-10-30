import { z } from 'zod';
import { quantitySchema, type Quantity } from './reference_v3';

// Lexical transforms preserve the supplied text. Units are supplied by reviewed mappings,
// not inferred from a column name, and expressions are never evaluated as JavaScript.
export function sourceQuantity(raw:string|number|null,unit:string|null):Quantity {
  const result:Quantity=quantitySchema.parse({raw,state:raw===null?'source_null':'value',number:null,lower:null,upper:null,unit,qualifier:'unknown'});
  if(typeof raw==='number') {result.number=raw;result.qualifier='exact';}
  else if(typeof raw==='string') {
    const value=raw.trim();
    if(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/u.test(value)&&(unit===null||unit==='percent')) {result.number=Number(value.slice(0,-1));result.unit='percent';result.qualifier='exact';}
    else if(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value)) {result.number=Number(value);result.qualifier='exact';}
    else if(/^(?:unlimited|∞)$/iu.test(value)) result.qualifier='unlimited';
    else if(value.includes('?')) result.qualifier='uncertain';
    else {
      const range=/^([+-]?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*([+-]?\d+(?:\.\d+)?)$/u.exec(value);
      if(range) {result.lower=Number(range[1]);result.upper=Number(range[2]);result.qualifier='range';}
    }
  }
  return quantitySchema.parse(result);
}
export function resolveSourceLabel(label:string,kind:string,entities:{id:string;kind:string;display_name:string}[],aliases:{entity_id:string;alias:string}[]) {
  const ids=[...new Set(entities.filter(e=>e.kind===kind && (e.display_name===label || aliases.some(a=>a.entity_id===e.id && a.alias===label))).map(e=>e.id))].sort();
  return {source_label:label,target_kind:kind,target_id:ids.length===1?ids[0]:null,state:ids.length===1?'mapped' as const:ids.length>1?'ambiguous' as const:'unresolved' as const};
}
const stock=z.tuple([z.string(),z.union([z.string(),z.number().finite()]).nullable()]);
export const sourceShopLayerSchema=z.object({sh:z.array(z.string()).optional(),shn:z.array(z.string()).optional(),sp:z.record(z.string(),z.array(stock)).optional()}).strict();
export function sourceShopLayer(base:unknown,override:unknown) {
  const parent=sourceShopLayerSchema.parse(base),part=sourceShopLayerSchema.parse(override);
  return {effective:{...parent,...part},states:Object.fromEntries(['sh','shn','sp'].map(key=>[key,Object.hasOwn(part,key)?'replaced':Object.hasOwn(parent,key)?'inherited':'source_missing']))};
}
