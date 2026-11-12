export const ID = "optional-damage";
export const PRESETS = [
  ["獵人印記", "1d6", "force", "獵人印記;猎人印记;Hunter's Mark;hunters-mark"],
  ["偷襲", "sneak", "inherit", "偷襲;偷襲骰;偷袭;Sneak Attack;sneak-attack"],
  ["脆弱詛咒", "1d6", "necrotic", "脆弱詛咒;脆弱诅咒;Hex"],
  ["火之燃燒", "1d10", "fire", "火之燃燒;火之燃烧;Fire's Burn;fires-burn"],
  ["霜之寒冷", "1d6", "cold", "霜之寒冷;霜之寒凍;霜之寒冻;Frost's Chill;frosts-chill"]
];
export const DEFAULTS = PRESETS.map(p => p.join(" | ")).join("\n");
export function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}
function matches(name, aliases) {
  const parts = [name, ...String(name ?? "").split(/[()（）\[\]【】:：/]/u)];
  return parts.some(part => aliases.some(alias => normalizeName(part) === normalizeName(alias)));
}
export function parseOptions(text, types, validate) {
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((line, index) => {
    const fields = line.split("|").map(s => s.trim());
    const [label, formula, type, names] = fields;
    if (fields.length < 3 || fields.length > 4 || !label || !formula || (type !== "inherit" && !Object.hasOwn(types, type))) {
      throw new Error(`第 ${index + 1} 列格式錯誤：名稱 | 骰式 | 傷害類型 | 能力名稱（分號分隔）`);
    }
    if (formula !== "sneak" && !validate(formula)) throw new Error(`第 ${index + 1} 列骰式錯誤：${formula}`);
    const preset = PRESETS.find(p => matches(label, p[3].split(";")));
    const aliases = (names || preset?.[3] || label).split(/[;；]/).map(s => s.trim()).filter(Boolean);
    return {label, formula, type, aliases};
  });
}
export function availableOptions(entries, actor) {
  if (!actor) return [];
  const items = Array.from(actor.items ?? []);
  return entries.flatMap(entry => {
    const owned = items.some(item => ["spell", "feat"].includes(item.type)
      && (matches(item.name, entry.aliases) || matches(item.system?.identifier, entry.aliases)));
    if (!owned) return [];
    if (entry.formula !== "sneak") return [entry];
    const rogue = items.find(item => item.type === "class"
      && (matches(item.system?.identifier, ["rogue"]) || matches(item.name, ["rogue", "遊蕩者", "游荡者", "盜賊", "盗贼"])));
    const level = Number(rogue?.system?.levels);
    if (!Number.isInteger(level) || level < 1 || level > 20) return [];
    return [{...entry, formula: `${Math.ceil(level / 2)}d6`}];
  });
}
export function migrateOptions(text) {
  const lines = text.split(/\r?\n/).filter(s => s.trim());
  if (!lines.length) return text;
  for (const preset of PRESETS) {
    if (!lines.some(line => matches(line.split("|")[0].trim(), preset[3].split(";")))) lines.push(preset.join(" | "));
  }
  return lines.join("\n");
}
export function inheritedType(config, formData) {
  return formData?.get("roll.0.damageType") || config.rolls[0]?.options?.type || config.rolls[0]?.options?.types?.[0];
}
export function replaceExtras(config, entries, selected) {
  const base = config.rolls.filter(r => !r.options?.[ID]);
  const properties = base[0]?.options?.properties;
  const extras = entries.filter((_, i) => selected.has(i)).map(entry => {
    const type = entry.type === "inherit" ? inheritedType(config) : entry.type;
    return {
      parts: [entry.formula], data: base[0]?.data ?? {}, situational: false,
      options: {
        [ID]: true, optionalDamageInherit: entry.type === "inherit",
        type, types: type ? [type] : [], flavor: entry.label,
        isCritical: config.isCritical === true,
        ...(properties ? {properties} : {}), critical: {bonusDice: 0, bonusDamage: ""}
      }
    };
  });
  config.rolls = [...base, ...extras];
}
