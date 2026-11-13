import {test} from "node:test";
import assert from "node:assert/strict";
import {PRESETS,DEFAULTS,parseOptions,availableOptions,replaceExtras} from "../scripts/options.mjs";
import {presetId,splitLegacy,combinedEntries,auditCustom,markExistingDamage,conflictGroup} from "../scripts/settings.mjs";
const types=Object.fromEntries(["force","fire","cold","radiant","necrotic","psychic","acid","poison","lightning","thunder"].map(t=>[t,{}]));
const all={version:1,disabled:[],custom:""};
test("all 44 defaults migrate to builtin section without custom copies",()=>{
 const s=splitLegacy(DEFAULTS);assert.equal(s.disabled.length,0);assert.equal(s.custom,"");
 assert.equal(combinedEntries(s,types,()=>true).length,44);
});
test("blank legacy remains completely disabled",()=>{
 const s=splitLegacy("");assert.equal(s.disabled.length,44);
 assert.equal(combinedEntries(s,types,()=>true).length,0);
});
test("edited presets and custom aliases survive without their builtin duplicate",()=>{
 const text="偷襲 | 7d6 | inherit | 自訂偷襲;Sneak Attack\nCustom | 2d6 | fire | New Ability";
 const s=splitLegacy(text);assert.equal(s.custom,text);
 const result=combinedEntries(s,types,()=>true);assert.equal(result.length,2);
 assert.equal(result[0].formula,"7d6");
});
test("custom overrides same preset even when builtin enabled; exact duplicates collapse",()=>{
 const s={...all,custom:"Hunter's Mark | 2d6 | force\nHunter's Mark | 2d6 | force"};
 const es=combinedEntries(s,types,()=>true);
 assert.equal(es.length,44);assert.equal(es.filter(e=>e.presetId===presetId(PRESETS[0])).length,1);
 assert.ok(auditCustom(s.custom).some(w=>w.includes("重複")));
});
test("different abilities with same dice both remain",()=>{
 const s={version:1,disabled:PRESETS.map(presetId),custom:"A | 1d6 | fire | A\nB | 1d6 | fire | B"};
 const es=combinedEntries(s,types,()=>true);assert.equal(es.length,2);
 const c={rolls:[{parts:["1d8"],options:{type:"fire"}}]};
 replaceExtras(c,es,new Set([0,1]));assert.equal(c.rolls.length,3);
});
test("direct source damage suppresses sneak, hex and mark",()=>{
 for(const name of ["Sneak Attack","Hex","Hunter's Mark"]) {
  const es=parseOptions(DEFAULTS,types,()=>true);
  const actor={items:[{id:"direct",type:"feat",name},{type:"class",name:"Rogue",system:{levels:5}}]};
  assert.equal(availableOptions(es,actor,"direct").length,0);
 }
});
test("explicit original flavor disables same ability, equal numbers alone do not",()=>{
 const es=parseOptions("Sneak Attack | sneak | inherit",types,()=>true);
 assert.ok(markExistingDamage(es,{rolls:[{options:{flavor:"Sneak Attack"}}]})[0].disabledReason);
 assert.ok(!markExistingDamage(es,{rolls:[{parts:["1d6"],options:{}}]})[0].disabledReason);
});
test("mutually exclusive class options are blocked even if both selected programmatically",()=>{
 const entries=[
 {label:"A",formula:"1d8",type:"radiant",presetKey:"divineStrike"},
 {label:"B",formula:"4",type:"radiant",presetKey:"clericPotent"}
 ];
 assert.equal(conflictGroup(entries[0]),conflictGroup(entries[1]));
 const c={rolls:[{parts:["1d8"],options:{type:"radiant"}}]};
 replaceExtras(c,entries,new Set([0,1]));assert.equal(c.rolls.length,2);
});

test("renamed builtin labels are preserved in custom",()=>{
 const p=PRESETS[0],line=["我的標記",...p.slice(1)].join(" | ");
 const saved=splitLegacy(line);assert.equal(saved.custom,line);
 assert.equal(combinedEntries(saved,types,()=>true)[0].label,"我的標記");
});
test("generic custom potent spellcasting overrides both ambiguous builtins",()=>{
 const es=combinedEntries({...all,custom:"自訂強力施法 | 5 | inherit | Potent Spellcasting"},types,()=>true);
 assert.ok(!es.some(e=>["preset:clericPotent","preset:druidPotent"].includes(e.formula)));
 assert.equal(es.filter(e=>e.label==="自訂強力施法").length,1);
});
