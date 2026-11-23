import {test} from "node:test";
import assert from "node:assert/strict";
import {finalizeCriticalExtras} from "../scripts/critical.mjs";
import {replaceExtras} from "../scripts/options.mjs";

const savage = {label: "Savage Attacks", formula: "1d8", type: "inherit", requiresCritical: true, noCritical: true};
const sneak = {label: "Sneak Attack", formula: "2d6", type: "inherit"};

function prepare(initialCritical) {
  const config = {isCritical: initialCritical, rolls: [{parts: ["1d8"], options: {type: "slashing"}}]};
  replaceExtras(config, [savage, sneak], new Set([0, 1]));
  return config;
}

test("a critical chosen after a normal preview keeps one Savage die and normal critical rules for other rolls", () => {
  const {rolls} = prepare(false);
  // Both supported native dialogs overwrite every roll flag when the button is clicked.
  for (const roll of rolls) roll.options.isCritical = true;
  finalizeCriticalExtras(rolls);
  assert.equal(rolls.length, 3);
  assert.equal(rolls[1].parts[0], "1d8");
  assert.deepEqual(rolls[1].options.critical, {
    bonusDice: 0, bonusDamage: "", multiplier: 1, powerfulCritical: false, multiplyNumeric: false
  });
  assert.deepEqual(rolls[2].options.critical, {bonusDice: 0, bonusDamage: ""});
});

test("a normal submission after a critical preview removes only the module's critical-only rolls", () => {
  const config = prepare(true);
  const [weapon, , otherExtra] = config.rolls;
  const thirdParty = {options: {optionalDamageCriticalOnly: true}};
  config.rolls.push(thirdParty);
  for (const roll of config.rolls) roll.options.isCritical = false;
  // In DND5e 5.0 config.isCritical still describes the initial preview.
  finalizeCriticalExtras(config.rolls);
  assert.deepEqual(config.rolls, [weapon, otherExtra, thirdParty]);
});
