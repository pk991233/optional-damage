import {normalizedAbilityName, abilityMatches, entriesConflict} from "./rules.mjs";
import {canSelectEntry} from "./critical.mjs";
import {resourceItems, resourceActivities, resourceMatches} from "./resources.mjs";
import {EXTRA_PRESETS, EXTRA_KEYS, classLevel, resolveExtra} from "./presets.mjs";
import {spellSlots, smiteFormula} from "./smite.mjs";
export const ID = "optional-damage";
export const PRESETS = [
  ["獵人印記", "1d6", "force", "獵人印記;猎人印记;Hunter's Mark;hunters-mark"],
  ["偷襲", "sneak", "inherit", "偷襲;偷襲骰;偷袭;Sneak Attack;sneak-attack"],
  ["脆弱詛咒", "1d6", "necrotic", "脆弱詛咒;脆弱诅咒;Hex"],
  ["火之燃燒", "1d10", "fire", "火之燃燒;火之燃烧;Fire's Burn;fires-burn;Giant Ancestry (Fire)"],
  ["霜之寒冷", "1d6", "cold", "霜之刺骨;霜之寒冷;霜之寒凍;霜之寒冻;Frost's Chill;frosts-chill;Giant Ancestry (Frost)"]
  , ["至聖斬", "divine", "radiant", "至聖斬;至圣斩;Divine Smite;divine-smite"]
  , ["魔能重斬", "eldritch", "force", "魔能重斬;魔能重斩;Eldritch Smite;eldritch-smite;Eldritch Invocations: Eldritch Smite"]
  , ["恐懼打擊（妖精漫遊者）", "fey", "psychic", "恐懼打擊;恐惧打击;Dreadful Strikes;dreadful-strikes"]
  , ["恐懼打擊（幽域追獵者）", "gloom", "psychic", "恐懼打擊;恐惧打击;Dreadful Strike;dreadful-strike"]
  , ["巨像屠夫", "colossus", "inherit", "巨像屠夫;Colossus Slayer;colossus-slayer"]
  , ["極地打擊", "polar", "cold", "極地打擊;极地打击;Polar Strikes;polar-strikes"]
  , ["祕法槍械", "firearm", "inherit", "祕法槍械;秘法槍械;奥术火器;奧術火器;Arcane Firearm;arcane-firearm"]
  , ...EXTRA_PRESETS
];
export const DEFAULTS = PRESETS.map(p => p.join(" | ")).join("\n");
const PARENT_ALIASES = {
  gloom: ["Dread Ambusher", "dread-ambusher", "恐懼伏擊", "恐惧伏击"],
  polar: ["Frigid Explorer", "frigid-explorer", "極寒探索者", "寒境探索者"],
  colossus: ["Hunter's Prey", "hunters-prey", "獵殺技藝", "猎杀技艺"]
};
export function useStatus(item) {
  const maximum = item?.system?.uses?.max;
  const spent = item?.system?.uses?.spent;
  const remaining = Math.max(0, maximum - spent);
  let reason = "";
  if (!item) reason = "找不到對應特性";
  else if (!item.isOwner) reason = "沒有修改特性的權限";
  else if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isInteger(spent) || spent < 0) reason = "請先設定此特性本身的使用次數";
  else if (remaining < 1) reason = "使用次數不足";
  return {remaining, maximum, reason};
}
export const normalizeName = normalizedAbilityName;
const matches = abilityMatches;
const specialFormulas = new Set(["sneak", "divine", "eldritch", "fey", "gloom", "colossus", "polar", "firearm"]);
export const isSpecialFormula = formula => specialFormulas.has(formula) || EXTRA_KEYS.has(formula);

export function parseAbilityAliases(raw) {
  const aliases = raw.split(/[;；]/).map(name => name.trim()).filter(Boolean);
  if (!aliases.length || aliases.some(alias => !normalizeName(alias))) {
    throw new Error("能力名稱須包含文字，不能只有標點或分號。");
  }
  return aliases;
}

