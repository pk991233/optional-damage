import {ID, DEFAULTS, parseOptions, replaceExtras} from "./options.mjs";

const states = new WeakMap();

function entries() {
  return parseOptions(game.settings.get(ID, "entries"), CONFIG.DND5E.damageTypes, formula => Roll.validate(formula));
}

Hooks.once("init", () => {
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
    hint: "設定玩家可以勾選的額外傷害，所有角色共用此清單。",
    type: DamageOptionsSettings, restricted: true
  });
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
    try { state = {entries: entries(), selected: new Set()}; }
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
    const label = document.createElement("span");
    label.textContent = `${entry.label}：+ ${entry.formula} ${game.i18n.localize(CONFIG.DND5E.damageTypes[entry.type].label)}`;
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
