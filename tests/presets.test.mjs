import {test} from "node:test";
import assert from "node:assert/strict";
import {PRESETS, DEFAULTS, parseOptions, availableOptions, replaceExtras, migrateOptions, migrateAncestryAliases} from "../scripts/options.mjs";
const types=Object.fromEntries(["force","fire","cold","radiant","necrotic","psychic","acid","poison","lightning","thunder"].map(t=>[t,{}]));
const entries=parseOptions(DEFAULTS,types,()=>true);
const feat=(name)=>({id:name,name,type:"feat",isOwner:true,system:{uses:{max:3,spent:0}}});
function actor(name,cls,level=20) {
 return {isOwner:true,items:[feat(name),...(cls?[{id:"class",type:"class",name:cls,system:{levels:level}}]:[])],
 system:{attributes:{prof:6},abilities:{int:{mod:4},wis:{mod:3},cha:{mod:5}}}};
}
function find(a,key,spell=false) {
 if(spell&&!a.items.some(i=>i.id==="spell"))a.items.push({id:"spell",name:"Test spell",type:"spell",system:{level:0}});
 return availableOptions(entries,a,spell?"spell":undefined).find(e=>e.presetKey===key);
}
test("30 additions, distinct keys and no repeated existing smites or ancestries",()=>{
 assert.equal(PRESETS.length,42);
 assert.equal(new Set(PRESETS.map(p=>p[0])).size,42);
 assert.equal(new Set(PRESETS.slice(12).map(p=>p[1])).size,30);
 assert.equal(PRESETS.filter(p=>p[1]==="eldritch").length,1);
});
test("class scaling and minimum levels",()=>{
 assert.equal(find(actor("Brutal Strike","Barbarian",9),"brutal").formula,"1d10");
 assert.equal(find(actor("Brutal Strike","Barbarian",17),"brutal").formula,"2d10");
 assert.equal(find(actor("Brutal Strike","Barbarian",8),"brutal"),undefined);
 assert.equal(find(actor("Frenzy","Barbarian",3),"frenzy").formula,"2d6");
 assert.equal(find(actor("Frenzy","Barbarian",16),"frenzy").formula,"4d6");
 assert.equal(find(actor("Hand of Harm","Monk",11),"harm").formula,"1d10 + 3");
 assert.equal(find(actor("Pull of Death","Cleric",11),"pull").formula,"1d6");
});
test("potent spellcasting distinguishes classes and leaves cleric conditions to player",()=>{
 const a=actor("Potent Spellcasting","Cleric",7);
 assert.ok(find(a,"clericPotent",true));assert.equal(find(a,"druidPotent",true),undefined);
 a.items.find(i=>i.id==="spell").system.level=1;
 assert.ok(find(a,"clericPotent",true));
 assert.equal(find(actor("Alchemical Savant","Artificer",5),"savant"),undefined);
});
test("choice-dependent damage blocked until chosen",()=>{
 const e=find(actor("Divine Fury","Barbarian",5),"fury");
 assert.deepEqual(e.choices.map(c=>c.type),["radiant","necrotic"]);
 const config={rolls:[{parts:["1d8"],options:{type:"slashing"}}]};
 replaceExtras(config,[e],new Set([0]));assert.equal(config.rolls.length,1);
 Object.assign(e,e.choices[1],{choicePending:false});
 replaceExtras(config,[e],new Set([0]));assert.equal(config.rolls[1].options.type,"necrotic");
});
test("Savage Attacks critical-only extra die is not doubled",()=>{
 const e=find(actor("Savage Attacks"),"savage");
 Object.assign(e,e.choices[2],{choicePending:false});
 const c={rolls:[{parts:["1d8"],options:{type:"piercing"}}]};
 replaceExtras(c,[e],new Set([0]));assert.equal(c.rolls.length,1);
 c.isCritical=true;replaceExtras(c,[e],new Set([0]));
 assert.equal(c.rolls[1].parts[0],"1d8");assert.equal(c.rolls[1].options.isCritical,false);
});
test("Arcane Jolt charge binding exhaustion and direct roll exclusion",()=>{
 const a=actor("Arcane Jolt","Artificer",15),e=find(a,"jolt");
 assert.equal(e.formula,"4d6");assert.equal(e.consumes,true);assert.equal(e.sourceItemId,"Arcane Jolt");
 a.items[0].system.uses.spent=3;assert.ok(find(a,"jolt").disabledReason);
 assert.equal(availableOptions(entries,a,"Arcane Jolt").some(e=>e.presetKey==="jolt"),false);
});
test("odd proficiency rounding choice and multiclass mixed hit dice",()=>{
 const a=actor("Thug","Rogue",6);a.system.attributes.prof=3;
 assert.deepEqual(find(a,"thug").choices.map(c=>c.formula),["1d6","2d6"]);
 const b=actor("Spellfire Adept","Cleric",8);b.items[1].system.hd={denomination:"d8"};
 b.items.push({type:"class",name:"Wizard",system:{levels:2,hd:{denomination:"d6"}}});
 assert.ok(find(b,"spellfire",true).choices.some(c=>c.formula==="1d8 + 1d6"));
});
test("manual costs and recipient inspiration die choice",()=>{
 assert.match(find(actor("Psionic Strike","Fighter",5),"psionic").note,/自動/);
 const e=availableOptions(parseOptions("戰鬥激勵 | preset:inspiration | inherit | Combat Inspiration",types,()=>true),actor("Combat Inspiration"))[0];
 assert.equal(e.choices.length,4);assert.ok(e.choicePending);
});
test("migration preserves custom rows and empty lists and is idempotent",()=>{
 const old="Custom | 1d6 | cold\nDivine Fury | 3d8 | radiant",next=migrateOptions(old,PRESETS.slice(12));
 assert.equal(next.split("\n").length,31);assert.equal(migrateOptions(next,PRESETS.slice(12)),next);
 assert.ok(next.startsWith(old));assert.equal(migrateOptions("",PRESETS.slice(12)),"");
 assert.match(migrateAncestryAliases("霜之寒冷 | 1d6 | cold | Giant Ancestry (Frost)"),/霜之刺骨/);
});
test("descriptions do not grant abilities; launcher weapon detection",()=>{
 const a=actor("Other","Artificer",3);a.items[0].system.description={value:"Arcane Jolt"};
 assert.equal(find(a,"jolt"),undefined);
 a.items.push({id:"launcher",type:"weapon",name:"Lightning Launcher"});
 assert.ok(availableOptions(entries,a,"launcher").some(e=>e.presetKey==="launcher"));
});
