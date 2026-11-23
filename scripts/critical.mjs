// During configuration the player can still choose either submission button.
export function canSelectEntry(entry, config) {
  return !(entry.disabledReason || entry.resourceError || entry.choicePending ||
    (entry.requiresCritical && config.critical?.allow === false));
}

// DND5e sets each roll's critical flag from the button actually pressed. In 5.0
// that decision is only present on the rolls, not on the process configuration.
export function finalizeCriticalExtras(rolls) {
  for (let i = rolls.length - 1; i >= 0; i--) {
    const options = rolls[i].options;
    if (options?.["optional-damage"] && options.optionalDamageCriticalOnly && !options.isCritical) {
      rolls.splice(i, 1);
    }
  }
}