function parseOptionLine(line, types, validate) {
  const fields = line.split("|").map(s => s.trim());
  const [label, formula, type, names] = fields;
  if (fields.length < 3 || fields.length > 4 || !label || !formula || (type !== "inherit" && !Object.hasOwn(types, type))) {
    throw new Error("格式錯誤：名稱 | 骰式 | 傷害類型 | 能力名稱（分號分隔）");
  }
  if (!isSpecialFormula(formula) && !validate(formula)) throw new Error(`骰式錯誤：${formula}`);
  const preset = PRESETS.find(p => normalizeName(label) === normalizeName(p[0])) ?? PRESETS.find(p => matches(label, p[3].split(";")));
  const aliases = parseAbilityAliases(names || preset?.[3] || label);
  const consumes = PRESETS.slice(3,5).some(p => p === preset || aliases.some(a => matches(a, p[3].split(";"))));
  const smite = ["divine","eldritch"].includes(formula) ? formula : undefined;
  return {label, formula, type, aliases, consumes, smite};
}

// New submissions must validate in full. Existing settings may contain legacy or invalid rows.
export function parseOptions(text, types, validate, onInvalid) {
  const options = [];
  for (const [index, line] of String(text ?? "").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      options.push(parseOptionLine(line, types, validate));
    } catch (cause) {
      const error = new Error(`第 ${index + 1} 列${cause.message}`);
      if (!onInvalid) throw error;
      onInvalid(error);
    }
  }
  return options;
}
const CLASS_CHOICES = {
  cleric: {
    classNames: ["Cleric", "牧師"], parent: ["Blessed Strikes", "祝福打擊"],
    strike: ["Divine Strike", "神聖打擊"], potent: ["Potent Spellcasting", "強力施法", "強力施法（牧師）"]
  },
  druid: {
    classNames: ["Druid", "德魯伊"], parent: ["Elemental Fury", "元素狂怒"],
    strike: ["Primal Strike", "原初打擊"], potent: ["Potent Spellcasting", "強力施法", "強力施法（德魯伊）"]
  }
};
const CHOICE_PRESETS = {
  "preset:divineStrike": ["cleric", "strike"], "preset:clericPotent": ["cleric", "potent"],
  "preset:primal": ["druid", "strike"], "preset:druidPotent": ["druid", "potent"]
};

function choiceClass(item, items) {
  const flags = item.flags?.dnd5e;
  const links = [flags?.advancementOrigin, flags?.advancementRoot].filter(Boolean);
  const parents = links.map(link => {
    const id = typeof link === "string" ? link.split(".")[0] : link.itemId ?? link.id;
    return items.find(parent => id && parent.id === id);
  }).filter(Boolean);
  if (links.every(link => typeof link === "string")) {
    const root = item.system?.advancementRootItem ?? item.advancementRootItem;
    if (root) parents.push(root);
  }
  for (const [key, rule] of Object.entries(CLASS_CHOICES)) {
    if (matches(item.system?.classIdentifier, rule.classNames) || parents.some(parent =>
      (parent.type === "class" && resourceMatches(parent, rule.classNames)) ||
      (parent.type === "subclass" && (matches(parent.system?.classIdentifier, rule.classNames) || resourceMatches(parent.class, rule.classNames))) ||
      resourceMatches(parent, rule.parent))) return key;
  }
  const requirements = String(item.system?.requirements ?? "");
  const cleric = /\bcleric\b|牧師/i.test(requirements) || matches(item.name, ["牧師", "Cleric"]);
  const druid = /\bdruid\b|德魯伊/i.test(requirements) || matches(item.name, ["德魯伊", "Druid"]);
  if (cleric !== druid) return cleric ? "cleric" : "druid";
}

