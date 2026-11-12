import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOptions, replaceExtras} from '../scripts/options.mjs';
import {DEFAULTS, availableOptions, migrateOptions, migrateAncestryAliases, inheritedType} from '../scripts/options.mjs';
const presets = parseOptions(DEFAULTS, {force:{}, necrotic:{}, fire:{}, cold:{},radiant:{}}, () => true);
test('giant ancestry Fire and Frost select only their own preset', () => {
  for (const [name, type] of [['Giant Ancestry (Fire)', 'fire'], ['Giant Ancestry (Frost)', 'cold']]) {
    const found = availableOptions(presets, {items:[{type:'feat', name}]});
    assert.equal(found.length, 1);
    assert.equal(found[0].type, type);
  }
  for (const name of ['Giant Ancestry', 'Giant Ancestry (Storm)']) {
    assert.deepEqual(availableOptions(presets, {items:[{type:'feat', name}]}), []);
  }
});
test('ancestry migration extends saved aliases without changing damage or resurrecting removed rows', () => {
  const old = "火之燃燒 | 2d10 | fire | Fire's Burn;自訂火焰\n霜之寒冷 | 2d6 | cold | Frost's Chill";
  const next = migrateAncestryAliases(old);
  assert.ok(next.includes("2d10 | fire | Fire's Burn;自訂火焰;Giant Ancestry (Fire)"));
  assert.ok(next.includes('Giant Ancestry (Frost)'));
  assert.equal(migrateAncestryAliases(next), next);
  assert.equal(migrateAncestryAliases(''), '');
  assert.equal(migrateAncestryAliases('自製 | 1d6 | fire'), '自製 | 1d6 | fire');
});
test('show only owned spells and feats, never descriptions or equipment', () => {
  const actor = {items: [
    {type:'spell', name:'脆弱詛咒 (Hex)'},
    {type:'weapon', name:'獵人印記'},
    {type:'feat', name:'其他', system:{description:{value:"Fire's Burn"}}}
  ]};
  assert.deepEqual(availableOptions(presets, actor).map(e=>e.label), ['脆弱詛咒']);
  assert.deepEqual(availableOptions(presets, null), []);
  assert.deepEqual(availableOptions(presets, {items:[]}), []);
});
test('English curly apostrophes, identifiers and parenthesized ancestry match', () => {
  const actor = {items:[{type:'feat',name:'Fire’s Burn (Fire Giant)'}, {type:'spell',name:'自訂譯名',system:{identifier:'hunters-mark'}}]};
  assert.deepEqual(availableOptions(presets, actor).map(e=>e.type), ['force','fire']);
});
test('sneak attack uses rogue levels, not combined character level', () => {
  for (const [level, expected] of [[1,'1d6'],[2,'1d6'],[3,'2d6'],[9,'5d6'],[20,'10d6']]) {
    const actor = {items:[{type:'feat',name:'偷襲'}, {type:'class',name:'遊蕩者',system:{levels:level}}, {type:'class',name:'Fighter',system:{levels:10}}]};
    assert.equal(availableOptions(presets, actor)[0].formula, expected);
  }
  assert.deepEqual(availableOptions(presets, {items:[{type:'feat',name:'Sneak Attack: Withdraw'}]}), []);
  assert.deepEqual(availableOptions(presets, {items:[{type:'feat',name:'Sneak Attack'}]}), []);
});
test('migration preserves custom entries, does not duplicate presets, preserves disabled list', () => {
  const old = '獵人印記 | 2d6 | force\n自製 | 1d8 | fire';
  const next = migrateOptions(old);
  assert.ok(next.startsWith(old));
  assert.equal(next.split('\n').length, 8);
  assert.equal(migrateOptions(next), next);
  assert.equal(migrateOptions(''), '');
});
test('inherited damage follows current form selection and custom names are required', () => {
  assert.equal(inheritedType({rolls:[{options:{type:'piercing'}}]}, {get:()=> 'slashing'}), 'slashing');
  const rows=parseOptions('自製 | 1d8 | fire', types, ()=>true);
  assert.equal(availableOptions(rows,{items:[{type:'feat',name:'自製'}]}).length,1);
  assert.equal(availableOptions(rows,{items:[]}).length,0);
});
const types = {force: {}, fire: {}};
const entries = parseOptions('獵人印記 | 1d6 | force\n火焰 | 1d8 | fire', types, () => true);
test('reject malformed rows, unknown types and invalid dice', () => {
  assert.throws(() => parseOptions('印記 | 1d6 | typo', types, () => true));
  assert.throws(() => parseOptions('印記 | bad | force', types, () => false));
  assert.throws(() => parseOptions('印記 | 1d6', types, () => true));
  assert.deepEqual(parseOptions('\n ', types, () => true), []);
});
test('repeated toggle does not duplicate or alter original damage', () => {
  const base = {parts: ['1d8 + 3'], data: {prof: 3}, options: {type: 'slashing', properties: ['mgc']}};
  const config = {rolls: [base]};
  replaceExtras(config, entries, new Set([0]));
  replaceExtras(config, entries, new Set([0]));
  assert.equal(config.rolls.length, 2);
  assert.equal(config.rolls[0], base);
  assert.equal(config.rolls[1].options.type, 'force');
  assert.equal(config.rolls[1].data.prof, 3);
  replaceExtras(config, entries, new Set());
  assert.deepEqual(config.rolls, [base]);
});
test('multiple types remain distinct and critical bonuses are not duplicated', () => {
  const config = {isCritical: true, rolls: [{parts: ['1d8'], options: {critical: {bonusDice: 2}}}]};
  replaceExtras(config, entries, new Set([0, 1]));
  assert.deepEqual(config.rolls.slice(1).map(r => r.options.type), ['force', 'fire']);
  assert.equal(config.rolls[1].options.isCritical, true);
  assert.equal(config.rolls[1].options.critical.bonusDice, 0);
  assert.equal(config.rolls[0].options.critical.bonusDice, 2);
});
