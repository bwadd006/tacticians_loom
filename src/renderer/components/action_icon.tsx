import { useState } from 'react';
import { actionIconUrl } from './images';

export function ActionIcon({id}:{id?:string|null}) {
 const [failed,setFailed]=useState<string|null>(null),src=id?actionIconUrl(id):null;
 // The adjacent ability name/effect is always readable, including unknown art.
 return src&&src!==failed?<img className="action_icon" src={src} alt="" aria-hidden="true" onError={()=>setFailed(src)}/>:null;
}
