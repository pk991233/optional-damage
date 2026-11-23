import {test} from "node:test";
import assert from "node:assert/strict";
import {weaponDamageDie} from "../scripts/weapon-die.mjs";

const weapon = {
  type: "weapon", system: {
    isVersatile: true,
    damage: {base: {number: 1, denomination: 8}, versatile: {number: 1, denomination: 10}}
  }
};
const attack = {type: "attack", item: weapon, damage: {includeBase: true}, actionType: "mwak"};
const base = (formula, options={}) => ({base:true, parts:[formula, "1d4", "@mod"], options});
const detect = (rolls, extras={}) => weaponDamageDie({subject:attack, rolls, ...extras});

test("read the actual marked weapon formula after versatile adjustment and before critical bonuses", () => {
  const bonus = {parts:["3d10"]};
  assert.equal(detect([bonus, base("2d6", {critical:{bonusDice:2, bonusDamage:"3d12"}})], {isCritical:true}), "1d6");
  assert.equal(detect([base("1d8"), bonus], {attackMode:"oneHanded"}), "1d8");
  assert.equal(detect([base("1d10"), bonus], {attackMode:"twoHanded"}), "1d10");
  assert.equal(detect([base("1d6"), base("2d8", {"optional-damage":true})]), "1d6");
});

test("single die size can include scalar modifiers, repeated dice of the same size or a Foundry data reference", t => {
  t.after(() => { if (previous) globalThis.Roll = previous; else delete globalThis.Roll; });
  const previous = globalThis.Roll;
  globalThis.Roll = {replaceFormulaData: (formula, data, {missing}) =>
    formula.replace(/@(\w+)/g, (_, key) => data[key] ?? missing)};
  assert.equal(detect([{...base("@damage + @mod"), data:{damage:"2d6", mod:3}}]), "1d6");
  assert.equal(detect([base("d8[slashing] + 1d8 + 2 - 3")]), "1d8");
  assert.equal(detect([base("1d6 + @unknown")]), undefined);
});

test("ambiguous, flat and unsupported formulas request manual selection", () => {
  for (const formula of ["1d8 + 1d4", "4", "0d8", "1d8 - 1d4", "{1d6,1d8}kh", "1d6 * 2", "1d6rr1"]) {
    assert.equal(detect([base(formula)]), undefined, formula);
  }
  assert.equal(detect([base("1d8"), base("1d8")]), undefined);
  assert.equal(detect([base("2d6")], {subject:{item:{type:"spell"}}}), undefined);
  assert.equal(detect([base("2d6")], {subject:{...attack, actionType:"rwak"}}), undefined);
  assert.equal(detect([base("2d6")], {ammunition:{system:{damage:{replace:true}}}}), undefined);
});

test("an unmarked roll needs a unique source row, confirmed weapon data and a known grip for a versatile weapon", () => {
  const unmarked = formula => ({parts:[formula, "2d4"]});
  const one = [unmarked("1d8")], two = [unmarked("1d10")];
  assert.equal(detect(one, {attackMode:"oneHanded"}), "1d8");
  assert.equal(detect(two, {attackMode:"twoHanded"}), "1d10");
  assert.equal(detect(two, {attackMode:"oneHanded"}), undefined);
  assert.equal(detect(one), undefined);
  assert.equal(detect([...one, ...two], {attackMode:"oneHanded"}), undefined);
  assert.equal(detect(one, {attackMode:"oneHanded", subject:{...attack, damage:{includeBase:false}}}), undefined);
  const fixed = {...attack, item:{type:"weapon", system:{isVersatile:false, damage:{base:{number:2, denomination:6}}}}};
  assert.equal(detect([unmarked("2d6")], {subject:fixed}), "1d6");
  fixed.item.system.damage.base.custom = {enabled:true};
  assert.equal(detect([unmarked("2d6")], {subject:fixed}), undefined);
});
