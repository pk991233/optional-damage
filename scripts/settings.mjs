import {damageConflictGroup} from "./rules.mjs";
import {PRESETS, parseOptions, normalizeName} from "./options.mjs";
export const presetId = p => p[1].startsWith("preset:") ? p[1].slice(7) : normalizeName(p[0]);
const parts = line => line.split("|").map(s=>s.trim());
const names = s => (s??"").split(/[;；]/).map(normalizeName).filter(Boolean).sort();
const dynamic = f => ["sneak","divine","eldritch","fey","gloom","colossus","polar","firearm"].includes(f)||String(f??"").startsWith("preset:");
export function identifyPreset(fields) {
 const [label,formula,,aliases]=fields;
 const byName=PRESETS.filter(p=>normalizeName(p[0])===normalizeName(label));
 if(byName.length===1)return byName[0];
 if(dynamic(formula))return PRESETS.find(p=>p[1]===formula);
 const ns=names(aliases||label);
 const candidates=PRESETS.filter(p=>names(p[3]).some(n=>ns.includes(n)));
 return candidates.length===1?candidates[0]:undefined;
}
function presetCandidates(fields) {
 const exact=identifyPreset(fields);
 if(exact)return [exact];
 const ns=names(fields[3]||fields[0]);
 return PRESETS.filter(p=>names(p[3]).some(n=>ns.includes(n)));
}
export function splitLegacy(text) {
 const disabled=new Set(PRESETS.map(presetId)),custom=[];
 for(const line of String(text??"").split(/\r?\n/).filter(s=>s.trim())) {
  const f=parts(line),p=identifyPreset(f);
  const same=p&&f[0]===p[0]&&f[1]===p[1]&&f[2]===p[2]&&
   (!f[3]||names(f[3]).join(";")===names(p[3]).join(";"));
  if(same) disabled.delete(presetId(p)); else custom.push(line);
 }
 // A modified preset remains in custom and overrides its built-in counterpart.
 for(const line of custom)for(const p of presetCandidates(parts(line)))disabled.add(presetId(p));
 return {version:1,disabled:[...disabled],custom:custom.join("\n")};
}
export function settingsData(saved,legacy) {
 return saved?.version===1 ? saved : splitLegacy(legacy);
}
export function combinedEntries(settings,types,validate) {
 const custom=parseOptions(settings.custom??"",types,validate).map(e=>({...e,origin:"custom"}));
 const overridden=new Set(custom.flatMap(e=>presetCandidates([e.label,e.formula,e.type,e.aliases.join(";")])).map(presetId));
 const builtins=PRESETS.filter(p=>!settings.disabled?.includes(presetId(p))&&!overridden.has(presetId(p)));
 const defaults=parseOptions(builtins.map(p=>p.join(" | ")).join("\n"),types,validate).map(e=>({...e,origin:"preset"}));
 const seen=new Set();
 return [...defaults,...custom].filter(e=>{
  const p=identifyPreset([e.label,e.formula,e.type,e.aliases.join(";")]);
  e.presetId=p?presetId(p):undefined;
  const fingerprint=JSON.stringify([e.presetId??names(e.aliases.join(";")),e.formula.replace(/\s/g,""),e.type]);
  if(seen.has(fingerprint))return false;
  seen.add(fingerprint);return true;
 });
}
export function auditCustom(text) {
 const warnings=[],seen=new Set();
 for(const line of String(text??"").split(/\r?\n/).filter(s=>s.trim())) {
  const f=parts(line),p=identifyPreset(f);
  const matches=presetCandidates(f);
  if(matches.length)warnings.push("「"+f[0]+"」會取代預設："+matches.map(p=>p[0]).join("、")+"。");
  const key=JSON.stringify([p?presetId(p):names(f[3]||f[0]),f[1]?.replace(/\s/g,""),f[2]]);
  if(seen.has(key))warnings.push("「"+f[0]+"」有重複列；擲骰時只保留一份。");
  seen.add(key);
 }
 return [...new Set(warnings)];
}
export const conflictGroup = damageConflictGroup;
export function markExistingDamage(entries,config) {
 const base=(config.rolls??[]).filter(r=>!r.options?.["optional-damage"]);
 return entries.map(e=>{
  // Lightning Launcher is also the base weapon name, not proof of an existing rider.
  if(e.presetKey==="launcher" || e.presetId==="launcher")return e;
  const aliases=[e.label,...e.aliases].map(normalizeName);
  const found=base.some(r=>r.options?.flavor&&aliases.includes(normalizeName(r.options.flavor)));
  return found?{...e,disabledReason:"原傷害已標示此能力，避免重複加入。"}:e;
 });
}