// A parent lists the available choices. Only a granted child or a single matching
// activity on that parent identifies a choice.
function classChoiceItems(entry, items, source, owned) {
  const [classKey, choice] = CHOICE_PRESETS[entry.formula];
  const rule = CLASS_CHOICES[classKey], other = choice === "potent" ? "strike" : "potent";
  const feats = items.filter(item => item.type === "feat");
  const parents = feats.filter(item => resourceMatches(item, rule.parent));
  if (source && parents.includes(source)) return [];
  const belongs = item => {
    const owner = choiceClass(item, items);
    return !owner || owner === classKey;
  };
  const explicit = kind => feats.filter(item => resourceMatches(item, rule[kind]) && belongs(item));
  const chosen = explicit(choice);
  const spellClass = source?.type === "spell" && source.system?.classIdentifier;
  if (choice === "potent" && spellClass) {
    const otherClass = classKey === "cleric" ? "druid" : "cleric";
    if (matches(spellClass, CLASS_CHOICES[otherClass].classNames) &&
      items.some(item => item.type === "class" && resourceMatches(item, CLASS_CHOICES[otherClass].classNames))) return [];
  }
  if (chosen.length) return chosen;
  if (explicit(other).length) return [];

  const parentWithChoice = kind => parents.filter(item => resourceActivities(item).some(a => resourceMatches(a, rule[kind])));
  const named = parentWithChoice(choice);
  if (named.length) return named;
  if (parentWithChoice(other).length) return [];
  const sameClass = owned.filter(belongs);
  if (sameClass.length || classKey !== "cleric") return sameClass;
  if (choice === "potent" && feats.some(item => resourceMatches(item, rule.potent) && !belongs(item))) return [];
  return items.filter(item => item.type === "class" && resourceMatches(item, rule.classNames));
}

const LAUNCHER_ACTIVITY = ["Lightning Launcher", "閃電發射器", "Infiltrator", "滲透者", "潛入者"];
function launcherSource(item, activity, aliases) {
  if (!item) return [];
  if (activity && resourceMatches(activity, ["Guardian", "守護者", "Thunder Gauntlets", "雷鳴護手"])) return [];
  if (resourceMatches(item, aliases) || (activity && resourceMatches(activity, LAUNCHER_ACTIVITY))) return [item];
  // Some callers send only the source item. Keep the manual choice on its own armor.
  return !activity && resourceActivities(item).some(a => resourceMatches(a, LAUNCHER_ACTIVITY)) ? [item] : [];
}

