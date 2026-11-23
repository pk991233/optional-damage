import {damageConflictGroup} from "./rules.mjs";
import {PRESETS, isSpecialFormula, parseOptions, normalizeName} from "./options.mjs";

export const presetId = p => p[1].startsWith("preset:") ? p[1].slice(7) : normalizeName(p[0]);
const parts = line => line.split("|").map(s => s.trim());
const names = raw => (raw ?? "").split(/[;；]/).map(normalizeName).filter(Boolean).sort();

function presetCandidates([label, formula, , aliases]) {
  const byLabel = PRESETS.find(p => normalizeName(p[0]) === normalizeName(label));
  if (byLabel) return [byLabel];
  if (isSpecialFormula(formula)) {
    const byFormula = PRESETS.find(p => p[1] === formula);
    if (byFormula) return [byFormula];
  }
  const ns = names(aliases || label);
  return PRESETS.filter(p => names(p[3]).some(n => ns.includes(n)));
}
export function identifyPreset(fields) {
  const matches = presetCandidates(fields);
  return matches.length === 1 ? matches[0] : undefined;
}

// Exact factory rows from versions that stored presets and custom entries together.
// A changed label, formula, type or alias list remains the GM's custom entry.
const previousFactoryRows = new Set([
  "火之燃燒|1d10|fire|火之燃燒;火之燃烧;Fire's Burn;fires-burn",
  "霜之寒冷|1d6|cold|霜之寒冷;霜之寒凍;霜之寒冻;Frost's Chill;frosts-chill",
  "霜之寒冷|1d6|cold|霜之寒冷;霜之寒凍;霜之寒冻;Frost's Chill;frosts-chill;Giant Ancestry (Frost)",
  "魔能重斬|eldritch|force|魔能重斬;魔能重斩;Eldritch Smite;eldritch-smite",
  "暴徒：刺殺|preset:thug|inherit|刺殺;Assassination;Thug;暴徒",
  "光耀打擊|preset:radiant|radiant|光耀打擊;Radiant Strikes",
  "吸命斬|preset:lifedrinker|necrotic|吸命斬;Lifedrinker",
  "戰鬥激勵|preset:inspiration|inherit|戰鬥激勵;Combat Inspiration",
  "強化通靈|preset:channeling|inherit|強化通靈;Empowered Channeling",
  "凶蠻攻擊|preset:savage|inherit|凶蠻攻擊;Savage Attacks"
]);

export function splitLegacy(text) {
  const disabled = new Set(PRESETS.map(presetId)), custom = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parts(line);
    if (previousFactoryRows.has(fields.join("|"))) {
      const current = PRESETS.find(p => p[0] === fields[0]);
      if (current) disabled.delete(presetId(current));
      continue;
    }
    const preset = identifyPreset(fields);
    const same = fields.length <= 4 && preset && fields[0] === preset[0] && fields[1] === preset[1] && fields[2] === preset[2]
      && (!fields[3] || names(fields[3]).join(";") === names(preset[3]).join(";"));
    if (same) disabled.delete(presetId(preset));
    else custom.push(line);
  }
  for (const line of custom) for (const preset of presetCandidates(parts(line))) disabled.add(presetId(preset));
  return {version:1, disabled:[...disabled], custom:custom.join("\n")};
}
export function settingsData(saved, legacy) {
  return saved?.version === 1 ? saved : splitLegacy(legacy);
}
function settingsEntryKey(preset, formula, type, aliases) {
  return JSON.stringify([preset, formula?.replace(/\s/g, ""), type, names(aliases)]);
}

export function combinedEntries(settings, types, validate) {
  // Strict validation at save time reports the row; old broken rows remain editable.
  const custom = parseOptions(settings.custom, types, validate, () => {});
  const overridden = new Set(), seen = new Set(), entries = [];
  for (const entry of custom) {
    const aliases = entry.aliases.join(";");
    const matches = presetCandidates([entry.label, entry.formula, entry.type, aliases]);
    for (const preset of matches) overridden.add(presetId(preset));
    const id = matches.length === 1 ? presetId(matches[0]) : undefined;
    const key = settingsEntryKey(id, entry.formula, entry.type, aliases);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({...entry, origin:"custom", presetId:id, configuredFormula:entry.formula});
  }
  const builtins = PRESETS.filter(p => !settings.disabled?.includes(presetId(p)) && !overridden.has(presetId(p)));
  const defaults = parseOptions(builtins.map(p => p.join(" | ")).join("\n"), types, validate)
    .map((entry, i) => ({...entry, origin:"preset", presetId:presetId(builtins[i])}));
  return [...defaults, ...entries];
}

// Different aliases can resolve on different actors. Merge equivalent matches only
// after ownership and resource binding, retaining the aliases for duplicate-damage detection.
export function dedupeAvailable(entries) {
  const result = [], matches = new Map();
  for (const entry of entries) {
    if (!entry.configuredFormula || !entry.presetId) {
      result.push(entry);
      continue;
    }
    const key = JSON.stringify([entry.presetId, entry.presetKey, entry.configuredFormula.replace(/\s/g, ""),
      entry.formula, entry.type, entry.sourceItemId, entry.abilityId, entry.resourceRequests, entry.disabledReason, entry.resourceError]);
    const existing = matches.get(key);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...entry.aliases])];
    } else {
      const copy = {...entry};
      matches.set(key, copy);
      result.push(copy);
    }
  }
  return result;
}

export function auditCustom(text, types, validate) {
  const warnings = [], seen = new Set();
  if (types && validate) parseOptions(text, types, validate, error => warnings.push(error.message));
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parts(line);
    const matches = presetCandidates(fields);
    if (matches.length) warnings.push("「" + fields[0] + "」會取代預設：" + matches.map(p => p[0]).join("、") + "。");
    const id = matches.length === 1 ? presetId(matches[0]) : undefined;
    const key = settingsEntryKey(id, fields[1], fields[2], fields[3] || fields[0]);
    if (seen.has(key)) warnings.push("「" + fields[0] + "」有重複列；擲骰時只保留一份。");
    seen.add(key);
  }
  return [...new Set(warnings)];
}
export const conflictGroup = damageConflictGroup;
export function markExistingDamage(entries,config) {
 const base=(config.rolls??[]).filter(r=>!r.options?.["optional-damage"]);
 return entries.map(e=>{
  // Lightning Launcher is also the base weapon name, not proof of an existing rider.
  if(e.presetKey==="launcher" || e.presetId==="launcher")return e;
  const aliases=[e.label,...e.aliases].map(normalizeName);
  const found=base.some(r=>r.options?.flavor&&aliases.includes(normalizeName(r.options.flavor)));
  return found?{...e,disabledReason:"原傷害已標示此能力，避免重複加入。"}:e;
 });
}
