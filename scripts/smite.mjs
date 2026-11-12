export function spellSlots(actor, kind) {
  const spells = actor?.system?.spells ?? {};
  const keys = kind === "eldritch" ? ["pact"] : [...Array.from({length:9}, (_,i)=>`spell${i+1}`), "pact"];
  return keys.flatMap(key => {
    const data = spells[key];
    const level = key === "pact" ? data?.level : Number(key.slice(5));
    if (!data?.max || !Number.isInteger(level) || level < 1 || level > 9) return [];
    return [{key, level, value:data.value, label:`${key === "pact" ? "契約位" : "法術位"} ${level} 環（剩餘 ${data.value}/${data.max}）`}];
  });
}
export function smiteFormula(entry) {
  const slot = entry.slots.find(s => s.key === entry.slotKey);
  if (!slot) throw new Error("請選擇可用的法術位。");
  return `${slot.level + 1 + (entry.smite === "divine" && entry.specialTarget ? 1 : 0)}d8`;
}
export function slotUpdates(actor, rolls) {
  const costs = new Map();
  for (const roll of rolls) {
    const resource = roll.options.optionalDamageSlot;
    if (!resource) continue;
    if (!actor?.isOwner) throw new Error("沒有修改角色法術位的權限。");
    if (!["divine","eldritch"].includes(resource.kind)) throw new Error("無效的重斬種類。");
    if (!actor.items.get(resource.abilityId)) throw new Error("找不到重斬能力，請重新開啟傷害視窗。");
    const slot = spellSlots(actor, resource.kind).find(s => s.key === resource.key);
    if (!slot || slot.level !== resource.level) throw new Error("法術位資料已改變，請重新開啟傷害視窗。");
    costs.set(slot.key, (costs.get(slot.key) ?? 0) + 1);
  }
  return Object.fromEntries([...costs].map(([key,cost]) => {
    const value = actor.system.spells[key].value;
    if (!Number.isInteger(value) || value < cost) throw new Error("選擇的法術位數量不足；同時使用兩種重斬需要兩個法術位。");
    return [`system.spells.${key}.value`, value - cost];
  }));
}
