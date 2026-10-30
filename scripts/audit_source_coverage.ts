import { loadReferenceV3, referenceV3Coverage } from './reference_v3_sources';
console.log(JSON.stringify(referenceV3Coverage(loadReferenceV3(process.cwd()).records),null,2));