export function availableOptions(entries, actor, sourceItemId, sourceActivity) {
  if (!actor) return [];
  const items = resourceItems(actor);
  const source = sourceItemId ? items.find(item => item.id === sourceItemId) : undefined;
  return entries.flatMap(entry => {
    let owned = items.filter(item => (["spell", "feat"].includes(item.type) || (entry.formula === "preset:launcher" && item.type === "weapon"))
      && (matches(item.name, entry.aliases) || matches(item.system?.identifier, entry.aliases)));
    if(["preset:thug","preset:psionic","preset:harm"].includes(entry.formula)&&!owned.length) {
      owned=items.filter(item=>item.type==="feat"&&resourceActivities(item).some(a=>resourceMatches(a,entry.aliases)));
    }
    if (Object.hasOwn(CHOICE_PRESETS, entry.formula)) owned = classChoiceItems(entry, items, source, owned);
    if (entry.formula === "preset:launcher") owned = launcherSource(source, sourceActivity, entry.aliases);
    if (PARENT_ALIASES[entry.formula] && sourceItemId && owned.some(item=>item.id===sourceItemId)) return [];
    const parents = PARENT_ALIASES[entry.formula] ? items.filter(item => item.type === "feat"
      && (matches(item.name, PARENT_ALIASES[entry.formula]) || matches(item.system?.identifier, PARENT_ALIASES[entry.formula]))) : [];
    // Dread Ambusher owns the charges even when a separate child feature also exists.
    // Hunter's Prey is only a fallback; its description lists both selectable options.
    const fromParent = parents.length > 0 && (entry.formula === "gloom" || !owned.length);
    if (source && parents.includes(source)) return [];
    if (fromParent) owned = parents;
    if (!owned.length) return [];
    if (entry.formula !== "preset:launcher" && sourceItemId && owned.some(item=>item.id===sourceItemId)) return [];
    if (EXTRA_KEYS.has(entry.formula)) return resolveExtra(entry, actor, owned, sourceItemId, useStatus);
    if (["fey","gloom","polar","colossus","firearm"].includes(entry.formula)) {
      const kind = entry.formula;
      let ambiguity = false;
      if (["fey","gloom"].includes(kind)) {
        const hasSubclass = aliases => items.some(item => item.type === "subclass"
          && (matches(item.name, aliases) || matches(item.system?.identifier, aliases)));
        const fey = hasSubclass(["Fey Wanderer","妖精漫遊者","妖精漫游者"]);
        const gloom = hasSubclass(["Gloom Stalker","幽域追獵者","幽域追猎者"]);
        const explicitKind = item => {
          const names = [item.name, item.system?.identifier];
          if (names.some(n=>matches(n,PARENT_ALIASES.gloom))) return "gloom";
          if (names.some(n=>matches(n,["Dreadful Strikes"]))) return "fey";
          if (names.some(n=>matches(n,["Dreadful Strike"]))) return "gloom";
          return undefined;
        };
        owned = owned.filter(item => {
          const explicit = explicitKind(item);
          if (explicit) return explicit === kind;
          if (fey === gloom) { ambiguity = true; return true; }
          return kind === "fey" ? fey : gloom;
        });
        if (!owned.length) return [];
      }
      const rangerLevel = classLevel(actor, "ranger");
      let formula = kind === "gloom" ? (rangerLevel >= 11 ? "2d8" : "2d6") : "1d8";
      if (["fey","polar"].includes(kind)) {
        if (!rangerLevel) return [];
        formula = rangerLevel >= 11 ? "1d6" : "1d4";
      }
      if (kind === "firearm" && source?.type !== "spell") return [];
      const notes = {
        fey:"武器命中；每個目標每回合一次", gloom:"武器命中；每回合一次；消耗特性 1 次",
        polar:"武器命中；每個目標每回合一次", colossus:fromParent
          ? "來源：獵殺技藝；請確認目前選的是巨像屠夫而非滅族者。武器命中且目標生命未滿；每回合一次"
          : "武器命中且目標生命未滿；每回合一次",
        firearm:"確認是透過祕法槍械施放的奇械師法術；僅一次傷害骰"
      };
      const status = kind === "gloom" ? useStatus(owned[0]) : {};
      if (kind === "gloom" && fromParent) notes.gloom = `來源：${owned[0].name}；武器命中，每回合一次；消耗該特性 1 次`;
      return [{...entry, formula, note:notes[kind], consumes:kind === "gloom", sourceItemId:owned[0].id,
        remaining:status.remaining, maximum:status.maximum,
        disabledReason: ambiguity ? "同名能力無法區分：請設定英文識別碼或確認子職" :
          owned.length > 1 ? "找到多個對應特性，請保留唯一對應項目" : status.reason}];
    }
    if (entry.smite) {
      const slots = spellSlots(actor, entry.smite);
      const slotKey = slots.find(s=>s.value > 0)?.key;
      const result = {...entry, slots, slotKey, abilityId:owned[0].id, specialTarget:false,
        disabledReason: !actor.isOwner ? "沒有修改角色的權限" : !slotKey ? "沒有可用法術位" : ""};
      result.formula = slotKey ? smiteFormula(result) : "—";
      return [result];
    }
    if (entry.consumes) {
      const item = owned[0];
      const status = useStatus(item);
      return [{...entry, sourceItemId: item.id, remaining: status.remaining, maximum: status.maximum,
        disabledReason: owned.length > 1 ? "找到多個同名特性，請保留唯一對應項目" : status.reason}];
    }
    if (entry.origin === "preset" && entry.presetId === normalizeName("獵人印記") && classLevel(actor, "ranger") === 20 &&
      items.some(item => item.type === "feat" && resourceMatches(item, ["Foe Slayer", "屠滅眾敵", "屠滅眾敵 Foe Slayer"]) &&
        !/2014|legacy/i.test(String(item.system?.source?.rules || item.system?.source?.book || "")))) {
      return [{...entry, formula: "1d10"}];
    }
    if (entry.formula !== "sneak") return [entry];
    const rogue = items.find(item => item.type === "class"
      && (matches(item.system?.identifier, ["rogue"]) || matches(item.name, ["rogue", "遊蕩者", "游荡者", "盜賊", "盗贼"])));
    const level = Number(rogue?.system?.levels);
    if (!Number.isInteger(level) || level < 1 || level > 20) return [];
    return [{...entry, formula: `${Math.ceil(level / 2)}d6`}];
  });
}
export function migrateOptions(text, presets = PRESETS) {
  const lines = text.split(/\r?\n/).filter(s => s.trim());
  if (!lines.length) return text;
  for (const preset of presets) {
    if (!lines.some(line => {
      const fields = line.split("|").map(s=>s.trim());
      return normalizeName(fields[0]) === normalizeName(preset[0]) ||
        (PRESETS.indexOf(preset) < 7 && matches(fields[0], preset[3].split(";"))) ||
        (EXTRA_KEYS.has(preset[1]) && (fields[1] === preset[1] ||
          (!["preset:clericPotent","preset:druidPotent"].includes(preset[1]) && matches(fields[0], preset[3].split(";")))));
    })) lines.push(preset.join(" | "));
  }
  return lines.join("\n");
}
export function inheritedType(config, formData) {
  return formData?.get("roll.0.damageType") || config.rolls[0]?.options?.type || config.rolls[0]?.options?.types?.[0];
}
export function migrateAncestryAliases(text) {
  return text.split(/\r?\n/).map(line => {
    const fields = line.split("|").map(s => s.trim());
    if (fields.length < 3 || fields.length > 4) return line;
    const preset = PRESETS.slice(3,5).find(p => normalizeName(p[0]) === normalizeName(fields[0]));
    if (!preset) return line;
    const aliases = fields[3] ? fields[3].split(/[;；]/).map(s => s.trim()).filter(Boolean) : preset[3].split(";");
    const additions = [preset[3].split(";").at(-1), ...(preset === PRESETS[4] ? ["霜之刺骨"] : [])];
    const missing = additions.filter(addition => !aliases.some(a => normalizeName(a) === normalizeName(addition)));
    if (!missing.length) return line;
    aliases.push(...missing);
    return [...fields.slice(0, 3), aliases.join(";")].join(" | ");
  }).join("\n");
}
export function replaceExtras(config, entries, selected) {
  const base = config.rolls.filter(r => !r.options?.[ID]);
  const properties = base[0]?.options?.properties;
  const selectedKeys = new Set();
  const chosen = [];
  for (const [i, entry] of entries.entries()) {
    if (!selected.has(i) || !canSelectEntry(entry, config)) continue;
    const key = entry.presetId || JSON.stringify([
      entry.aliases?.map(normalizeName).sort(), entry.formula.replace(/\s/g, ""), entry.type
    ]);
    if (selectedKeys.has(key) || chosen.some(other => entriesConflict(entry, other))) continue;
    selectedKeys.add(key);
    chosen.push(entry);
  }
  const extras = chosen.map(entry => {
    const type = entry.type === "inherit" ? inheritedType(config) : entry.type;
    return {
      parts: [entry.smite ? smiteFormula(entry) : entry.formula], data: base[0]?.data ?? {}, situational: false,
      options: {
        [ID]: true, optionalDamageInherit: entry.type === "inherit",
        ...(entry.resourceRequests?.length ? {optionalDamageResources:entry.resourceRequests.map(r=>({...r}))} : {}),
        ...(entry.consumes ? {optionalDamageSource: entry.sourceItemId} : {}),
        ...(entry.smite ? {optionalDamageSlot:{kind:entry.smite, key:entry.slotKey,
          level:entry.slots.find(s=>s.key===entry.slotKey).level, abilityId:entry.abilityId}} : {}),
        type, types: type ? [type] : [], flavor: entry.label,
        isCritical: config.isCritical === true,
        ...(entry.requiresCritical ? {optionalDamageCriticalOnly: true} : {}),
        ...(properties ? {properties} : {}),
        critical: {
          bonusDice: 0, bonusDamage: "",
          ...(entry.noCritical ? {multiplier: 1, powerfulCritical: false, multiplyNumeric: false} : {})
        }
      }
    };
  });
  config.rolls = [...base, ...extras];
}
