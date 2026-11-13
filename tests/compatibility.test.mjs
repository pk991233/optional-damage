import {test} from "node:test";
import assert from "node:assert/strict";
import {PRESETS,DEFAULTS,parseOptions,availableOptions,ID} from "../scripts/options.mjs";
import {consumptionWrapper} from "../scripts/consumption.mjs";
const types=Object.fromEntries(["force","fire","cold","radiant","necrotic","psychic","acid","poison","lightning","thunder"].map(t=>[t,{}]));
const entries=parseOptions(DEFAULTS,types,()=>true);
const cls=(name,levels)=>({id:"class",type:"class",name,system:{levels}});
const feat=name=>({id:name,type:"feat",name,system:{}});
test("cleric fallback allows both with no pending choice; explicit child restricts the pair",()=>{
 const a={items:[cls("Cleric",7),feat("Blessed Strikes")],system:{abilities:{wis:{mod:3}}}};
 const pair=()=>availableOptions(entries,a).filter(e=>["divineStrike","clericPotent"].includes(e.presetKey));
 assert.equal(pair().length,2);assert.ok(pair().every(e=>!e.disabledReason&&!e.choicePending));
 a.items.push(feat("Divine Strike"));assert.deepEqual(pair().map(e=>e.presetKey),["divineStrike"]);
 a.items.pop();a.items.push(feat("Blessed Strikes (Potent Spellcasting)"));
 assert.deepEqual(pair().map(e=>e.presetKey),["clericPotent"]);
 a.items=[cls("Cleric",6)];assert.equal(pair().length,0);
 a.items=[cls("Cleric",7)];assert.equal(pair().length,2);
});
test("Infiltrator activity provides launcher rider only for the matching current activity",()=>{
 const activity={name:"Infiltrator"};
 const armor={id:"armor",type:"equipment",name:"Arcane Armor",system:{activities:[activity,{name:"Guardian"}]}};
 const a={items:[cls("Artificer",3),armor]};
 assert.ok(availableOptions(entries,a,"armor",activity).some(e=>e.presetKey==="launcher"));
 assert.ok(!availableOptions(entries,a,"armor",{name:"Guardian"}).some(e=>e.presetKey==="launcher"));
 assert.ok(availableOptions(entries,a,"armor").some(e=>e.presetKey==="launcher"));
});
test("invocation prefixes and Chinese Savage Attacks alias match without identifier",()=>{
 const a={isOwner:true,items:[cls("Warlock",9),feat("Eldritch Invocations: Eldritch Smite"),feat("Eldritch Invocations: Lifedrinker"),feat("野蠻攻擊")],
 system:{spells:{pact:{value:2,max:2,level:5}}}};
 const es=availableOptions(entries,a);
 assert.ok(es.some(e=>e.smite==="eldritch"&&!e.disabledReason));
 assert.ok(es.some(e=>e.presetKey==="lifedrinker"));assert.ok(es.some(e=>e.presetKey==="savage"));
 assert.ok(!PRESETS.some(p=>p[1]==="preset:radiant"));
});
test("successful item updates can expand caller data without false failure or double charging",async()=>{
 const item={id:"f",name:"Fire",isOwner:true,system:{uses:{max:3,spent:0}}};
 const actor={items:new Map([["f",item]]),async updateEmbeddedDocuments(type,changes){
  for(const c of changes){
   const spent=c["system.uses.spent"];delete c["system.uses.spent"];c.system={uses:{spent}};
   item.system.uses.spent=spent;
  }return [item];
 }};
 const rolls=[{options:{[ID]:true,optionalDamageSource:"f"}}],config={subject:{actor}};
 const fn=consumptionWrapper(async()=>"ok");
 assert.equal(await fn(rolls,config),"ok");assert.equal(item.system.uses.spent,1);
 await fn(rolls,config);assert.equal(item.system.uses.spent,1);
});
test("partial failed item writes roll back even when rollback input is expanded",async()=>{
 const items=new Map(["a","b"].map(id=>[id,{id,isOwner:true,system:{uses:{max:3,spent:0}}}]));
 let calls=0;
 const actor={items,async updateEmbeddedDocuments(type,changes){
  calls++;
  const subset=calls===1?changes.slice(0,1):changes;
  for(const c of subset){const spent=c["system.uses.spent"];delete c["system.uses.spent"];c.system={uses:{spent}};items.get(c._id).system.uses.spent=spent;}
  return subset.map(c=>items.get(c._id));
 }};
 await assert.rejects(consumptionWrapper(async()=>{})(["a","b"].map(id=>({options:{[ID]:true,optionalDamageSource:id}})),{subject:{actor}}));
 assert.equal(items.get("a").system.uses.spent,0);assert.equal(items.get("b").system.uses.spent,0);
});
