import {EXTRA_PRESETS, EXTRA_KEYS, resolveExtra} from "./presets.mjs";
import {spellSlots, smiteFormula} from "./smite.mjs";
export const ID = "optional-damage";
export const PRESETS = [
  ["獵人印記", "1d6", "force", "獵人印記;猎人印记;Hunter's Mark;hunters-mark"],
  ["偷襲", "sneak", "inherit", "偷襲;偷襲骰;偷袭;Sneak Attack;sneak-attack"],
  ["脆弱詛咒", "1d6", "necrotic", "脆弱詛咒;脆弱诅咒;Hex"],
  ["火之燃燒", "1d10", "fire", "火之燃燒;火之燃烧;Fire's Burn;fires-burn;Giant Ancestry (Fire)"],
  ["霜之寒冷", "1d6", "cold", "霜之刺骨;霜之寒冷;霜之寒凍;霜之寒冻;Frost's Chill;frosts-chill;Giant Ancestry (Frost)"]
  , ["至聖斬", "divine", "radiant", "至聖斬;至圣斩;Divine Smite;divine-smite"]
  , ["魔能重斬", "eldritch", "force", "魔能重斬;魔能重斩;Eldritch Smite;eldritch-smite"]
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
export function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}
function matches(name, aliases) {
  const parts = [name, ...String(name ?? "").split(/[()（）\[\]【】/]/u)];
  return parts.some(part => normalizeName(part) && aliases.some(alias => normalizeName(part) === normalizeName(alias)));
}
export function parseOptions(text, types, validate) {
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((line, index) => {
    const fields = line.split("|").map(s => s.trim());
    const [label, formula, type, names] = fields;
    if (fields.length < 3 || fields.length > 4 || !label || !formula || (type !== "inherit" && !Object.hasOwn(types, type))) {
      throw new Error(`第 ${index + 1} 列格式錯誤：名稱 | 骰式 | 傷害類型 | 能力名稱（分號分隔）`);
    }
    if (!["sneak","divine","eldritch","fey","gloom","colossus","polar","firearm"].includes(formula) && !EXTRA_KEYS.has(formula) && !validate(formula)) throw new Error(`第 ${index + 1} 列骰式錯誤：${formula}`);
    const preset = PRESETS.find(p => normalizeName(label) === normalizeName(p[0])) ?? PRESETS.find(p => matches(label, p[3].split(";")));
    const aliases = (names || preset?.[3] || label).split(/[;；]/).map(s => s.trim()).filter(Boolean);
    if (aliases.some(a => !normalizeName(a))) throw new Error(`第 ${index + 1} 列能力名稱不能只有標點。`);
    const consumes = PRESETS.slice(3,5).some(p => p === preset || aliases.some(a => matches(a, p[3].split(";"))));
    const smite = ["divine","eldritch"].includes(formula) ? formula : undefined;
    return {label, formula, type, aliases, consumes, smite};
  });
}
export function availableOptions(entries, actor, sourceItemId) {
  if (!actor) return [];
  const items = Array.from(actor.items ?? []);
  return entries.flatMap(entry => {
    let owned = items.filter(item => (["spell", "feat"].includes(item.type) || (entry.formula === "preset:launcher" && item.type === "weapon"))
      && (matches(item.name, entry.aliases) || matches(item.system?.identifier, entry.aliases)));
    if (PARENT_ALIASES[entry.formula] && sourceItemId && owned.some(item=>item.id===sourceItemId)) return [];
    const parents = PARENT_ALIASES[entry.formula] ? items.filter(item => item.type === "feat"
      && (matches(item.name, PARENT_ALIASES[entry.formula]) || matches(item.system?.identifier, PARENT_ALIASES[entry.formula]))) : [];
    // Dread Ambusher owns the charges even when a separate child feature also exists.
    // Hunter's Prey is only a fallback; its description lists both selectable options.
    const fromParent = parents.length > 0 && (entry.formula === "gloom" || !owned.length);
    if (fromParent) owned = parents;
    if (!owned.length) return [];
    if (entry.formula !== "preset:launcher" && sourceItemId && owned.some(item=>item.id===sourceItemId)) return [];
    if (EXTRA_KEYS.has(entry.formula)) return resolveExtra(entry, actor, owned, sourceItemId, useStatus);
    if (["fey","gloom","polar","colossus","firearm"].includes(entry.formula)) {
      const kind = entry.formula;
      if (sourceItemId && owned.some(item => item.id === sourceItemId)) return [];
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
      let formula = kind === "gloom" ? "2d6" : "1d8";
      if (["fey","polar"].includes(kind)) {
        const ranger = items.find(item => item.type === "class" &&
          (matches(item.name,["Ranger","遊俠","游侠"]) || matches(item.system?.identifier,["ranger"])));
        const level = Number(ranger?.system?.levels);
        if (!Number.isInteger(level) || level < 1 || level > 20) return [];
        formula = level >= 11 ? "1d6" : "1d4";
      }
      if (kind === "firearm" && items.find(item=>item.id===sourceItemId)?.type !== "spell") return [];
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
      if (sourceItemId && owned.some(item => item.id === sourceItemId)) return [];
      const slots = spellSlots(actor, entry.smite);
      const slotKey = slots.find(s=>s.value > 0)?.key;
      const result = {...entry, slots, slotKey, abilityId:owned[0].id, specialTarget:false,
        disabledReason: !actor.isOwner ? "沒有修改角色的權限" : !slotKey ? "沒有可用法術位" : ""};
      result.formula = slotKey ? smiteFormula(result) : "—";
      return [result];
    }
    if (entry.consumes) {
      if (sourceItemId && owned.some(item => item.id === sourceItemId)) return [];
      const item = owned[0];
      const status = useStatus(item);
      return [{...entry, sourceItemId: item.id, remaining: status.remaining, maximum: status.maximum,
        disabledReason: owned.length > 1 ? "找到多個同名特性，請保留唯一對應項目" : status.reason}];
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
  const extras = entries.filter((entry, i) => selected.has(i) && !entry.disabledReason && !entry.choicePending && (!entry.requiresCritical || config.isCritical === true)).filter(entry => {
    const kind=entry.presetKey;
    const group=["divineStrike","clericPotent"].includes(kind) ? "cleric-blessed" : ["primal","druidPotent"].includes(kind) ? "druid-fury" : undefined;
    const key=group ?? entry.presetId ?? JSON.stringify([entry.aliases?.map(normalizeName).sort(),entry.formula.replace(/\s/g,""),entry.type]);
    if(selectedKeys.has(key))return false;
    selectedKeys.add(key);return true;
  }).map(entry => {
    const type = entry.type === "inherit" ? inheritedType(config) : entry.type;
    return {
      parts: [entry.smite ? smiteFormula(entry) : entry.formula], data: base[0]?.data ?? {}, situational: false,
      options: {
        [ID]: true, optionalDamageInherit: entry.type === "inherit",
        ...(entry.consumes ? {optionalDamageSource: entry.sourceItemId} : {}),
        ...(entry.smite ? {optionalDamageSlot:{kind:entry.smite, key:entry.slotKey,
          level:entry.slots.find(s=>s.key===entry.slotKey).level, abilityId:entry.abilityId}} : {}),
        type, types: type ? [type] : [], flavor: entry.label,
        isCritical: !entry.noCritical && config.isCritical === true,
        ...(properties ? {properties} : {}), critical: {bonusDice: 0, bonusDamage: ""}
      }
    };
  });
  config.rolls = [...base, ...extras];
}
