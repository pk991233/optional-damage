import {presetId, settingsData, splitLegacy, combinedEntries, auditCustom, conflictGroup, markExistingDamage} from "./settings.mjs";
import {ID, DEFAULTS, parseOptions, replaceExtras, availableOptions, migrateOptions, migrateAncestryAliases, inheritedType} from "./options.mjs";

import {consumptionWrapper} from "./consumption.mjs";
import {PRESETS} from "./options.mjs";
import {smiteFormula} from "./smite.mjs";
const states = new WeakMap();
Hooks.once("ready", () => {
  const cls = CONFIG.Dice.DamageRoll;
  cls.buildEvaluate = consumptionWrapper(cls.buildEvaluate, error => ui.notifications.error(error.message));
});

function entries() {
  return combinedEntries(settingsData(game.settings.get(ID, "separatedEntries"), game.settings.get(ID, "entries")), CONFIG.DND5E.damageTypes, formula => Roll.validate(formula));
}

Hooks.once("init", () => {
  game.settings.register(ID, "schemaVersion", {scope: "world", config: false, type: Number, default: 0});
  game.settings.register(ID, "entries", {
    scope: "world", config: false, type: String, default: DEFAULTS
  });
  game.settings.register(ID, "separatedEntries", {scope:"world", config:false, type:Object, default:{version:0,disabled:[],custom:""}});
  class DamageOptionsSettings extends FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "optional-damage-settings", title: "額外傷害選項", width: 760,
        height: 720, closeOnSubmit: false,
        template: `modules/${ID}/templates/settings.hbs`
      });
    }
    getData() {
      const saved=settingsData(game.settings.get(ID,"separatedEntries"),game.settings.get(ID,"entries"));
      return {
        presets:PRESETS.map(p=>({id:presetId(p),label:p[0],formula:p[1],type:p[2],enabled:!saved.disabled.includes(presetId(p))})),
        custom:saved.custom,
        warnings:auditCustom(saved.custom),
        types: Object.entries(CONFIG.DND5E.damageTypes).map(([code, config]) => ({
          code, label: game.i18n.localize(config.label)
        }))
      };
    }
    async _updateObject(event, formData) {
      if (!game.user.isGM) return;
      try {
        const custom=String(formData.custom??"");
        parseOptions(custom, CONFIG.DND5E.damageTypes, formula => Roll.validate(formula));
        const checked=id=>[true,"true","on",1].includes(formData["enabled."+id]??formData.enabled?.[id]);
        const saved={version:1,custom,disabled:PRESETS.map(presetId).filter(id=>!checked(id))};
        combinedEntries(saved,CONFIG.DND5E.damageTypes,formula=>Roll.validate(formula));
        await game.settings.set(ID,"separatedEntries",saved);
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
  if (schema >= 7) return;
  const old = game.settings.get(ID, "entries");
  const legacy = schema < 6 ? migrateOptions(migrateAncestryAliases(schema < 2 ? migrateOptions(old) : old), PRESETS.slice(schema < 4 ? 5 : schema < 5 ? 7 : 12)) : old;
  if (game.settings.get(ID,"separatedEntries")?.version !== 1)
    await game.settings.set(ID,"separatedEntries",splitLegacy(legacy));
  // Keep entries untouched as the pre-migration backup.
  await game.settings.set(ID, "schemaVersion", 7);
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
      state = {entries: markExistingDamage(availableOptions(entries(), actor, subject?.item?.id ?? subject?.id),app.config), selected: new Set()};
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
  const checkboxes = new Map();
  state.entries.forEach((entry, i) => {
    const row = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    checkboxes.set(i,input);
    input.checked = state.selected.has(i);
    input.disabled = Boolean(entry.disabledReason || entry.choicePending || (entry.requiresCritical && !app.config.isCritical));
    const label = document.createElement("span");
    let syncTarget = () => {};
    label.textContent = `${entry.label}：+ ${entry.formula} ${entry.type === "inherit" ? "同主要傷害類型" : game.i18n.localize(CONFIG.DND5E.damageTypes[entry.type].label)}`;
    if (entry.consumes) label.textContent += entry.disabledReason
      ? `（${entry.disabledReason}）` : `（剩餘 ${entry.remaining}/${entry.maximum}，消耗 1 次）`;
    input.addEventListener("change", event => {
      event.stopPropagation();
      if (input.checked && !input.disabled) state.selected.add(i);
      else state.selected.delete(i);
      const group=conflictGroup(entry);
      if(input.checked && group) state.entries.forEach((other,j)=>{
        if(j!==i && conflictGroup(other)===group){state.selected.delete(j);if(checkboxes.has(j))checkboxes.get(j).checked=false;}
      });
      syncTarget();
      replaceExtras(app.config, state.entries, state.selected);
      app.rebuild();
    });
    row.append(input, label);
    panel.append(row);
    if (entry.note || entry.disabledReason) {
      const note = document.createElement("small");
      note.textContent = entry.disabledReason || ((entry.requiresCritical && !app.config.isCritical) ? "僅重擊時可用。" : "") + entry.note;
      panel.append(note);
    }
    if (entry.choices) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", entry.label + "傷害選項");
      const placeholder = document.createElement("option");
      placeholder.value = ""; placeholder.textContent = "請選擇傷害類型／骰子";
      placeholder.selected = entry.choicePending;
      select.append(placeholder);
      entry.choices.forEach((choice, choiceIndex) => {
        const option = document.createElement("option");
        option.value = String(choiceIndex);
        const typeName = choice.type === "inherit" ? "同主要傷害類型" : game.i18n.localize(CONFIG.DND5E.damageTypes[choice.type].label);
        option.textContent = choice.formula + " " + typeName;
        option.selected = !entry.choicePending && choice.formula === entry.formula && choice.type === entry.type;
        select.append(option);
      });
      select.disabled = Boolean(entry.disabledReason);
      select.addEventListener("change", event => {
        event.stopPropagation();
        const choice = select.value === "" ? undefined : entry.choices[Number(select.value)];
        entry.choicePending = !choice;
        if (choice) Object.assign(entry, choice);
        input.disabled = Boolean(entry.disabledReason || entry.choicePending || (entry.requiresCritical && !app.config.isCritical));
        if (input.disabled) { input.checked = false; state.selected.delete(i); }
        label.textContent = entry.label + "：+ " + entry.formula + " " +
          (entry.type === "inherit" ? "同主要傷害類型" : game.i18n.localize(CONFIG.DND5E.damageTypes[entry.type].label));
        replaceExtras(app.config, state.entries, state.selected);
        app.rebuild();
      });
      panel.append(select);
    }
    if (entry.smite) {
      const controls = document.createElement("div");
      const select = document.createElement("select");
      select.setAttribute("aria-label", `${entry.label}消耗的法術位`);
      select.disabled = Boolean(entry.disabledReason);
      for (const slot of entry.slots) {
        const option = document.createElement("option");
        option.value = slot.key; option.textContent = slot.label;
        option.disabled = slot.value < 1; option.selected = slot.key === entry.slotKey;
        select.append(option);
      }
      const refresh = event => {
        event.stopPropagation();
        if (!entry.slotKey) return;
        entry.formula = smiteFormula(entry);
        label.textContent = `${entry.label}：+ ${entry.formula} ${game.i18n.localize(CONFIG.DND5E.damageTypes[entry.type].label)}`;
        replaceExtras(app.config, state.entries, state.selected);
        app.rebuild();
      };
      select.addEventListener("change", event => {entry.slotKey = select.value; refresh(event);});
      controls.append(select);
      if (entry.smite === "divine") {
        const targetLabel = document.createElement("label");
        const target = document.createElement("input");
        target.type = "checkbox"; target.checked = entry.specialTarget;
        syncTarget = () => {
          target.disabled = !state.selected.has(i) || Boolean(entry.disabledReason);
          if (target.disabled) {
            target.checked = false;
            entry.specialTarget = false;
            if (entry.slotKey) {
              entry.formula = smiteFormula(entry);
              label.textContent = `${entry.label}：+ ${entry.formula} ${game.i18n.localize(CONFIG.DND5E.damageTypes[entry.type].label)}`;
            }
          }
        };
        syncTarget();
        target.addEventListener("change", event => {
          syncTarget();
          entry.specialTarget = !target.disabled && target.checked;
          refresh(event);
        });
        targetLabel.append(target, document.createTextNode("目標為邪魔 Fiend／亡靈 Undead：+1d8"));
        controls.append(targetLabel);
      }
      if (entry.disabledReason) controls.append(document.createTextNode(entry.disabledReason));
      panel.append(controls);
    }
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
