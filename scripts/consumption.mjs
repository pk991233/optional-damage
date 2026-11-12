import {ID, useStatus} from "./options.mjs";

// Serialize workflows for the same actor in this browser, including synthetic tokens.
export function consumptionWrapper(original, onError = () => {}) {
  const pending = new Map();
  const paid = new WeakSet();
  return async function(rolls, config = {}, ...args) {
    const candidates = rolls.filter(r => r.options?.[ID] && r.options.optionalDamageSource);
    if (config.evaluate === false || !candidates.length) return original.call(this, rolls, config, ...args);
    const actor = config.subject?.actor ?? config.subject?.item?.actor;
    const key = actor?.uuid ?? actor;
    const run = async () => {
      const unpaid = candidates.filter(r => !paid.has(r));
      const ids = [...new Set(unpaid.map(r => r.options.optionalDamageSource))];
      const updates = () => ids.map(id => {
        const item = actor?.items.get(id);
        const status = useStatus(item);
        if (status.reason) throw new Error(`${item?.name ?? "加傷特性"}：${status.reason}`);
        return {_id: id, "system.uses.spent": item.system.uses.spent + 1};
      });
      updates();
      const result = await original.call(this, rolls, config, ...args);
      if (ids.length) {
        const changes = updates(); // Recheck after asynchronous dice evaluation.
        const changed = await actor.updateEmbeddedDocuments("Item", changes);
        if (changed.length !== changes.length) throw new Error("特性次數更新未完成，請檢查角色卡後重試。");
        unpaid.forEach(r => paid.add(r));
      }
      return result;
    };
    const task = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
    pending.set(key, task);
    try { return await task; }
    catch (error) { onError(error); throw error; }
    finally { if (pending.get(key) === task) pending.delete(key); }
  };
}
