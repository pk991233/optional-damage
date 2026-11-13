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
      const itemBefore = new Map(ids.map(id => [id, actor.items.get(id)?.system?.uses?.spent]));
      try {
        if (slotEntries.length) {
          await actor.update({...slots});
          if (slotEntries.some(([path,value]) => readSlot(path) !== value))
            throw new Error("法術位更新未完成，請檢查角色卡後重試。");
        }
        if (ids.length) {
        const changed = await actor.updateEmbeddedDocuments("Item", changes.map(c=>({...c})));
        if (changed.length !== changes.length || changes.some(c => actor.items.get(c._id)?.system?.uses?.spent !== c["system.uses.spent"])) throw new Error("特性次數更新未完成，請檢查角色卡後重試。");
        }
      } catch (error) {
        // Restore only writes with exactly the value this attempt expected.
        const rollback = changes.filter(c => actor.items.get(c._id)?.system?.uses?.spent === c["system.uses.spent"])
          .map(c => ({_id:c._id, "system.uses.spent":itemBefore.get(c._id)}));
        let rollbackFailed = false;
        if (rollback.length) {
          try {
            await actor.updateEmbeddedDocuments("Item", rollback.map(c=>({...c})));
            rollbackFailed = rollback.some(c => actor.items.get(c._id)?.system?.uses?.spent !== c["system.uses.spent"]);
          } catch { rollbackFailed = true; }
        }
        // Compensate the slot write if the subsequent item write fails. Never overwrite a newer value.
        const refundable = slotEntries.filter(([path,value]) => readSlot(path) === value);
        if (refundable.length) {
          const refund = Object.fromEntries(refundable.map(([path])=>[path,before[path]]));
          try {
            await actor.update({...refund});
            if (refundable.some(([path])=>readSlot(path)!==before[path])) rollbackFailed=true;
          } catch { rollbackFailed=true; }
        }
        if (rollbackFailed) throw new Error("資源扣除失敗且無法完整退還；請 GM 檢查法術位與特性次數。");
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
