import {test} from "node:test";
import assert from "node:assert/strict";
import {hasAutomaticSavageDamage} from "../scripts/savage-effect.mjs";

function fixture() {
  const actor = {uuid: "Actor.orc", flags: {dnd5e: {meleeCriticalDamageDice: 1}}};
  const feature = {documentName: "Item", uuid: actor.uuid + ".Item.savage", name: "野蠻攻擊", type: "feat"};
  const effect = {name: "Savage Attacks", parent: feature, transfer: true,
    changes: [{key: "flags.dnd5e.meleeCriticalDamageDice", mode: 2, value: "1"}]};
  const primary = {base: true, options: {critical: {bonusDice: 1}}};
  const config = {subject: {getActionType: mode => mode === "thrown" ? "rwak" : "mwak", damage: {includeBase: true}}, rolls: [primary]};
  actor.appliedEffects = [effect];
  return {actor, feature, effect, primary, config, recognized: () => hasAutomaticSavageDamage(actor, feature, config)};
}

test("the native transferred ADD 1 on a Chinese Savage Attacks card covers a melee critical", () => {
  const f = fixture();
  assert.equal(f.recognized(), true);
  f.config.attackMode = "thrown";
  assert.equal(f.recognized(), false);
});

test("a disabled, suppressed, inactive or non-applied effect does not block the manual choice", () => {
  for (const field of ["disabled", "isSuppressed", "active"]) {
    const f = fixture();
    f.effect[field] = field !== "active";
    assert.equal(f.recognized(), false);
  }
  const f = fixture();
  f.actor.appliedEffects = [];
  f.feature.effects = [f.effect];
  assert.equal(f.recognized(), false);
  delete f.actor.appliedEffects;
  f.effect.transfer = false;
  assert.equal(f.recognized(), false);
  f.effect.transfer = true;
  assert.equal(f.recognized(), true);
  f.feature.areEffectsSuppressed = true;
  assert.equal(f.recognized(), false);
});

test("a bonus on another feature is not evidence that Savage Attacks is included", () => {
  const f = fixture();
  const other = {documentName: "Item", uuid: "Actor.orc.Item.brutal", name: "Brutal Critical"};
  f.effect.parent = other;
  assert.equal(f.recognized(), false);
  f.effect.parent = f.actor;
  f.effect.origin = other.uuid;
  assert.equal(f.recognized(), false);
  f.effect.origin = f.feature.uuid;
  f.effect.name = "Another localized label";
  assert.equal(f.recognized(), true);
  f.effect.origin = null;
  assert.equal(f.recognized(), false);
  f.effect.name = "凶蠻攻擊";
  assert.equal(f.recognized(), true);
});

test("only a positive additive change to the melee critical die flag is recognized", () => {
  for (const change of [{mode:5}, {value:0}, {value:-1}, {value:"@prof"}, {key:"system.bonuses.mwak.damage"}]) {
    const f = fixture();
    Object.assign(f.effect.changes[0], change);
    assert.equal(f.recognized(), false);
  }
});

test("only the base weapon bonus counts, and a known zero or unrelated bonus remains manual", () => {
  const f = fixture();
  f.primary.options.critical.bonusDice = 0;
  f.config.rolls.unshift({options:{critical:{bonusDice:1}}});
  f.config.rolls.push({options:{"optional-damage":true, critical:{bonusDice:1}}});
  assert.equal(f.recognized(), false);
  f.primary.options.critical.bonusDice = 1;
  f.actor.flags.dnd5e.meleeCriticalDamageDice = 0;
  assert.equal(f.recognized(), false);
});

test("a workflow that omits bonusDice needs a known melee base and a positive actor flag", () => {
  const f = fixture();
  delete f.primary.options.critical;
  delete f.primary.base;
  assert.equal(f.recognized(), true);
  f.config.subject.damage.includeBase = false;
  assert.equal(f.recognized(), false);
  f.config.subject.damage.includeBase = true;
  f.actor.flags.dnd5e.meleeCriticalDamageDice = 0;
  assert.equal(f.recognized(), false);
});
