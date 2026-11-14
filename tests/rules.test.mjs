import {test} from "node:test";
import assert from "node:assert/strict";
import {abilityMatches,objectMatchesAbility,damageConflictGroup} from "../scripts/rules.mjs";
import {conflictGroup} from "../scripts/settings.mjs";
import {replaceExtras} from "../scripts/options.mjs";
test("shared name matcher covers wrappers and known prefixes without matching unrelated children",()=>{
 for(const name of ["奪命之手 (Hand of Harm)","【Hand of Harm】","Hand of Harm","hand-of-harm"])assert.ok(abilityMatches(name,["Hand of Harm"]));
 assert.ok(objectMatchesAbility({system:{identifier:"hand-of-harm"}},["Hand of Harm"]));
 assert.ok(abilityMatches("Eldritch Invocations: Eldritch Smite",["Eldritch Smite"]));
 assert.equal(abilityMatches("Sneak Attack: Withdraw",["Sneak Attack"]),false);
 assert.equal(abilityMatches("---",["---"]),false);
});
test("UI and roll building share one conflict rule for every mutually exclusive pair",()=>{
 for(const keys of [["harm","harmFlurry"],["divineStrike","clericPotent"],["primal","druidPotent"]]){
  const entries=keys.map(presetKey=>({presetKey,label:presetKey,formula:"1d8",type:"radiant"}));
  assert.equal(conflictGroup(entries[0]),damageConflictGroup(entries[1]));
  for(const pair of [entries,[...entries].reverse()]){
   const c={rolls:[{parts:["1d6"],options:{type:"radiant"}}]};replaceExtras(c,pair,new Set([0,1]));
   assert.equal(c.rolls.length,2);assert.equal(c.rolls[1].options.flavor,pair[0].label);
  }
 }
});
