import {ID, DEFAULTS, parseOptions, replaceExtras, availableOptions, migrateOptions, migrateAncestryAliases, inheritedType} from "./options.mjs";

import {consumptionWrapper} from "./consumption.mjs";
const states = new WeakMap();
Hooks.once("ready", () => {
  const cls = CONFIG.Dice.DamageRoll;
  cls.buildEvaluate = consumptionWrapper(cls.buildEvaluate, error => ui.notifications.error(error.message));
});

function entries() {
  return parseOptions(game.settings.get(ID, "entries"), CONFIG.DND5E.damageTypes, formula => Roll.validate(formula));
}

Hooks.once("init", () => {
  game.settings.register(ID, "schemaVersion", {scope: "world", config: false, type: Number, default: 0});
  game.settings.register(ID, "entries", {
    scope: "world", config: false, type: String, default: DEFAULTS
  });
  class DamageOptionsSettings extends FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "optional-damage-settings", title: "額外傷害選項", width: 580,
        height: "auto", closeOnSubmit: false,
        template: `modules/${ID}/templates/settings.hbs`
      });
    }
    getData() {
      return {
        entries: game.settings.get(ID, "entries"),
        types: Object.entries(CONFIG.DND5E.damageTypes).map(([code, config]) => ({
          code, label: game.i18n.localize(config.label)
        }))
      };
    }
    async _updateObject(event, formData) {
      if (!game.user.isGM) return;
      try {
        parseOptions(formData.entries, CONFIG.DND5E.damageTypes, formula => Roll.validate(formula));
        await game.settings.set(ID, "entries", formData.entries);
        ui.notifications.info("額外傷害選項已儲存。下次開啟傷害視窗時生效。");
        await this.close();
      } catch (error) {
        ui.notifications.error(error.message);
      }
    }
  }
  game.settings.registerMenu(ID, "configure", {
    name: "額外傷害選項", label: "編輯額外傷害", icon: "fas fa-dice",
    hint: "設定額外傷害及能力名稱；只顯示目前角色擁有的法術或特性。",
    type: DamageOptionsSettings, restricted: true
  });
});

Hooks.once("ready", async () => {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  const schema = game.settings.get(ID, "schemaVersion");
  if (schema >= 3) return;
  const old = game.settings.get(ID, "entries");
  const next = migrateAncestryAliases(schema < 2 ? migrateOptions(old) : old);
  if (next !== old) await game.settings.set(ID, "entries", next);
  await game.settings.set(ID, "schemaVersion", 3);
});

Hooks.on("dnd5e.postBuildDamageRollConfig", (process, config, index, {formData} = {}) => {
  if (!config.options?.optionalDamageInherit) return;
  const type = inheritedType(process, formData);
  config.options.type = type;
  config.options.types = type ? [type] : [];
});

Hooks.on("renderDamageRollConfigurationDialog", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || !app.config?.rolls?.length) return;
  // Exclude healing-only prompts, including temporary hit points.
  if (app.config.rolls.every(r => {
    const types = r.options?.types ?? [r.options?.type];
    return types.length && types.every(t => Object.hasOwn(CONFIG.DND5E.healingTypes, t));
  })) return;
  if (root.querySelector(".optional-damage-panel")) return;

  let state = states.get(app);
  if (!state) {
    try {
      const subject = app.config.subject;
      const actor = subject?.actor ?? subject?.item?.actor;
      state = {entries: availableOptions(entries(), actor, subject?.item?.id ?? subject?.id), selected: new Set()};
    }
    catch (error) { ui.notifications.error(error.message); return; }
    states.set(app, state);
  }
  if (!state.entries.length) return;

  const panel = document.createElement("fieldset");
  panel.className = "optional-damage-panel";
  const legend = document.createElement("legend");
  legend.textContent = "額外傷害（本次擲骰）";
  panel.append(legend);
  state.entries.forEach((entry, i) => {
    const row = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.selected.has(i);
    input.disabled = Boolean(entry.disabledReason);
    const label = document.createElement("span");
    label.textContent = `${entry.label}：+ ${entry.formula} ${entry.type === "inherit" ? "同主要傷害類型" : game.i18n.localize(CONFIG.DND5E.damageTypes[entry.type].label)}`;
    if (entry.consumes) label.textContent += entry.disabledReason
      ? `（${entry.disabledReason}）` : `（剩餘 ${entry.remaining}/${entry.maximum}，消耗 1 次）`;
    input.addEventListener("change", event => {
      event.stopPropagation();
      if (input.checked) state.selected.add(i);
      else state.selected.delete(i);
      replaceExtras(app.config, state.entries, state.selected);
      app.rebuild();
    });
    row.append(input, label);
    panel.append(row);
  });
  const hint = document.createElement("small");
  hint.textContent = "請自行確認觸發條件；已由其他效果加入的傷害，請勿重複勾選。";
  panel.append(hint);
  const anchor = root.querySelector('[data-application-part="configuration"]');
  if (anchor) anchor.append(panel);
  else {
    const form = app.form ?? root.querySelector("form");
    if (!form) return;
    form.append(panel);
  }
  app.setPosition({height: "auto"});
});
