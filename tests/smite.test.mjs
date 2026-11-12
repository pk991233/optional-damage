import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ID, DEFAULTS, PRESETS, parseOptions, availableOptions, replaceExtras, migrateOptions} from '../scripts/options.mjs';
import {spellSlots, smiteFormula} from '../scripts/smite.mjs';
import {consumptionWrapper} from '../scripts/consumption.mjs';
const entries = parseOptions(DEFAULTS,{force:{},radiant:{},psychic:{},lightning:{},fire:{},cold:{},necrotic:{},lightning:{}},s=>/^\d+d\d+$/.test(s));
function setup() {
  const items = new Map([
    ['d',{id:'d',name:'Divine Smite',type:'spell'}],
    ['e',{id:'e',name:'Eldritch Smite',type:'feat'}],
    ['f',{id:'f',name:'Giant Ancestry (Fire)',type:'feat',isOwner:true,system:{uses:{max:3,spent:0}}}]
  ]);
  items[Symbol.iterator] = items.values.bind(items);
  const actor = {uuid:'Actor.smite',isOwner:true,items,system:{spells:{
    spell1:{max:4,value:2},spell3:{max:2,value:1},spell9:{max:1,value:1},pact:{max:2,value:2,level:3}
  }}, async update(changes) {
    for (const [path,value] of Object.entries(changes)) this.system.spells[path.split('.')[2]].value=value;
    return this;
  }, async updateEmbeddedDocuments(type,changes) {
    changes.forEach(c=>items.get(c._id).system.uses.spent=c['system.uses.spent']); return changes;
  }};
  const config={subject:{actor},rolls:[{parts:['1d8'],options:{type:'slashing'}}]};
  return {actor,config};
}
function selected(actor,config,kinds) {
  const list=availableOptions(entries,actor).filter(e=>kinds.includes(e.smite));
  replaceExtras(config,list,new Set(list.map((_,i)=>i)));
  return config.rolls;
}
test('only owned abilities show; direct smite source is excluded; slots restricted by kind',()=>{
  const {actor}=setup();
  assert.deepEqual(spellSlots(actor,'eldritch').map(s=>s.key),['pact']);
  assert.deepEqual(spellSlots(actor,'divine').map(s=>s.key),['spell1','spell3','spell9','pact']);
  assert.ok(!availableOptions(entries,actor,'d').some(e=>e.smite==='divine'));
  actor.items.delete('e');
  assert.ok(!availableOptions(entries,actor).some(e=>e.smite==='eldritch'));
});
test('2024 divine scales from 2d8 to 10d8 and target adds exactly one d8',()=>{
  const {actor}=setup(); const e=availableOptions(entries,actor).find(e=>e.smite==='divine');
  assert.equal(smiteFormula(e),'2d8');
  e.slotKey='spell3'; assert.equal(smiteFormula(e),'4d8');
  e.specialTarget=true; assert.equal(smiteFormula(e),'5d8');
  e.slotKey='spell9'; assert.equal(smiteFormula(e),'11d8');
  e.slotKey='pact'; assert.equal(smiteFormula(e),'5d8');
});
test('eldritch uses pact level plus one and ignores special-target flag',()=>{
  const {actor}=setup(); const e=availableOptions(entries,actor).find(e=>e.smite==='eldritch');
  e.specialTarget=true; assert.equal(smiteFormula(e),'4d8');
  actor.system.spells.pact.value=0;
  assert.ok(availableOptions(entries,actor).find(e=>e.smite==='eldritch').disabledReason);
});
test('selected pools debit independently, once even on critical/re-evaluation',async()=>{
  const {actor,config}=setup(); config.isCritical=true;
  const rolls=selected(actor,config,['divine','eldritch']);
  assert.equal(rolls[1].options.isCritical,true);
  const evaluate=consumptionWrapper(async()=>{});
  await evaluate(rolls,config); await evaluate(rolls,config);
  assert.equal(actor.system.spells.spell1.value,1);
  assert.equal(actor.system.spells.pact.value,1);
});
test('two smites on one pact pool need two slots and insufficient funds stop before dice',async()=>{
  const {actor,config}=setup();
  const list=availableOptions(entries,actor).filter(e=>e.smite);
  list.forEach(e=>e.slotKey='pact');
  replaceExtras(config,list,new Set([0,1]));
  actor.system.spells.pact.value=1;
  let calls=0; const evaluate=consumptionWrapper(async()=>{calls++;});
  await assert.rejects(evaluate(config.rolls,config)); assert.equal(calls,0);
  assert.equal(actor.system.spells.pact.value,1);
  actor.system.spells.pact.value=2;
  await evaluate(config.rolls,config); assert.equal(actor.system.spells.pact.value,0);
});
test('cancel, preview, failed evaluation, missing ability and changed pact level never debit',async()=>{
  const {actor,config}=setup(); const rolls=selected(actor,config,['eldritch']);
  const evaluate=consumptionWrapper(async()=>{});
  await evaluate([],config); await evaluate(rolls,{...config,evaluate:false});
  await assert.rejects(consumptionWrapper(async()=>{throw Error('dice');})(rolls,config));
  actor.system.spells.pact.level=4;
  await assert.rejects(evaluate(rolls,config));
  actor.system.spells.pact.level=3; actor.items.delete('e');
  await assert.rejects(evaluate(rolls,config)); assert.equal(actor.system.spells.pact.value,2);
});
test('last slot cannot be spent twice in concurrent same-browser dialogs',async()=>{
  const {actor,config}=setup(); actor.system.spells.spell1.value=1;
  const rolls=selected(actor,config,['divine']);
  const second=structuredClone(rolls);
  const evaluate=consumptionWrapper(async()=>{});
  const result=await Promise.allSettled([evaluate(rolls,config),evaluate(second,config)]);
  assert.deepEqual(result.map(r=>r.status),['fulfilled','rejected']);
  assert.equal(actor.system.spells.spell1.value,0);
});
test('slot write failure prevents item debit; item write failure refunds slot debit',async()=>{
  const {actor,config}=setup();
  const list=availableOptions(entries,actor).filter(e=>e.smite==='divine'||e.consumes);
  replaceExtras(config,list,new Set([0,1]));
  const update=actor.update;
  actor.update=async()=>{throw Error('slot save');};
  await assert.rejects(consumptionWrapper(async()=>{})(config.rolls,config));
  assert.equal(actor.items.get('f').system.uses.spent,0);
  actor.update=update; actor.updateEmbeddedDocuments=async()=>{throw Error('item save');};
  await assert.rejects(consumptionWrapper(async()=>{})(config.rolls,config));
  assert.equal(actor.system.spells.spell1.value,2);
});
test('migration adds only smites, preserves deleted presets/custom formulas and empty list',()=>{
  const old='Custom | 1d6 | force';
  const next=migrateOptions(old,PRESETS.slice(5,7));
  assert.equal(next.split('\n').length,3);
  assert.equal(migrateOptions(next,PRESETS.slice(5,7)),next);
  assert.equal(migrateOptions('',PRESETS.slice(5,7)),'');
  const custom='Divine Smite | 3d8 | radiant';
  assert.ok(migrateOptions(custom,PRESETS.slice(5,7)).startsWith(custom));
});
test('Document.update may replace dotted keys with nested data without breaking verification or refunds',async()=>{
  const {actor,config}=setup();
  const update=actor.update;
  actor.update=async function(data) {
    await update.call(this,data);
    const nested={};
    for(const [path,value] of Object.entries(data)) {
      nested[path.split('.')[2]]={value}; delete data[path];
    }
    data.system={spells:nested};
    return this;
  };
  const rolls=selected(actor,config,['divine','eldritch']);
  await consumptionWrapper(async()=>{})(rolls,config);
  assert.equal(actor.system.spells.spell1.value,1);
  assert.equal(actor.system.spells.pact.value,1);
  const list=availableOptions(entries,actor).filter(e=>e.smite==='divine'||e.consumes);
  replaceExtras(config,list,new Set([0,1]));
  actor.updateEmbeddedDocuments=async()=>{throw Error('item save');};
  await assert.rejects(consumptionWrapper(async()=>{})(config.rolls,config),/item save/);
  assert.equal(actor.system.spells.spell1.value,1);
});
