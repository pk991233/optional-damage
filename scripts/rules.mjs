// Shared identifiers and selection rules. Do not use broad substring matching.
export function normalizedAbilityName(value) {
 return String(value??"").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
}
export function abilityMatches(value,aliases) {
 const text=String(value??"");
 const withoutPrefix=text.replace(/^\s*Eldritch Invocations\s*[:：]\s*/i,"");
 const parts=[text,withoutPrefix,...text.split(/[()（）\[\]【】/]/u)];
 return parts.some(part=>{
  const normalized=normalizedAbilityName(part);
  return normalized&&aliases.some(alias=>normalized===normalizedAbilityName(alias));
 });
}
export function objectMatchesAbility(object,aliases) {
 return [object?.name,object?.identifier,object?.system?.identifier].some(v=>abilityMatches(v,aliases));
}
export function damageConflictGroup(entry) {
 const key=entry.presetKey??entry.presetId??(entry.formula?.startsWith("preset:")?entry.formula.slice(7):"");
 if(["harm","harmFlurry"].includes(key))return "monk-harm";
 if(["divineStrike","clericPotent"].includes(key))return "cleric-blessed";
 if(["primal","druidPotent"].includes(key))return "druid-fury";
 return entry.presetId?"preset:"+entry.presetId:"";
}
