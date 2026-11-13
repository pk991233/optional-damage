import {test} from "node:test";
import assert from "node:assert/strict";
import {PRESETS,DEFAULTS,parseOptions,availableOptions,replaceExtras} from "../scripts/options.mjs";
import {splitLegacy,markExistingDamage,conflictGroup,auditCustom} from "../scripts/settings.mjs";
import {consumptionWrapper} from "../scripts/consumption.mjs";
const types=Object.fromEntries(["force","fire","cold","radiant","necrotic","psychic","acid","poison","lightning","thunder"].map(t=>[t,{}]));
const all=parseOptions(DEFAULTS,types,()=>true);
test("incomplete legacy row remains editable rather than crashing migration",()=>{
 const result=splitLegacy("壞資料");
 assert.equal(result.custom,"壞資料");assert.ok(Array.isArray(auditCustom("壞資料")));
});
test("gloom damage improves at ranger 11, independent of other classes",()=>{
 for(const [level,expected] of [[10,"2d6"],[11,"2d8"],[20,"2d8"]]){
  const a={items:[{id:"d",type:"feat",name:"Dread Ambusher",isOwner:true,system:{uses:{max:3,spent:0}}},{type:"class",name:"Ranger",system:{levels:level}}]};
  assert.equal(availableOptions(all,a)[0].formula,expected);
 }
});
test("polar parent feature exposes the ranger-scaled rider",()=>{
 const a={items:[{type:"feat",name:"Frigid Explorer"},{type:"class",name:"Ranger",system:{levels:11}}]};
 const e=availableOptions(all,a);assert.equal(e.length,1);assert.equal(e[0].formula,"1d6");assert.equal(e[0].type,"cold");
});
test("launcher base weapon flavor must not disable its additional damage",()=>{
 const a={items:[{id:"w",type:"weapon",name:"Lightning Launcher"},{id:"f",type:"feat",name:"Lightning Launcher"},{type:"class",name:"Artificer",system:{levels:3}}]};
 const e=markExistingDamage(availableOptions(all,a,"w"),{rolls:[{parts:["1d6"],options:{flavor:"Lightning Launcher",type:"lightning"}}]});
 assert.equal(e.length,1);assert.ok(!e[0].disabledReason);assert.equal(e[0].formula,"1d6");
});
test("custom fixed formula still respects class option conflicts",()=>{
 const es=[{label:"A",formula:"1d8",type:"radiant",presetId:"divineStrike"},{label:"B",formula:"3",type:"radiant",presetId:"clericPotent"}];
 assert.equal(conflictGroup(es[0]),conflictGroup(es[1]));
 const c={rolls:[{options:{type:"radiant"}}]};replaceExtras(c,es,new Set([0,1]));assert.equal(c.rolls.length,2);
});
function resourceFixture(){
 const items=new Map(["a","b"].map(id=>[id,{id,name:id,isOwner:true,system:{uses:{max:3,spent:0}}}]));
 const actor={items,uuid:"Actor.rollback",async updateEmbeddedDocuments(type,changes){changes.forEach(c=>items.get(c._id).system.uses.spent=c["system.uses.spent"]);return changes;}};
 return {items,actor,rolls:["a","b"].map(id=>({options:{"optional-damage":true,optionalDamageSource:id}})),config:{subject:{actor}}};
}
test("no-op item writes are detected even when return count looks successful",async()=>{
 const f=resourceFixture();f.actor.updateEmbeddedDocuments=async(type,changes)=>changes;
 await assert.rejects(consumptionWrapper(async()=>{})(f.rolls,f.config),/更新未完成/);
 assert.equal(f.items.get("a").system.uses.spent,0);
});
test("partial item write is rolled back before reporting failure",async()=>{
 const f=resourceFixture();let calls=0;
 f.actor.updateEmbeddedDocuments=async(type,changes)=>{
  calls++;changes.forEach((c,i)=>{if(calls>1||i===0)f.items.get(c._id).system.uses.spent=c["system.uses.spent"];});
  return calls===1?changes.slice(0,1):changes;
 };
 await assert.rejects(consumptionWrapper(async()=>{})(f.rolls,f.config),/更新未完成/);
 assert.equal(f.items.get("a").system.uses.spent,0);assert.equal(f.items.get("b").system.uses.spent,0);
});
test("rollback does not overwrite a newer resource value",async()=>{
 const f=resourceFixture();f.actor.updateEmbeddedDocuments=async()=>{
  f.items.get("a").system.uses.spent=2;throw Error("concurrent update");
 };
 await assert.rejects(consumptionWrapper(async()=>{})(f.rolls,f.config),/concurrent/);
 assert.equal(f.items.get("a").system.uses.spent,2);
});

test("partially saved spell slots are refunded when the slot write throws",async()=>{
 const actor={isOwner:true,items:new Map([["d",{}]]),system:{spells:{spell1:{value:2,max:2},spell2:{value:2,max:2}}}};
 let calls=0;
 actor.update=async data=>{
  calls++;
  for(const [path,value] of Object.entries(data)){
   actor.system.spells[path.split(".")[2]].value=value;
   if(calls===1)throw Error("partial slots");
  }
 };
 const rolls=[1,2].map(level=>({options:{"optional-damage":true,optionalDamageSlot:{kind:"divine",key:"spell"+level,level,abilityId:"d"}}}));
 await assert.rejects(consumptionWrapper(async()=>{})(rolls,{subject:{actor}}),/partial slots/);
 assert.equal(actor.system.spells.spell1.value,2);assert.equal(actor.system.spells.spell2.value,2);
});
