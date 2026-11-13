import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumptionWrapper} from '../scripts/consumption.mjs';
import {PRESETS,parseOptions,availableOptions,migrateOptions,replaceExtras} from '../scripts/options.mjs';
const entries=parseOptions(PRESETS.slice(7,12).map(p=>p.join(' | ')).join('\n'),{psychic:{},cold:{}},()=>true);
const feat=(name,system={})=>({id:name,type:'feat',name,isOwner:true,system});
const ranger=level=>({type:'class',name:'Ranger',system:{levels:level}});
const subclass=name=>({type:'subclass',name});
test('same Chinese name uses subclass and requires actual feature',()=>{
  for(const [name,formula] of [['Fey Wanderer','1d4'],['Gloom Stalker','2d6']]) {
    const actor={items:[ranger(3),subclass(name),feat('恐懼打擊',{uses:{max:3,spent:0}})]};
    const found=availableOptions(entries,actor);
    assert.equal(found.length,1);assert.equal(found[0].formula,formula);
    assert.ok(!found[0].disabledReason);
    actor.items.pop();assert.equal(availableOptions(entries,actor).length,0);
  }
});
test('English singular/plural or identifiers distinguish both without subclass',()=>{
  const actor={items:[ranger(11),feat('Dreadful Strikes'),feat('Dreadful Strike',{uses:{max:2,spent:1}})]};
  const found=availableOptions(entries,actor);
  assert.deepEqual(found.map(e=>e.formula),['1d6','2d8']);
  assert.deepEqual(found.map(e=>e.consumes),[false,true]);
  actor.items[1].name='恐懼打擊';actor.items[1].system.identifier='dreadful-strikes';
  assert.equal(availableOptions(entries,actor).length,2);
});
test('ambiguous Chinese-only name is disabled rather than charged as wrong feature',()=>{
  const items=[ranger(3),feat('恐懼打擊',{uses:{max:3,spent:0}})];
  for(const subclasses of [[],[subclass('Fey Wanderer'),subclass('Gloom Stalker')]]) {
    const found=availableOptions(entries,{items:[...items,...subclasses]});
    assert.equal(found.length,2);assert.ok(found.every(e=>e.disabledReason));
  }
});
test('fey and polar use ranger rather than total level, transition at 11',()=>{
  for(const [level,formula] of [[3,'1d4'],[10,'1d4'],[11,'1d6'],[20,'1d6']]) {
    const found=availableOptions(entries,{items:[ranger(level),{type:'class',name:'Fighter',system:{levels:10}},feat('Dreadful Strikes'),feat('Polar Strikes')]});
    assert.deepEqual(found.map(e=>e.formula),[formula,formula]);
  }
  assert.deepEqual(availableOptions(entries,{items:[feat('Polar Strikes')]}),[]);
});
test('gloom requires configured uses and binds the matching item',()=>{
  const item=feat('Dreadful Strike',{uses:{max:3,spent:3}});
  assert.ok(availableOptions(entries,{items:[item]})[0].disabledReason);
  item.system.uses.spent=0;
  const found=availableOptions(entries,{items:[item]});
  const config={rolls:[{options:{type:'piercing'}}]};
  replaceExtras(config,found,new Set([0]));
  assert.equal(config.rolls[1].options.optionalDamageSource,item.id);
  assert.equal(availableOptions(entries,{items:[item]},item.id).length,0);
});
test('colossus inherits damage; firearm only appears for spell damage',()=>{
  const actor={items:[feat('Colossus Slayer'),feat('Arcane Firearm'),{id:'spell',type:'spell',name:'Fire Bolt'},{id:'weapon',type:'weapon'}]};
  assert.equal(availableOptions(entries,actor,'weapon').length,1);
  const found=availableOptions(entries,actor,'spell');
  assert.equal(found.length,2);assert.ok(found.every(e=>e.formula==='1d8'&&e.type==='inherit'));
});
test('migration adds both same-name presets once and keeps empty list disabled',()=>{
  const old='Custom | 1d6 | cold';
  const next=migrateOptions(old,PRESETS.slice(7,12));
  assert.equal(next.split('\n').length,6);
  assert.equal(migrateOptions(next,PRESETS.slice(7,12)),next);
  assert.equal(migrateOptions('',PRESETS.slice(7,12)),'');
});
test('Hunter parent names and identifier expose Colossus with an explicit selection reminder',()=>{
  for(const item of [feat("Hunter's Prey"),feat('Hunter’s Prey'),feat('獵殺技藝'),feat('自訂名稱',{identifier:'hunters-prey'})]) {
    const found=availableOptions(entries,{items:[item]});
    assert.equal(found.length,1);assert.equal(found[0].formula,'1d8');
    assert.equal(found[0].type,'inherit');assert.match(found[0].note,/滅族者/);
    assert.ok(!found[0].disabledReason);
  }
  assert.equal(availableOptions(entries,{items:[feat('Other',{description:{value:"Hunter's Prey Colossus Slayer"}})]}).length,0);
});
test('Hunter parent plus standalone Colossus produces one option, not a duplicate error',()=>{
  const found=availableOptions(entries,{items:[feat("Hunter's Prey"),feat('Colossus Slayer')]});
  assert.equal(found.length,1);assert.ok(!found[0].disabledReason);
});
test('Dread Ambusher parent exposes only gloom without separate subclass and owns the debit',async()=>{
  for(const name of ['Dread Ambusher','恐懼伏擊']) {
    const parent=feat(name,{uses:{max:2,spent:0}});
    const child=feat('Dreadful Strike',{uses:{max:2,spent:0}});
    const items=new Map([[parent.id,parent],[child.id,child]]);
    items[Symbol.iterator]=items.values.bind(items);
    const actor={uuid:'Actor.parent',items,async updateEmbeddedDocuments(type,changes){
      changes.forEach(c=>items.get(c._id).system.uses.spent=c['system.uses.spent']);return changes;
    }};
    const found=availableOptions(entries,actor);
    assert.equal(found.length,1);assert.equal(found[0].formula,'2d6');
    assert.equal(found[0].sourceItemId,parent.id);assert.ok(!found[0].disabledReason);
    const config={subject:{actor},rolls:[{options:{type:'piercing'}}]};
    replaceExtras(config,found,new Set([0]));
    await consumptionWrapper(async()=>{})(config.rolls,config);
    assert.equal(parent.system.uses.spent,1);assert.equal(child.system.uses.spent,0);
    assert.equal(availableOptions(entries,actor,parent.id).length,0);
    assert.equal(availableOptions(entries,actor,child.id).length,0);
    parent.system.uses.spent=2;
    assert.ok(availableOptions(entries,actor)[0].disabledReason);
  }
});
test('Dread parent identifier works; legacy parent without charges remains disabled',()=>{
  const item=feat('自訂伏擊',{identifier:'dread-ambusher',uses:{max:2,spent:0}});
  assert.equal(availableOptions(entries,{items:[item]})[0].formula,'2d6');
  delete item.system.uses;
  assert.ok(availableOptions(entries,{items:[item]})[0].disabledReason);
});
