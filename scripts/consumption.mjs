import {ID, useStatus} from "./options.mjs";
import {slotUpdates} from "./smite.mjs";
import {resourcePlan, resourceRead, resourceItems} from "./resources.mjs";

// Serialize resource writes for the same actor within this browser.
export function consumptionWrapper(original,onError=()=>{}) {
 const pending=new Map(),paid=new WeakSet();
 return async function(rolls,config={},...args) {
  const candidates=rolls.filter(r=>r.options?.[ID]&&(r.options.optionalDamageSource||r.options.optionalDamageSlot||r.options.optionalDamageResources?.length));
  if(config.evaluate===false||!candidates.length)return original.call(this,rolls,config,...args);
  const actor=config.subject?.actor??config.subject?.item?.actor,key=actor?.uuid??actor;
  const run=async()=>{
   const unpaid=candidates.filter(r=>!paid.has(r));
   const build=()=>{
    const ids=[...new Set(unpaid.map(r=>r.options.optionalDamageSource).filter(Boolean))];
    const requests=unpaid.flatMap(r=>r.options.optionalDamageResources??[]).map(r=>({...r}));
    for(const id of ids) {
     const item=resourceItems(actor).find(i=>i.id===id),status=useStatus(item);
     if(status.reason)throw Error((item?.name??"加傷特性")+"："+status.reason);
     requests.push({itemId:id,path:"system.uses.spent",cost:1,label:item.name});
    }
    const plan=resourcePlan(actor,requests),slots=slotUpdates(actor,unpaid);
    for(const [path,value] of Object.entries(slots)) {
     if(Object.hasOwn(plan.actor,path))throw Error("重複法術位資源設定");
     plan.actor[path]=value;
    }
    return plan;
   };
   build();
   const result=await original.call(this,rolls,config,...args);
   const plan=build();
   const records=[
    ...Object.entries(plan.actor).map(([path,value])=>({path,value})),
    ...plan.items.flatMap(c=>Object.entries(c).filter(([k])=>k!=="_id").map(([path,value])=>({itemId:c._id,path,value})))
   ];
   const document=r=>r.itemId?resourceItems(actor).find(i=>i.id===r.itemId):actor;
   records.forEach(r=>r.before=resourceRead(document(r),r.path));
   const write=async records=>{
    const actorData={},items=new Map();
    for(const r of records) {
     if(r.itemId) {
      if(!items.has(r.itemId))items.set(r.itemId,{_id:r.itemId});
      items.get(r.itemId)[r.path]=r.value;
     }else actorData[r.path]=r.value;
    }
    if(Object.keys(actorData).length) {
     await actor.update({...actorData});
     if(records.filter(r=>!r.itemId).some(r=>resourceRead(document(r),r.path)!==r.value))throw Error("資源更新未完成，請檢查角色卡後重試。");
    }
    if(items.size) {
     const changed=await actor.updateEmbeddedDocuments("Item",[...items.values()].map(c=>({...c})));
     if(changed?.length!==items.size||records.filter(r=>r.itemId).some(r=>resourceRead(document(r),r.path)!==r.value))throw Error("特性次數更新未完成，請檢查角色卡後重試。");
    }
   };
   try {await write(records);}
   catch(error) {
    const rollback=records.filter(r=>resourceRead(document(r),r.path)===r.value).map(r=>({...r,value:r.before}));
    // Attempt actor and item refunds independently.
    let failed=false;
    for(const subset of [rollback.filter(r=>r.itemId),rollback.filter(r=>!r.itemId)]) {
     if(!subset.length)continue;
     try{await write(subset);}catch{failed=true;}
    }
    if(failed)throw Error("資源扣除失敗且無法完整退還；請 GM 檢查法術位、特性次數與生命骰。");
    throw error;
   }
   unpaid.forEach(r=>paid.add(r));return result;
  };
  const task=(pending.get(key)??Promise.resolve()).catch(()=>{}).then(run);pending.set(key,task);
  try{return await task;}catch(error){onError(error);throw error;}
  finally{if(pending.get(key)===task)pending.delete(key);}
 };
}
