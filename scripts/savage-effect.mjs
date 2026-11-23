import {objectMatchesAbility} from "./rules.mjs";

const key = "flags.dnd5e.meleeCriticalDamageDice";
const names = ["Savage Attacks", "凶蠻攻擊", "野蠻攻擊"];

function addsCriticalDie(effect) {
  if (effect.active === false || effect.disabled || effect.isSuppressed || effect.parent?.areEffectsSuppressed) return false;
  return (effect.changes ?? []).some(change => change.key === key &&
    Number(change.mode) === 2 && Number.isInteger(Number(change.value)) && Number(change.value) >= 1);
}

function fromSavageFeature(effect, feature, actor) {
  const parent = effect.parent;
  if (parent === feature || (feature.uuid && parent?.uuid === feature.uuid)) return true;
  // A different item's transferred effect remains a different bonus, even if renamed.
  if (parent?.documentName === "Item" || (parent && parent !== actor && parent.system && parent.type === "feat")) return false;
  const origin = effect.origin;
  if (origin && origin !== actor.uuid) {
    if (typeof origin !== "string") return false;
    const sources = [feature.uuid, feature._stats?.compendiumSource, feature.flags?.dnd5e?.sourceId];
    return sources.some(uuid => uuid && (origin === uuid || origin.startsWith(uuid + ".ActiveEffect.")));
  }
  // Legacy actor effects may have no originating item. Only a specific name identifies these.
  return objectMatchesAbility(effect, [...names, feature.name].filter(Boolean));
}

function activeSavageBonus(actor, feature) {
  // v13 appliedEffects excludes non-transferred and suppressed item effects.
  const applied = actor.appliedEffects ?? actor.allApplicableEffects?.();
  if (applied) return Array.from(applied).some(effect => addsCriticalDie(effect) && fromSavageFeature(effect, feature, actor));
  const onActor = Array.from(actor.effects?.values?.() ?? actor.effects ?? []);
  return onActor.some(effect => addsCriticalDie(effect) && fromSavageFeature(effect, feature, actor)) ||
    Array.from(feature.effects?.values?.() ?? feature.effects ?? []).some(effect => effect.transfer && addsCriticalDie(effect));
}

/** Does this weapon roll already include the half-orc feature's extra critical die? */
export function hasAutomaticSavageDamage(actor, feature, config) {
  if (!actor || !feature || feature.areEffectsSuppressed) return false;
  const rows = (config?.rolls ?? []).filter(row => !row.options?.["optional-damage"]);
  const primary = rows.find(row => row.base === true) ?? rows[0];
  if (!primary || primary.base === false) return false;

  const activity = config.subject;
  const attackType = activity?.getActionType?.(config.attackMode) ?? (!config.attackMode ? activity?.actionType : undefined);
  if (attackType && attackType !== "mwak") return false;
  const actorBonus = actor.getFlag?.("dnd5e", "meleeCriticalDamageDice") ?? actor.flags?.dnd5e?.meleeCriticalDamageDice;
  if (actorBonus != null && !(Number(actorBonus) > 0)) return false;

  const rollBonus = primary.options?.critical?.bonusDice;
  if (rollBonus != null) {
    if (!(Number(rollBonus) > 0)) return false;
  } else {
    // A workflow can omit the critical options. Require the same melee base-damage
    // prerequisites that dnd5e's attack activity uses, plus a positive prepared flag.
    if (attackType !== "mwak" || !(Number(actorBonus) > 0) ||
      !(primary.base === true || activity?.damage?.includeBase === true)) return false;
  }
  return activeSavageBonus(actor, feature);
}
