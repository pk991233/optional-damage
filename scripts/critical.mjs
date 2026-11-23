import {hasAutomaticSavageDamage} from "./savage-effect.mjs";
import {weaponDamageDie} from "./weapon-die.mjs";
import {resourceItems} from "./resources.mjs";
import {objectMatchesAbility} from "./rules.mjs";

function savageDamageHandled(config, featureId) {
  const subject = config?.subject;
  const actor = subject?.actor ?? subject?.item?.actor;
  if (!actor) return false;
  const feature = resourceItems(actor).find(item => item.id === featureId);
  return hasAutomaticSavageDamage(actor, feature, config);
}

export function configureSavageDamage(entry, config) {
  if ((entry.presetKey ?? entry.presetId) !== "savage") return entry;
  const actor = config?.subject?.actor ?? config?.subject?.item?.actor;
  const sourceId = entry.sourceItemId ?? resourceItems(actor)
    .find(item => item.type === "feat" && objectMatchesAbility(item, entry.aliases ?? []))?.id;
  const result = {...entry, savageSource: sourceId};
  if (savageDamageHandled(config, sourceId)) {
    result.disabledReason = "角色已有生效的野蠻攻擊效果，這次重擊由該效果加入武器骰。";
  }
  // Fixed custom overrides keep their own formula. Only the die picker is automatic.
  if (entry.presetKey === "savage" && entry.choices) {
    const die = weaponDamageDie(config);
    if (die) {
      result.formula = die;
      result.choicePending = false;
      result.note = "已依本次武器傷害選取 " + die + "，僅適用近戰武器重擊。";
      delete result.choices;
    } else result.note = "無法從本次擲骰確認武器骰面，請選一顆武器基礎傷害骰。僅適用近戰武器重擊。";
  }
  return result;
}

// During configuration the player can still choose either submission button.
export function canSelectEntry(entry, config) {
  return !(entry.disabledReason || entry.resourceError || entry.choicePending ||
    (entry.requiresCritical && config.critical?.allow === false));
}

// DND5e sets each roll's critical flag from the button actually pressed. In 5.0
// that decision is only present on the rolls, not on the process configuration.
export function finalizeCriticalExtras(rolls, config) {
  for (let i = rolls.length - 1; i >= 0; i--) {
    const options = rolls[i].options;
    if (!options?.["optional-damage"]) continue;
    if ((options.optionalDamageCriticalOnly && !options.isCritical) ||
        (options.optionalDamageSavage && savageDamageHandled(config, options.optionalDamageSavage))) {
      rolls.splice(i, 1);
    }
  }
}
