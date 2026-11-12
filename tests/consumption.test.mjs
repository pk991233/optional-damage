import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumptionWrapper} from '../scripts/consumption.mjs';
import {ID, DEFAULTS, parseOptions, availableOptions, replaceExtras} from '../scripts/options.mjs';
const presets = parseOptions(DEFAULTS, {force:{},necrotic:{},fire:{},cold:{},radiant:{}}, () => true);
function setup(spent = 0) {
  const items = new Map(['Fire','Frost'].map(name => [name, {id:name,type:'feat',name:`Giant Ancestry (${name})`,isOwner:true,system:{uses:{max:3,spent}}}]));
  const actor = {uuid:'Actor.test',items,async updateEmbeddedDocuments(type, changes) {
    changes.forEach(c => items.get(c._id).system.uses.spent = c['system.uses.spent']);
    return changes;
  }};
  // Foundry Collection iterates values rather than Map entries.
  items[Symbol.iterator] = items.values.bind(items);
  const config = {subject:{actor},rolls:[{options:{type:'slashing'}}]};
  return {actor,config,items};
}
const roll = id => ({options:{[ID]:true,optionalDamageSource:id,isCritical:true}});
test('two ancestries map to separate sources and direct feature use excludes itself', () => {
  const {actor,config} = setup();
  const entries = availableOptions(presets,actor);
  assert.deepEqual(entries.map(e => e.sourceItemId), ['Fire','Frost']);
  replaceExtras(config,entries,new Set([0,1]));
  assert.deepEqual(config.rolls.slice(1).map(r=>r.options.optionalDamageSource), ['Fire','Frost']);
  assert.deepEqual(availableOptions(presets,actor,'Fire').map(e=>e.sourceItemId), ['Frost']);
});
test('critical and repeated evaluate charge each selected source once', async () => {
  const {config,items} = setup();
  const evaluate = consumptionWrapper(async()=>{});
  const rolls = [roll('Fire'),roll('Frost')];
  await evaluate(rolls,config); await evaluate(rolls,config);
  assert.deepEqual([...items].map(i=>i.system.uses.spent),[1,1]);
});
test('cancel, preview and failed dice evaluation do not consume', async () => {
  const {config,items} = setup();
  const evaluate = consumptionWrapper(async()=>{});
  await evaluate([],config);
  await evaluate([roll('Fire')],{...config,evaluate:false});
  await assert.rejects(consumptionWrapper(async()=>{throw Error('dice');})([roll('Fire')],config));
  assert.equal(items.get('Fire').system.uses.spent,0);
});
test('exhausted source rejects whole selection before dice; other resource untouched', async () => {
  const {actor,config,items} = setup(); items.get('Frost').system.uses.spent = 3;
  assert.ok(availableOptions(presets,actor)[1].disabledReason);
  let evaluated = false;
  await assert.rejects(consumptionWrapper(async()=>{evaluated=true;})([roll('Fire'),roll('Frost')],config));
  assert.equal(evaluated,false); assert.equal(items.get('Fire').system.uses.spent,0);
});
test('same-browser concurrent dialogs cannot both consume final use', async () => {
  const {config,items} = setup(2);
  const evaluate = consumptionWrapper(async()=>Promise.resolve());
  const result = await Promise.allSettled([evaluate([roll('Fire')],config),evaluate([roll('Fire')],config)]);
  assert.deepEqual(result.map(r=>r.status),['fulfilled','rejected']);
  assert.equal(items.get('Fire').system.uses.spent,3);
});
test('missing resources, permission, duplicate features and failed persistence are rejected', async () => {
  const {actor,config,items} = setup();
  items.get('Fire').isOwner=false;
  assert.ok(availableOptions(presets,actor)[0].disabledReason);
  await assert.rejects(consumptionWrapper(async()=>{})([roll('Fire')],config));
  items.get('Fire').isOwner=true;
  items.set('duplicate',{...items.get('Fire'),id:'duplicate'});
  assert.ok(availableOptions(presets,actor)[0].disabledReason);
  actor.updateEmbeddedDocuments=async()=>{throw Error('save');};
  await assert.rejects(consumptionWrapper(async()=>{})([roll('Frost')],config));
  assert.equal(items.get('Frost').system.uses.spent,0);
});
test('punctuation aliases and colon subfeatures cannot match unrelated features', () => {
  assert.throws(()=>parseOptions('Test | 1d6 | fire | ---',{fire:{}},()=>true));
  assert.deepEqual(availableOptions(presets,{items:[{type:'feat',name:'Sneak Attack: Withdraw'},{type:'class',name:'Rogue',system:{levels:5}}]}),[]);
});
