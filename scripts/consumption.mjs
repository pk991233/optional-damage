import {ID, useStatus} from "./options.mjs";
import {slotUpdates} from "./smite.mjs";

// Serialize workflows for the same actor in this browser, including synthetic tokens.
export function consumptionWrapper(original, onError = () => {}) {
  const pending = new Map();
  const paid = new WeakSet();
  return async function(rolls, config = {}, ...args) {
    const candidates = rolls.filter(r => r.options?.[ID] && (r.options.optionalDamageSource || r.options.optionalDamageSlot));
    if (config.evaluate === false || !candidates.length) return original.call(this, rolls, config, ...args);
    const actor = config.subject?.actor ?? config.subject?.item?.actor;
    const key = actor?.uuid ?? actor;
    const run = async () => {
      const unpaid = candidates.filter(r => !paid.has(r));
      const ids = [...new Set(unpaid.map(r => r.options.optionalDamageSource).filter(Boolean))];
      const updates = () => ids.map(id => {
        const item = actor?.items.get(id);
        const status = useStatus(item);
        if (status.reason) throw new Error(`${item?.name ?? "加傷特性"}：${status.reason}`);
        return {_id: id, "system.uses.spent": item.system.uses.spent + 1};
      });
      updates();
      slotUpdates(actor, unpaid);
      const result = await original.call(this, rolls, config, ...args);
      const changes = updates(); // Recheck after asynchronous dice evaluation.
      const slots = slotUpdates(actor, unpaid);
      // Document.update may expand/mutate its input. Keep an independent immutable snapshot.
      const slotEntries = Object.entries(slots);
      const readSlot = path => actor.system?.spells?.[path.split('.')[2]]?.value;
      const before = Object.fromEntries(slotEntries.map(([path]) => [path, readSlot(path)]));
      if (slotEntries.length) {
        await actor.update({...slots});
        if (slotEntries.some(([path,value]) => readSlot(path) !== value)) {
          throw new Error("法術位更新未完成，請檢查角色卡後重試。");
        }
      }
      try {
        if (ids.length) {
        const changed = await actor.updateEmbeddedDocuments("Item", changes);
        if (changed.length !== changes.length) throw new Error("特性次數更新未完成，請檢查角色卡後重試。");
        }
      } catch (error) {
        // Compensate the slot write if the subsequent item write fails. Never overwrite a newer value.
        if (slotEntries.length && slotEntries.every(([path,value]) => readSlot(path) === value)) {
          try { await actor.update({...before}); }
          catch { throw new Error("特性扣除失敗，法術位也無法退還；請 GM 檢查角色資源。"); }
        }
        throw error;
      }
      unpaid.forEach(r => paid.add(r));
      return result;
    };
    const task = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
    pending.set(key, task);
    try { return await task; }
    catch (error) { onError(error); throw error; }
    finally { if (pending.get(key) === task) pending.delete(key); }
  };
}
