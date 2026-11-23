import {resourcePlan, resourceDescription, resourceItems} from "./resources.mjs";
import {quickAdd} from "./wizard.mjs";
import {presetId, settingsData, splitLegacy, combinedEntries, auditCustom, dedupeAvailable, markExistingDamage} from "./settings.mjs";
import {ID, DEFAULTS, PRESETS, parseOptions, replaceExtras, availableOptions, migrateOptions, migrateAncestryAliases, inheritedType} from "./options.mjs";

import {consumptionWrapper} from "./consumption.mjs";
import {smiteFormula, slotHasUses} from "./smite.mjs";
import {entriesConflict} from "./rules.mjs";
import {canSelectEntry, finalizeCriticalExtras} from "./critical.mjs";
const states = new WeakMap();
Hooks.on("dnd5e.postDamageRollConfiguration", finalizeCriticalExtras);
Hooks.once("ready", () => {
  const cls = CONFIG.Dice.DamageRoll;
  cls.buildEvaluate = consumptionWrapper(cls.buildEvaluate, error => ui.notifications.error(error.message));
});

function entries() {
  const world=settingsData(game.settings.get(ID, "separatedEntries"), game.settings.get(ID, "entries"));
  const personal=game.user?.getFlag?.(ID,"customEntries")??"";
  return combinedEntries({...world,custom:[world.custom,personal].filter(Boolean).join("\n")}, CONFIG.DND5E.damageTypes, formula => Roll.validate(formula));
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
    get personal() { return false; }
    getData() {
      const saved=settingsData(game.settings.get(ID,"separatedEntries"),game.settings.get(ID,"entries"));
      const custom = this.personal ? (game.user.getFlag(ID, "customEntries") ?? "") : saved.custom;
      return {
        personal:this.personal,
        presets:PRESETS.map(p=>({id:presetId(p),label:p[0],formula:p[1],type:p[2],enabled:!saved.disabled.includes(presetId(p))})),
        custom,
        warnings:auditCustom(custom, CONFIG.DND5E.damageTypes, formula => Roll.validate(formula)),
        types: Object.entries(CONFIG.DND5E.damageTypes).map(([code, config]) => ({
          code, label: game.i18n.localize(config.label)
        }))
      };
    }
    activateListeners(html) {
      super.activateListeners(html);
      const root=html[0]??html;
      root.querySelector('[data-action="quick-add"]')?.addEventListener("click",async event=>{
        event.preventDefault();
        const button=event.currentTarget;
        button.disabled=true;
        try {
          const row=await quickAdd(CONFIG.DND5E.damageTypes);
          if(row) {
            const area=root.querySelector('textarea[name="custom"]');
            area.value=[area.value.trimEnd(),row].filter(Boolean).join("\n");
            ui.notifications.info("已加入清單，請按「儲存」保存。");
          }
        } catch(error){ui.notifications.error(error.message);}
        finally{button.disabled=false;}
      });
    }
    async _updateObject(event, formData) {
      if (!this.personal && !game.user.isGM) return;
      try {
        const custom=String(formData.custom??"");
        parseOptions(custom, CONFIG.DND5E.damageTypes, formula => Roll.validate(formula));
        if(this.personal) {
          await game.user.setFlag(ID,"customEntries",custom);
          ui.notifications.info("個人自訂附傷已儲存。下次開啟傷害視窗時生效。");
          await this.close();
          return;
        }
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
  class PersonalDamageSettings extends DamageOptionsSettings {
    get personal() { return true; }
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions,{id:"optional-damage-personal",title:"我的自訂附傷"});
    }
  }
  game.settings.registerMenu(ID,"personalConfigure",{
    name:"我的自訂附傷",label:"管理個人附傷",icon:"fas fa-user-plus",
    hint:"玩家可新增自己的附傷；僅在自己操作擲骰時使用，角色仍須持有對應能力。",
    type:PersonalDamageSettings,restricted:false
  });
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

function damageTypeLabel(type) {
  return type === "inherit" ? "同主要傷害類型" : game.i18n.localize(CONFIG.DND5E.damageTypes[type].label);
}

function refreshEntries(state, config) {
  const subject = config.subject;
  const available = availableOptions(state.definitions, state.actor,
    subject?.item?.id ?? subject?.id, subject?.item ? subject : undefined);
  const entries = markExistingDamage(dedupeAvailable(available), config);
  const key = e => JSON.stringify([e.dialogIndex, e.presetKey, e.sourceItemId, e.abilityId]);
  const previous = new Map(state.entries.map((e, i) => [key(e), {entry:e, selected:state.selected.has(i)}]));
  const selected = new Set();
  entries.forEach((entry, i) => {
    const prior = previous.get(key(entry));
    if (!prior) return;
    const old = prior.entry;
    if (entry.choices) {
      const choice = !old.choicePending && entry.choices.find(c => c.formula === old.formula && c.type === old.type);
      entry.choicePending = !choice;
      if (choice) Object.assign(entry, choice);
    }
    if (entry.smite) {
      const oldSlot = old.slots.find(s => s.key === old.slotKey);
      const slot = entry.slots.find(s => s.key === old.slotKey);
      if (slot) entry.slotKey = slot.key;
      if (!slot || slot.level !== oldSlot?.level) return;
      entry.specialTarget = old.specialTarget;
    }
    // A replaced resource must be confirmed even when its feature still has the same name.
    if (prior.selected && JSON.stringify(old.resourceRequests) === JSON.stringify(entry.resourceRequests)) selected.add(i);
  });
  Object.assign(state, {entries, selected});
}

function resourceRequestsFor(entry, actor) {
  if (!entry.consumes) return entry.resourceRequests ?? [];
  const source = resourceItems(actor).find(item => item.id === entry.sourceItemId);
  return [{itemId:entry.sourceItemId, path:"system.uses.spent", cost:1, label:source?.name ?? "對應特性"}];
}

function resourceProblem(actor, requests) {
  try { resourcePlan(actor, requests); return ""; }
  catch (error) { return error.message; }
}

Hooks.on("renderDamageRollConfigurationDialog", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || !app.config?.rolls?.length) return;
  const oldPanel = root.querySelector(".optional-damage-panel");
  const base = app.config.rolls.filter(r => !r.options?.[ID]);
  if (base.every(r => {
    const types = Array.from(r.options?.types ?? [r.options?.type]);
    return types.length && types.every(t => Object.hasOwn(CONFIG.DND5E.healingTypes, t));
  })) {
    oldPanel?.remove();
    if (base.length !== app.config.rolls.length) { app.config.rolls = base; app.rebuild(); }
    states.delete(app);
    return;
  }
  let state = states.get(app);
  try {
    if (!state) {
      const subject = app.config.subject;
      state = {actor:subject?.actor ?? subject?.item?.actor, entries:[], selected:new Set(),
        definitions:entries().map((entry, dialogIndex) => ({...entry, dialogIndex}))};
      states.set(app, state);
    }
    refreshEntries(state, app.config);
  } catch (error) { ui.notifications.error(error.message); return; }

  const panel = document.createElement("fieldset");
  panel.className = "optional-damage-panel";
  const legend = document.createElement("legend");
  legend.textContent = "額外傷害（本次擲骰）";
  panel.append(legend);
  const refreshers = [];
  function sync() {
    // Validate selected rows first so a resource spent elsewhere cannot block an unrelated option.
    const accepted = [];
    for (const i of state.selected) {
      const entry = state.entries[i];
      if (!refreshers[i](accepted)) state.selected.delete(i);
      else accepted.push(entry);
    }
    state.entries.forEach((entry, i) => {
      const others = accepted.filter(other => other !== entry && !entriesConflict(entry, other));
      refreshers[i](others);
    });
    replaceExtras(app.config, state.entries, state.selected);
    // Only our derived fields determine whether a partial native render needs another formulas rebuild.
    const extras = app.config.rolls.filter(r => r.options?.[ID]).map(r => [r.parts, r.options]);
    const signature = JSON.stringify(extras);
    const changed = state.signature !== undefined && state.signature !== signature;
    state.signature = signature;
    return changed;
  }
  function update() { sync(); app.rebuild(); }

  state.entries.forEach((entry, i) => {
    const row = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    const label = document.createElement("span");
    input.addEventListener("change", event => {
      event.stopPropagation();
      if (input.checked && !input.disabled) {
        state.entries.forEach((other, j) => {
          if (i !== j && entriesConflict(entry, other)) state.selected.delete(j);
        });
        state.selected.add(i);
      } else state.selected.delete(i);
      update();
    });
    row.append(input, label);
    panel.append(row);
    if (entry.note || entry.disabledReason) {
      const note = document.createElement("small");
      note.textContent = entry.disabledReason || [entry.requiresCritical ? "按「重擊」才會套用；按「普通」會略過。" : "", entry.note].filter(Boolean).join(" ");
      panel.append(note);
    }
    let choices, slots, target;
    if (entry.choices) {
      choices = document.createElement("select");
      choices.setAttribute("aria-label", entry.label + "傷害選項");
      const placeholder = document.createElement("option");
      placeholder.value = ""; placeholder.textContent = "請選擇傷害類型／骰子";
      placeholder.selected = entry.choicePending;
      choices.append(placeholder);
      entry.choices.forEach((choice, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = choice.formula + " " + damageTypeLabel(choice.type);
        option.selected = !entry.choicePending && choice.formula === entry.formula && choice.type === entry.type;
        choices.append(option);
      });
      choices.disabled = Boolean(entry.disabledReason);
      choices.addEventListener("change", event => {
        event.stopPropagation();
        const choice = choices.value === "" ? undefined : entry.choices[Number(choices.value)];
        entry.choicePending = !choice;
        if (choice) Object.assign(entry, choice);
        else if (entry.choices.some(c => c.resourceRequests)) entry.resourceRequests = [];
        update();
      });
      panel.append(choices);
    }
    if (entry.smite) {
      const controls = document.createElement("div");
      slots = document.createElement("select");
      slots.setAttribute("aria-label", entry.label + "消耗的法術位");
      for (const slot of entry.slots) {
        const option = document.createElement("option");
        option.value = slot.key; option.selected = slot.key === entry.slotKey;
        slots.append(option);
      }
      slots.addEventListener("change", event => {
        event.stopPropagation();
        entry.slotKey = slots.value;
        update();
      });
      controls.append(slots);
      if (entry.smite === "divine") {
        const targetLabel = document.createElement("label");
        target = document.createElement("input");
        target.type = "checkbox";
        target.addEventListener("change", event => {
          event.stopPropagation();
          entry.specialTarget = !target.disabled && target.checked;
          update();
        });
        targetLabel.append(target, document.createTextNode("目標為邪魔 Fiend／亡靈 Undead：+1d8"));
        controls.append(targetLabel);
      }
      panel.append(controls);
    }
    const bindingError = !entry.resourceRequests?.length && !entry.choices?.some(c => c.resourceRequests) ? entry.resourceError : "";
    const showCost = entry.consumes || entry.resourceText || entry.smite;
    const hint = showCost ? document.createElement("small") : undefined;
    if (hint) panel.append(hint);
    refreshers.push(others => {
      let error = bindingError || "";
      const requests = resourceRequestsFor(entry, state.actor);
      const reserved = others.flatMap(other => resourceRequestsFor(other, state.actor));
      entry.choices?.forEach((choice, index) => {
        if (!choice.resourceRequests) return;
        const option = choices.children[index + 1];
        const reason = resourceProblem(state.actor, [...reserved, ...choice.resourceRequests]);
        option.disabled = Boolean(reason);
        option.textContent = choice.formula + " · " + resourceDescription(state.actor, choice.resourceRequests) + (reason ? "（不可用）" : "");
      });
      if (requests.length) error = resourceProblem(state.actor, [...reserved, ...requests]);
      let cost = requests.length ? resourceDescription(state.actor, requests) : entry.resourceText;
      if (slots) {
        const reservedSlots = others.filter(other => other.smite);
        for (const [index, slot] of entry.slots.entries()) {
          const count = reservedSlots.filter(other => other.slotKey === slot.key).length;
          const option = slots.children[index];
          option.disabled = !slotHasUses(slot.value, count + 1);
          option.textContent = slot.label + (count ? "，本次已選 " + count + " 個" : "");
          if (slot.key === entry.slotKey && option.disabled) error = "所選法術位可用數量不足";
        }
        if (!entry.slotKey) error = "沒有可用法術位";
        slots.disabled = Boolean(entry.disabledReason) || !entry.slots.some((_, j) => !slots.children[j].disabled);
        cost = "";
      }
      entry.resourceError = error;
      input.disabled = !canSelectEntry(entry, app.config);
      input.checked = !input.disabled && state.selected.has(i);
      if (target) {
        target.disabled = !input.checked;
        if (target.disabled) entry.specialTarget = false;
        target.checked = entry.specialTarget;
      }
      if (slots) entry.formula = entry.slotKey ? smiteFormula(entry) : "—";
      label.textContent = entry.label + "：+ " + entry.formula + " " + damageTypeLabel(entry.type);
      if (hint) hint.textContent = [cost, error && error !== cost ? error : ""].filter(Boolean).join("；");
      return !input.disabled;
    });
  });
  const changed = sync();
  if (state.entries.length) {
    const hint = document.createElement("small");
    hint.textContent = "請自行確認觸發條件；已由其他效果加入的傷害，請勿重複勾選。";
    panel.append(hint);
    if (oldPanel) oldPanel.replaceWith(panel);
    else {
      const anchor = root.querySelector('[data-application-part="configuration"]') ?? app.form ?? root.querySelector("form");
      if (!anchor) return;
      anchor.append(panel);
    }
    app.setPosition({height:"auto"});
  } else oldPanel?.remove();
  if (changed) app.rebuild();
});
