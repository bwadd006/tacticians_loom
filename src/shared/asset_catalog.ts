import { z } from 'zod';

const id=z.string().min(1).max(250),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const assetPathSchema=z.string().regex(/^resources\/(catalog|maps|portraits|class_icons|skill_icons)\/[a-z0-9_.-]+\.(png|webp)$/);
export const assetSourceSchema=z.object({capture_id:id.nullable(),source_url:z.string().nullable(),retrieved_at:z.string().nullable(),http_status:z.number().int().nullable(),state:z.enum(['captured','source_missing','historical_local','not_captured'])}).strict();
export const assetResourceSchema=z.object({id,path:assetPathSchema.nullable(),sha256:digest.nullable(),bytes:z.number().int().positive().nullable(),format:z.enum(['png','webp']).nullable(),width:z.number().int().positive().nullable(),height:z.number().int().positive().nullable(),file_state:z.enum(['captured','source_missing','not_captured']),attribution:z.string().min(1),authentic_rip_state:z.literal('unassessed'),derived_state:z.enum(['not_applicable','derived_composite']),sources:z.array(assetSourceSchema).min(1)}).strict().superRefine((r,c)=>{if(r.file_state==='captured'&&[r.path,r.sha256,r.bytes,r.format,r.width,r.height].some(x=>x===null))c.addIssue({code:'custom',message:'Captured art requires complete file metadata'});if(r.path&&!r.path.endsWith('.'+r.format))c.addIssue({code:'custom',message:'File extension must match actual format'});});
export const assetBindingSchema=z.object({id,subject_entity_id:id.nullable(),subject_skill_id:id.nullable(),subject_record_id:id.nullable(),catalog_key:id.nullable(),role:z.string().regex(/^[a-z_]+$/),variant:z.string(),resource_id:id,kind:z.enum(['direct','shared','category','placeholder','derived','source_reference']),selected:z.boolean(),evidence:z.string().min(1)}).strict();
export const assetManifestSchema=z.object({schema_version:z.literal(2),dataset_version:id,sources:z.record(z.string(),z.object({name:z.string(),url:z.string(),artwork_origin:z.string(),usage_note:z.string()}).strict()),resources:z.record(id,assetResourceSchema),bindings:z.array(assetBindingSchema),unresolved:z.array(z.object({subject_entity_id:id,role:z.string(),reason:z.string()}).strict())}).strict().superRefine((m,c)=>{
 const ids=new Set<string>(),slots=new Set<string>();for(const b of m.bindings){if(ids.has(b.id))c.addIssue({code:'custom',message:'Duplicate binding ID'});ids.add(b.id);if(!m.resources[b.resource_id])c.addIssue({code:'custom',message:'Dangling asset binding'});if(b.subject_entity_id&&b.subject_skill_id)c.addIssue({code:'custom',message:'Conflicting artwork owner kinds'});if(b.selected&&(b.subject_entity_id||b.subject_skill_id)){const slot=[b.subject_entity_id??b.subject_skill_id,b.role,b.variant].join('\0');if(slots.has(slot))c.addIssue({code:'custom',message:'Multiple selected bindings for one slot'});slots.add(slot);}}
 for(const [key,r]of Object.entries(m.resources))if(key!==r.id)c.addIssue({code:'custom',message:'Resource key/ID mismatch'});

});
export type AssetManifest=z.infer<typeof assetManifestSchema>;
export type AssetResource=z.infer<typeof assetResourceSchema>;
export type AssetBinding=z.infer<typeof assetBindingSchema>;
export const assetUrl=(resourceId:string)=>`loom-art://asset/${encodeURIComponent(resourceId)}`;
export function selectedAsset(manifest:AssetManifest,entityId:string,role:string,variant=''):AssetResource|null {
 const binding=manifest.bindings.find(b=>b.selected&&(b.subject_entity_id===entityId||b.subject_skill_id===entityId)&&b.role===role&&b.variant===variant);
 const resource=binding?manifest.resources[binding.resource_id]:null;
 return resource?.file_state==='captured'?resource:null;
}
export function selectedAssetUrl(manifest:AssetManifest,entityId:string,role:string,variant=''):string|null {
 const r=selectedAsset(manifest,entityId,role,variant);return r?assetUrl(r.id):null;
}
