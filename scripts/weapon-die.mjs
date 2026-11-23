// Parse an unrolled weapon part, never the already-doubled critical roll or its bonus parts.
function dieFromFormula(formula, data) {
  if (typeof formula !== "string") return;
  if (formula.includes("@")) {
    if (!globalThis.Roll?.replaceFormulaData) return;
    formula = Roll.replaceFormulaData(formula, data ?? {}, {missing: "?", warn: false});
  }
  const expression = formula.replace(/\s+/g, "");
  const terms = expression.match(/[+-]?[^+-]+/g) ?? [];
  if (terms.join("") !== expression) return;
  let die;
  for (const term of terms) {
    // Keeping this grammar narrow avoids mistaking a reroll condition, a table or arithmetic for the base die.
    if (/^[+-]?\d+(?:\.\d+)?(?:\[[^\[\]]*\])?$/.test(term)) continue;
    const match = /^\+?(\d*)d([1-9]\d*)(?:\[[^\[\]]*\])?$/i.exec(term);
    if (!match || (match[1] && Number(match[1]) < 1)) return;
    const candidate = "1d" + match[2];
    if (die && die !== candidate) return;
    die = candidate;
  }
  return die;
}

export function weaponDamageDie(config) {
  const activity = config?.subject;
  const weapon = activity?.item ?? activity;
  if (weapon?.type !== "weapon" || config.ammunition?.system?.damage?.replace) return;
  if (activity.item && activity.type && activity.type !== "attack") return;
  const actionType = activity.getActionType?.(config.attackMode) ?? activity.actionType;
  if (actionType && actionType !== "mwak") return;
  const rows = (config.rolls ?? []).filter(row => !row.options?.["optional-damage"]);
  const marked = rows.filter(row => row.base === true);
  if (marked.length === 1) return dieFromFormula(marked[0].parts?.[0], marked[0].data);

  // When a workflow drops the native base marker, verify a single current row against the weapon.
  if (marked.length || rows.length !== 1 || activity.type !== "attack" || !activity.damage?.includeBase) return;
  const system = weapon.system;
  const versatile = system?.isVersatile ?? system?.properties?.has?.("ver");
  if (versatile && !["oneHanded", "twoHanded", "offhand"].includes(config.attackMode)) return;
  const twoHanded = versatile && config.attackMode === "twoHanded";
  const part = twoHanded ? system.damage?.versatile : system?.damage?.base;
  if (!part || part.custom?.enabled) return;
  const base = system.damage?.base;
  const faces = part.denomination || (twoHanded && base?.steppedDenomination?.());
  const count = part.number || (twoHanded && base?.number);
  if (!Number.isSafeInteger(faces) || faces < 1 || !(count > 0)) return;
  const current = dieFromFormula(rows[0].parts?.[0], rows[0].data);
  if (current === "1d" + faces) return current;
}
