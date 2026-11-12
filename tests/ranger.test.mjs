import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,parseOptions,availableOptions,migrateOptions,replaceExtras} from '../scripts/options.mjs';
const entries=parseOptions(PRESETS.slice(7).map(p=>p.join(' | ')).join('\n'),{psychic:{},cold:{}},()=>true);
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
  assert.deepEqual(found.map(e=>e.formula),['1d6','2d6']);
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
  const next=migrateOptions(old,PRESETS.slice(7));
  assert.equal(next.split('\n').length,6);
  assert.equal(migrateOptions(next,PRESETS.slice(7)),next);
  assert.equal(migrateOptions('',PRESETS.slice(7)),'');
});
