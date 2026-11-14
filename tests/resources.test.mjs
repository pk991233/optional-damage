import {test} from "node:test";
import assert from "node:assert/strict";
import {resourcePlan, resourceRead, bindResource, hitDiceRequests, resourceDescription} from "../scripts/resources.mjs";
import {PRESETS,DEFAULTS,parseOptions,availableOptions,replaceExtras,ID} from "../scripts/options.mjs";
import {consumptionWrapper} from "../scripts/consumption.mjs";
const types=Object.fromEntries(["force","fire","cold","radiant","necrotic","psychic","acid","poison","lightning","thunder"].map(t=>[t,{}]));
const all=parseOptions(DEFAULTS,types,()=>true);
const feat=(id,name,uses)=>({id,name,type:"feat",isOwner:true,system:{uses}});
const cls=(id,name,levels,die,spent=0)=>({id,name,type:"class",isOwner:true,system:{levels,hd:{denomination:die,spent,max:levels}}});
function fixture(list) {
 const items=new Map(list.map(i=>[i.id,i]));items[Symbol.iterator]=items.values.bind(items);
 const set=(doc,path,value)=>{const keys=path.split(".");let target=doc;for(const k of keys.slice(0,-1))target=target[k]??= {};target[keys.at(-1)]=value;};
 const actor={uuid:"Actor.resources",isOwner:true,items,system:{abilities:{wis:{mod:3},int:{mod:4}},attributes:{prof:6}},
 async update(changes){for(const [path,value] of Object.entries(changes))set(actor,path,value);},
 async updateEmbeddedDocuments(type,changes){for(const c of changes)for(const [path,value] of Object.entries(c))if(path!=="_id")set(items.get(c._id),path,value);return changes;}};
 return {actor,items,config:{subject:{actor},rolls:[{parts:["1d8"],options:{type:"slashing"}}]}};
}
const resourceRoll=requests=>({options:{[ID]:true,optionalDamageResources:requests}});
test("bilingual Thug parent and Assassination activity appear and bind activity uses",()=>{
 const thug=feat("thug","暴徒 Thug");thug.system.activities={assassination:{id:"assassination",name:"刺殺 Assassination",uses:{max:1,spent:0}}};
 const f=fixture([thug,cls("rogue","Rogue",20,"d8")]);
 const e=availableOptions(all,f.actor).find(e=>e.presetKey==="thug");
 assert.equal(e.formula,"3d6");assert.equal(e.resourceRequests[0].path,"system.activities.assassination.uses.spent");
 assert.ok(!e.resourceError);
 thug.system.activities.assassination.uses.spent=1;
 assert.ok(availableOptions(all,f.actor).find(e=>e.presetKey==="thug").resourceError);
});
test("Psionic Strike consumes explicit linked dice pool rather than own counter",async()=>{
 const strike=feat("strike","Psionic Strike",{max:9,spent:0});
 strike.system.activities={a:{id:"a",name:"Psionic Strike",consumption:{targets:[{type:"itemUses",target:"dice",value:"1"}]}}};
 const f=fixture([strike,feat("dice","Pool",{max:4,spent:2}),cls("fighter","Fighter",5,"d10")]);
 const e=availableOptions(all,f.actor).find(e=>e.presetKey==="psionic");
 assert.equal(e.resourceRequests[0].itemId,"dice");assert.match(e.resourceText,/2\/4/);
 replaceExtras(f.config,[e],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
 assert.equal(f.items.get("dice").system.uses.spent,3);assert.equal(strike.system.uses.spent,0);
});
test("Psionic Power activity fallback and resource shortage",()=>{
 const power=feat("power","Psionic Power",{max:4,spent:4});
 power.system.activities={a:{id:"a",name:"Psionic Strike"}};
 const f=fixture([power,cls("fighter","Fighter",5,"d10")]);
 const e=availableOptions(all,f.actor).find(e=>e.presetKey==="psionic");
 assert.ok(e);assert.ok(e.resourceError);
 replaceExtras(f.config,[e],new Set([0]));assert.equal(f.config.rolls.length,1);
});
test("Hand of Harm spends Monk's Focus and supports Ki resource fallback",async()=>{
 const harm=feat("harm","Hand of Harm");
 const f=fixture([harm,feat("focus","Monk's Focus",{max:5,spent:1}),cls("monk","Monk",5,"d8")]);
 const e=availableOptions(all,f.actor).find(e=>e.presetKey==="harm");
 assert.equal(e.resourceRequests[0].itemId,"focus");assert.match(e.resourceText,/4\/5/);
 replaceExtras(f.config,[e],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
 assert.equal(f.items.get("focus").system.uses.spent,2);
 f.items.delete("focus");f.actor.system.resources={primary:{label:"氣",value:2,max:5}};
 const e2=availableOptions(all,f.actor).find(e=>e.presetKey==="harm");
 assert.equal(e2.resourceRequests[0].direction,-1);
 replaceExtras(f.config,[e2],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
 assert.equal(f.actor.system.resources.primary.value,1);
});
test("missing and ambiguous pools never silently allow free damage",()=>{
 const harm=feat("harm","Hand of Harm"),f=fixture([harm,cls("monk","Monk",5,"d8")]);
 assert.ok(availableOptions(all,f.actor).find(e=>e.presetKey==="harm").resourceError);
 f.items.set("a",feat("a","Ki",{max:5,spent:0}));f.items.set("b",feat("b","Monk's Focus",{max:5,spent:0}));
 assert.match(availableOptions(all,f.actor).find(e=>e.presetKey==="harm").resourceError,/多個/);
});
test("hit dice allocate across same-size classes and respect different denominations",()=>{
 const f=fixture([cls("a","Fighter",2,"d10",1),cls("b","Paladin",3,"d10",2),cls("c","Wizard",4,"d6",3)]);
 const plan=resourcePlan(f.actor,hitDiceRequests("2d10"));
 assert.deepEqual(plan.items,[{_id:"a","system.hd.spent":2},{_id:"b","system.hd.spent":3}]);
 assert.throws(()=>resourcePlan(f.actor,hitDiceRequests("2d6")));
 assert.deepEqual(resourcePlan(f.actor,hitDiceRequests("1d10 + 1d6")).items,[{_id:"a","system.hd.spent":2},{_id:"c","system.hd.spent":4}]);
 assert.match(resourceDescription(f.actor,hitDiceRequests("2d10")),/2\/5/);
});
test("selected hit dice debit once on critical and repeated evaluation",async()=>{
 const f=fixture([cls("a","Fighter",3,"d10"),cls("b","Wizard",2,"d6")]);
 const rolls=[resourceRoll(hitDiceRequests("1d10 + 1d6"))];rolls[0].options.isCritical=true;
 const fn=consumptionWrapper(async()=>"ok");
 await fn(rolls,f.config);await fn(rolls,f.config);
 assert.equal(f.items.get("a").system.hd.spent,1);assert.equal(f.items.get("b").system.hd.spent,1);
});
test("two feats sharing one remaining hit die fail before damage evaluation",async()=>{
 const f=fixture([cls("a","Wizard",1,"d6")]);let evaluated=false;
 const rolls=[resourceRoll(hitDiceRequests("1d6")),resourceRoll(hitDiceRequests("1d6"))];
 await assert.rejects(consumptionWrapper(async()=>{evaluated=true;})(rolls,f.config),/不足/);
 assert.equal(evaluated,false);assert.equal(f.items.get("a").system.hd.spent,0);
});
test("preview cancellation and failed damage evaluation do not spend hit dice",async()=>{
 const f=fixture([cls("a","Wizard",2,"d6")]),rolls=[resourceRoll(hitDiceRequests("2d6"))];
 const fn=consumptionWrapper(async()=>{});
 await fn([],f.config);await fn(rolls,{...f.config,evaluate:false});
 await assert.rejects(consumptionWrapper(async()=>{throw Error("dice");})(rolls,f.config));
 assert.equal(f.items.get("a").system.hd.spent,0);
});
test("last hit die cannot be consumed by concurrent dialogs in this browser",async()=>{
 const f=fixture([cls("a","Wizard",1,"d6")]),fn=consumptionWrapper(async()=>Promise.resolve());
 const results=await Promise.allSettled([fn([resourceRoll(hitDiceRequests("1d6"))],f.config),fn([resourceRoll(hitDiceRequests("1d6"))],f.config)]);
 assert.deepEqual(results.map(r=>r.status),["fulfilled","rejected"]);assert.equal(f.items.get("a").system.hd.spent,1);
});
test("partial HD and actor resource writes roll back together",async()=>{
 const f=fixture([cls("a","Wizard",2,"d6"),cls("b","Monk",2,"d8")]);
 f.actor.system.resources={primary:{value:2,max:2}};
 const write=f.actor.updateEmbeddedDocuments;let calls=0;
 f.actor.updateEmbeddedDocuments=async(type,changes)=>{calls++;return write(type,calls===1?changes.slice(0,1):changes);};
 const rolls=[resourceRoll([...hitDiceRequests("1d6 + 1d8"),{path:"system.resources.primary.value",direction:-1,cost:1}])];
 await assert.rejects(consumptionWrapper(async()=>{})(rolls,f.config),/更新未完成/);
 assert.equal(f.items.get("a").system.hd.spent,0);assert.equal(f.items.get("b").system.hd.spent,0);assert.equal(f.actor.system.resources.primary.value,2);
});
test("HD ownership and missing spent fields disable spending; no guessed balances",()=>{
 const f=fixture([cls("a","Wizard",2,"d6")]);f.items.get("a").isOwner=false;
 assert.throws(()=>resourcePlan(f.actor,hitDiceRequests("1d6")));
 f.items.get("a").isOwner=true;delete f.items.get("a").system.hd.spent;
 assert.throws(()=>resourcePlan(f.actor,hitDiceRequests("1d6")));
});
test("both HD presets carry per-choice cost; bard defaults removed",()=>{
 const f=fixture([feat("s","Spellfire Adept"),feat("f","Fueled Evocation"),cls("c","Wizard",4,"d6"),{id:"spell",type:"spell",system:{level:1}}]);
 const es=availableOptions(all,f.actor,"spell").filter(e=>["spellfire","fueled"].includes(e.presetKey));
 assert.equal(es.length,2);
 es.forEach(e=>{assert.ok(e.choicePending);assert.equal(e.choices.find(c=>c.formula==="2d6").resourceRequests[0].cost,2);});
 assert.ok(!PRESETS.some(p=>["preset:inspiration","preset:channeling"].includes(p[1])));
});
test("unsupported consumption targets fail closed rather than charging a guessed pool",()=>{
 const harm=feat("harm","Hand of Harm");
 harm.system.activities={a:{id:"a",name:"Hand of Harm",consumption:{targets:[{type:"material",value:"1",target:"x"}]}}};
 const f=fixture([harm,feat("focus","Ki",{max:5,spent:0})]);
 assert.match(bindResource(f.actor,[harm],"harm",["Hand of Harm"]).error,/不支援/);
});

test("Mercy alternate harm requires monk 11 and Flurry of Healing and Harm",()=>{
 const f=fixture([feat("harm","Hand of Harm"),feat("ki","Ki",{max:11,spent:0}),cls("monk","Monk",10,"d8"),feat("flurry","活殺自在 Flurry of Healing and Harm",{max:3,spent:0})]);
 const list=()=>availableOptions(all,f.actor).filter(e=>["harm","harmFlurry"].includes(e.presetKey));
 assert.equal(list().length,1);f.items.get("monk").system.levels=11;
 assert.equal(list().length,2);assert.equal(list()[1].formula,list()[0].formula);
 assert.equal(availableOptions(all,f.actor,"flurry").some(e=>e.presetKey==="harmFlurry"),false);
 f.items.delete("flurry");assert.equal(list().length,1);
});
test("alternate harm spends one Flurry use and no Ki even on critical/re-evaluation",async()=>{
 const f=fixture([feat("harm","Hand of Harm"),feat("ki","Ki",{max:11,spent:11}),cls("monk","Monk",11,"d8"),feat("flurry","Flurry of Healing and Harm",{max:3,spent:0})]);
 const es=availableOptions(all,f.actor).filter(e=>["harm","harmFlurry"].includes(e.presetKey));
 assert.ok(es[0].resourceError);assert.ok(!es[1].resourceError);
 f.config.isCritical=true;replaceExtras(f.config,es,new Set([1]));
 const fn=consumptionWrapper(async()=>{});await fn(f.config.rolls,f.config);await fn(f.config.rolls,f.config);
 assert.equal(f.items.get("ki").system.uses.spent,11);assert.equal(f.items.get("flurry").system.uses.spent,1);
});
test("harm variants cannot both enter one damage roll and normal harm only consumes Ki",async()=>{
 const f=fixture([feat("harm","Hand of Harm"),feat("ki","Ki",{max:11,spent:0}),cls("monk","Monk",11,"d8"),feat("flurry","活殺自在",{max:3,spent:0})]);
 const es=availableOptions(all,f.actor).filter(e=>["harm","harmFlurry"].includes(e.presetKey));
 replaceExtras(f.config,es,new Set([0,1]));assert.equal(f.config.rolls.length,2);
 await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
 assert.equal(f.items.get("ki").system.uses.spent,1);assert.equal(f.items.get("flurry").system.uses.spent,0);
});
test("exhausted, missing, duplicate and unowned Flurry resources disable alternate harm",()=>{
 const f=fixture([feat("harm","Hand of Harm"),feat("ki","Ki",{max:11,spent:0}),cls("monk","Monk",11,"d8"),feat("flurry","活殺自在",{max:3,spent:3})]);
 const get=()=>availableOptions(all,f.actor).find(e=>e.presetKey==="harmFlurry");
 assert.ok(get().resourceError);
 f.items.get("flurry").system.uses={max:3,spent:0};f.items.get("flurry").isOwner=false;assert.ok(get().resourceError);
 f.items.get("flurry").isOwner=true;delete f.items.get("flurry").system.uses;assert.ok(get().resourceError);
 f.items.set("copy",feat("copy","Flurry of Healing and Harm",{max:3,spent:0}));assert.match(get().resourceError,/多個/);
});
test("activity-based Flurry uses consume the matching activity, never its Ki target",async()=>{
 const flurry=feat("flurry","活殺自在");
 flurry.system.activities={a:{id:"a",name:"Flurry of Healing and Harm",uses:{max:3,spent:0},consumption:{targets:[{type:"itemUses",target:"ki",value:"1"}]}}};
 const f=fixture([feat("harm","Hand of Harm"),feat("ki","Ki",{max:11,spent:0}),cls("monk","Monk",11,"d8"),flurry]);
 const e=availableOptions(all,f.actor).find(e=>e.presetKey==="harmFlurry");
 replaceExtras(f.config,[e],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
 assert.equal(flurry.system.activities.a.uses.spent,1);assert.equal(f.items.get("ki").system.uses.spent,0);
});

test("Flurry follows a unique linked item pool and shows its source",async()=>{
 const feature=feat("flurry","Flurry of Healing and Harm",{max:0,spent:0});
 feature.system.activities={a:{id:"a",name:"Use",consumption:{targets:[{type:"itemUses",target:"pool",value:"1"}]}}};
 const f=fixture([feat("harm","Hand of Harm"),feat("ki","Ki",{max:11,spent:0}),cls("monk","Monk",11,"d8"),feature,feat("pool","Flurry Pool",{max:3,spent:0})]);
 const e=availableOptions(all,f.actor).find(e=>e.presetKey==="harmFlurry");
 assert.ok(!e.resourceError);assert.equal(e.resourceRequests[0].itemId,"pool");
 assert.match(e.resourceText,/來源：Flurry Pool → 特性次數/);
 replaceExtras(f.config,[e],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
 assert.equal(f.items.get("pool").system.uses.spent,1);assert.equal(f.items.get("ki").system.uses.spent,0);
});
test("linked Flurry cannot substitute Ki or ambiguous consumption activities",()=>{
 const feature=feat("flurry","活殺自在",{max:0,spent:0});
 feature.system.activities={a:{id:"a",name:"Use",consumption:{targets:[{type:"itemUses",target:"ki",value:"1"}]}}};
 const f=fixture([feat("harm","Hand of Harm"),feat("ki","Ki",{max:11,spent:0}),cls("monk","Monk",11,"d8"),feature]);
 const get=()=>availableOptions(all,f.actor).find(e=>e.presetKey==="harmFlurry");
 assert.match(get().resourceError,/不可連結氣/);
 feature.system.activities.b={id:"b",name:"Other",consumption:{targets:[{type:"itemUses",target:"ki",value:"1"}]}};
 assert.match(get().resourceError,/多個/);
});
test("linked Flurry missing exhausted or unowned pools are disabled",()=>{
 const feature=feat("flurry","活殺自在");
 feature.system.activities={a:{id:"a",name:"Use",consumption:{targets:[{type:"itemUses",target:"pool",value:"1"}]}}};
 const f=fixture([feat("harm","Hand of Harm"),cls("monk","Monk",11,"d8"),feature]);
 const get=()=>availableOptions(all,f.actor).find(e=>e.presetKey==="harmFlurry");
 assert.ok(get().resourceError);
 f.items.set("pool",feat("pool","Flurry Pool",{max:3,spent:3}));assert.ok(get().resourceError);
 f.items.get("pool").system.uses.spent=0;f.items.get("pool").isOwner=false;assert.ok(get().resourceError);
 feature.system.activities.a.consumption.targets[0].value="2";assert.match(get().resourceError,/消耗 1 次/);
});

test("dedicated named pools override stale consumption links without debiting old counters",async()=>{
 for(const [key,ability,poolName,className] of [["psionic","Psionic Strike","Psionic Energy Die","Fighter"],["harm","Hand of Harm","Focus Point","Monk"]]) {
  const abilityItem=feat("ability",ability,{max:8,spent:0});
  abilityItem.system.activities={a:{id:"a",name:ability,consumption:{targets:[{type:"itemUses",target:"old",value:"2"}]}}};
  const f=fixture([abilityItem,feat("pool",poolName,{max:4,spent:1}),feat("old",key==="harm"?"Monk's Focus":"Psionic Power",{max:8,spent:0}),cls("class",className,5,"d8")]);
  const e=availableOptions(all,f.actor).find(e=>e.presetKey===key);
  assert.equal(e.resourceRequests[0].itemId,"pool");assert.equal(e.resourceRequests[0].cost,1);assert.ok(!e.resourceError);
  assert.ok(e.resourceText.includes(poolName));
  replaceExtras(f.config,[e],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
  assert.equal(f.items.get("pool").system.uses.spent,2);assert.equal(f.items.get("old").system.uses.spent,0);assert.equal(abilityItem.system.uses.spent,0);
 }
});
test("named activity pools debit their own activity instead of the parent feature",async()=>{
 for(const [key,ability,poolName,className] of [["psionic","Psionic Strike","Psionic Energy Die","Fighter"],["harm","Hand of Harm","Focus Point","Monk"]]) {
  const parent=feat("parent",key==="harm"?"Monk's Focus":"Psionic Power",{max:8,spent:0});
  parent.system.activities={pool:{id:"pool",name:poolName,uses:{max:3,spent:0}}};
  const f=fixture([feat("ability",ability),parent,cls("class",className,5,"d8")]);
  const e=availableOptions(all,f.actor).find(e=>e.presetKey===key);
  assert.equal(e.resourceRequests[0].path,"system.activities.pool.uses.spent");
  replaceExtras(f.config,[e],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
  assert.equal(parent.system.activities.pool.uses.spent,1);assert.equal(parent.system.uses.spent,0);
 }
});
test("exhausted missing-data unowned or duplicate primary pools never fall back",()=>{
 const f=fixture([feat("ability","Hand of Harm",{max:8,spent:0}),feat("pool","Focus Point",{max:3,spent:3}),feat("old","Ki",{max:8,spent:0}),cls("class","Monk",5,"d8")]);
 const get=()=>availableOptions(all,f.actor).find(e=>e.presetKey==="harm");
 assert.ok(get().resourceError);assert.equal(get().resourceRequests[0].itemId,"pool");
 f.items.get("pool").system.uses={max:3,spent:0};f.items.get("pool").isOwner=false;assert.ok(get().resourceError);
 f.items.get("pool").isOwner=true;delete f.items.get("pool").system.uses;assert.ok(get().resourceError);
 f.items.set("duplicate",feat("duplicate","Focus Point",{max:3,spent:0}));assert.match(get().resourceError,/多個/);
});
test("dedicated resource labels identifiers and plural aliases are recognized",async()=>{
 for(const label of ["Focus Point","Focus Points"]) {
  const f=fixture([feat("ability","Hand of Harm",{max:8,spent:0}),cls("class","Monk",5,"d8")]);
  f.actor.system.resources={primary:{label,value:2,max:5}};
  const e=availableOptions(all,f.actor).find(e=>e.presetKey==="harm");
  replaceExtras(f.config,[e],new Set([0]));await consumptionWrapper(async()=>{})(f.config.rolls,f.config);
  assert.equal(f.actor.system.resources.primary.value,1);assert.equal(f.items.get("ability").system.uses.spent,0);
 }
 const f=fixture([feat("ability","Psionic Strike"),feat("pool","自訂譯名",{max:3,spent:0}),cls("class","Fighter",5,"d10")]);
 f.items.get("pool").system.identifier="psionic-energy-die";
 assert.equal(availableOptions(all,f.actor).find(e=>e.presetKey==="psionic").resourceRequests[0].itemId,"pool");
});
test("Flurry alternate remains independent of Focus Point and rejects a linked Focus Point pool",()=>{
 const flurry=feat("flurry","活殺自在",{max:3,spent:0});
 const f=fixture([feat("ability","Hand of Harm"),feat("focus","Focus Point",{max:11,spent:0}),cls("class","Monk",11,"d8"),flurry]);
 const list=()=>availableOptions(all,f.actor).filter(e=>["harm","harmFlurry"].includes(e.presetKey));
 assert.equal(list()[0].resourceRequests[0].itemId,"focus");assert.equal(list()[1].resourceRequests[0].itemId,"flurry");
 flurry.system.uses.max=0;flurry.system.activities={a:{id:"a",name:"Use",consumption:{targets:[{type:"itemUses",target:"focus",value:"1"}]}}};
 assert.match(list()[1].resourceError,/不可連結氣/);
});
