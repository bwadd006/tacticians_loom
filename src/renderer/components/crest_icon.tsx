import { useState } from 'react';
import { crestIconUrl } from './images';
export function CrestIcon({id}:{id?:string|null}) {
 const [failed,setFailed]=useState<string|null>(null),src=id?crestIconUrl(id):null;
 return src&&src!==failed?<img className="crest_icon" src={src} alt="" aria-hidden="true" onError={()=>setFailed(src)}/>:<span className="crest_icon crest_icon_missing" role="img" aria-label="Bloodmark artwork not available" title="Bloodmark artwork not available">—</span>;
}
