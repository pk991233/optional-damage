import {test} from "node:test";
import assert from "node:assert/strict";
import {availableOptions} from "../scripts/options.mjs";
import {combinedEntries} from "../scripts/settings.mjs";
import {entriesConflict} from "../scripts/rules.mjs";

const types = Object.fromEntries(["force","necrotic","lightning","fire","cold","radiant","psychic"].map(key => [key, {}]));
const entries = custom => combinedEntries({custom, disabled: []}, types, () => true);
const item = (id, type, name, system = {}) => ({id, type, name, system, isOwner: true});
const cls = (name, levels) => item(name, "class", name, {levels});
const feat = (name, system) => item(name, "feat", name, system);
const actor = items => ({items, system:{attributes:{prof:4}, abilities:{wis:{mod:3}}}});
function pick(items, source, activity, custom = "") {
  return availableOptions(entries(custom), actor(items), source, activity);
}

test("only the built-in hunter mark scales from the level-20 ranger feature", () => {
  const ranger = cls("Ranger", 20), mark = item("mark", "spell", "Hunter's Mark");
  const foe = feat("屠滅眾敵 Foe Slayer");
  const damage = (features, custom) => pick([ranger, mark, ...features], "bow", undefined, custom)[0].formula;
  assert.equal(damage([]), "1d6");
  assert.equal(damage([foe]), "1d10");
  assert.equal(damage([feat("Foe Slayer", {source:{rules:"2014"}})]), "1d6");
  assert.equal(damage([feat("Foe Slayer", {source:{book:"PHB (2014)"}})]), "1d6");
  assert.equal(damage([foe], "獵人印記 | 1d6 | force"), "1d6");
  ranger.system.levels = 19;
  assert.equal(damage([foe, cls("Fighter", 1)]), "1d6");
});

test("standalone and embedded launchers only apply to their own damage", () => {
  const gun = item("gun", "weapon", "Lightning Launcher");
  const strike = {name:"Infiltrator"}, punch = {name:"Thunder Gauntlets"};
  const armor = item("armor", "equipment", "Infiltrator", {activities:{strike,punch}});
  const items = [cls("Artificer", 3), gun, armor, item("sword", "weapon", "Longsword")];
  const has = (source, activity) => pick(items, source, activity).some(e => e.presetKey === "launcher");
  assert.ok(has("gun"));
  assert.ok(has("armor", strike));
  assert.equal(has("armor", punch), false);
  assert.equal(has("armor", {name:"Guardian"}), false);
  assert.ok(has("armor"));
  assert.equal(has("sword"), false);
});

test("recognize a chosen activity on the parent, and offer both for undecided clerics", () => {
  const features = [cls("Cleric", 7), feat("Blessed Strikes", {activities:{p:{name:"Potent Spellcasting"}}})];
  const keys = () => pick(features, "weapon").map(e => e.presetKey);
  assert.deepEqual(keys(), ["clericPotent"]);
  features[1].system.activities.s = {name:"Divine Strike"};
  assert.deepEqual(keys(), ["divineStrike","clericPotent"]);
  features[1].system.activities = {};
  assert.deepEqual(keys(), ["divineStrike","clericPotent"]);
});

test("class provenance disambiguates potent spellcasting without granting a second bonus", () => {
  const druid = cls("Druid", 7), cleric = cls("Cleric", 7), potent = feat("Potent Spellcasting");
  const spell = item("spell", "spell", "Cantrip", {level:0}), items = [druid, cleric, potent, spell];
  const available = () => pick(items, "spell").filter(e => ["clericPotent","druidPotent"].includes(e.presetKey));
  for (const provenance of ["flags", "objectFlag", "rootItem", "requirements"]) {
    potent.flags = {dnd5e:{advancementRoot:provenance === "flags" ? "Druid.adv" : provenance === "objectFlag" ? {itemId:"Druid"} : undefined}};
    potent.advancementRootItem = provenance === "rootItem" ? {type:"subclass", class:druid} : undefined;
    potent.system.requirements = provenance === "requirements" ? "Druid 7" : "";
    assert.deepEqual(available().map(e => e.presetKey), ["druidPotent"]);
  }
  potent.flags = {}; potent.system.requirements = "";
  const ambiguous = available();
  assert.equal(ambiguous.length, 2);
  assert.ok(entriesConflict(...ambiguous));
  assert.equal(entriesConflict(ambiguous[0], {...ambiguous[1], sourceItemId:"different"}), false);
  spell.system.classIdentifier = "cleric";
  assert.deepEqual(available().map(e => e.presetKey), ["clericPotent"]);
});

test("parent and child direct damage cannot add the same ranger rider", () => {
  for (const [parent, child] of [["Hunter's Prey", "Colossus Slayer"], ["Frigid Explorer","Polar Strikes"]]) {
    const items = [feat(parent), feat(child), cls("Ranger", 11)];
    assert.equal(pick(items, parent).length, 0);
    assert.equal(pick(items, child).length, 0);
    assert.equal(pick(items, "weapon").length, 1);
  }
});

test("standalone Assassination ignores its imported counter and remains distinct from Assassin's Assassinate", () => {
  const rogue = cls("Rogue", 6);
  const ability = feat("Assassination", {uses:{max:1,spent:1}});
  const riders = pick([rogue, ability, feat("Assassinate")], "weapon");
  const thug = riders.find(e => e.presetKey === "thug");
  assert.equal(thug.formula, "2d6");
  assert.ok(!thug.disabledReason && !thug.resourceError);
  assert.ok(!thug.consumes && !thug.resourceRequests?.length);
  assert.equal(riders.find(e => e.presetKey === "assassinate").formula, "6");
});
