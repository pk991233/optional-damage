export const ID = "optional-damage";
export const DEFAULTS = "獵人印記 | 1d6 | force";

export function parseOptions(text, types, validate) {
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((line, index) => {
    const fields = line.split("|").map(s => s.trim());
    const [label, formula, type] = fields;
    if (fields.length !== 3 || !label || !formula || !Object.hasOwn(types, type)) {
      throw new Error(`第 ${index + 1} 列格式不正確。請輸入：名稱 | 骰式 | 傷害類型代碼`);
    }
    if (!validate(formula)) throw new Error(`第 ${index + 1} 列骰式不正確：${formula}`);
    return {label, formula, type};
  });
}

export function replaceExtras(config, entries, selected) {
  const base = config.rolls.filter(r => !r.options?.[ID]);
  const properties = base[0]?.options?.properties;
  const extras = entries.filter((_, i) => selected.has(i)).map(entry => ({
    parts: [entry.formula],
    data: base[0]?.data ?? {},
    situational: false,
    options: {
      [ID]: true,
      type: entry.type,
      types: [entry.type],
      flavor: entry.label,
      isCritical: config.isCritical === true,
      ...(properties ? {properties} : {}),
      critical: {bonusDice: 0, bonusDamage: ""}
    }
  }));
  config.rolls = [...base, ...extras];
}
