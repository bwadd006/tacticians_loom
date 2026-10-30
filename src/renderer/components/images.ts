import rawManifest from '../../../resources/asset_manifest.json';
import { selectedAssetUrl, type AssetManifest } from '../../shared/asset_catalog';

// Only opaque resource IDs cross to the main-process artwork protocol. Source
// URLs and filesystem paths in the attribution manifest are never image URLs.
const manifest=rawManifest as unknown as AssetManifest;
export function portraitUrl(characterId:string,variant:'table'|'details'='details'):string|null {
 return selectedAssetUrl(manifest,characterId,variant==='table'?'thumbnail':'portrait');
}
export function classIconUrl(classId:string):string|null {return selectedAssetUrl(manifest,classId,'class_icon');}
export type AffinityVariant='boon'|'bane'|'neutral';
export function skillIconUrl(skillId:string,variant:AffinityVariant):string|null {return selectedAssetUrl(manifest,skillId,'skill_icon',variant);}
export function actionIconUrl(actionId:string):string|null {return selectedAssetUrl(manifest,actionId,'icon');}
