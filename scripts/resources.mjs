import {objectMatchesAbility} from "./rules.mjs";
// DnD5e 5.3.3: class hd.spent, item uses.spent and embedded activity uses.spent.
export const resourceItems = actor => Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
export const resourceActivities = item => Array.from(item?.system?.activities?.values?.() ?? Object.values(item?.system?.activities ?? {}));
export function resourceRead(object,path) {
 return path.split(".").reduce((v,k)=>v?.[k] ?? v?.get?.(k),object);
}
export const resourceMatches = objectMatchesAbility;
export function resourceStatus(actor,r) {
 const item=r.itemId?resourceItems(actor).find(i=>i.id===r.itemId):undefined;
 const doc=r.itemId?item:actor;
 if(!doc || !doc.isOwner)return {reason:"找不到資源或沒有修改權限",remaining:0,maximum:0};
 const current=resourceRead(doc,r.path);
 let maximum,remaining;
 if(r.direction===-1) {
  maximum=resourceRead(doc,r.path.replace(/\.value$/,".max"));
  remaining=current;
 } else {
  const base=r.path.replace(/\.spent$/,"");
  maximum=resourceRead(doc,base+".max");
  remaining=maximum-current;
 }
 if(!Number.isInteger(current)||current<0||!Number.isFinite(maximum)||maximum<0)
  return {reason:"資源資料未設定或無法讀取",remaining:0,maximum:0};
 return {remaining:Math.max(0,remaining),maximum,reason:remaining<r.cost?"資源不足":""};
}
function usesResource(item,activity,cost=1) {
 return {itemId:item.id,path:activity?"system.activities."+(activity.id??activity._id)+".uses.spent":"system.uses.spent",
  cost,label:activity?item.name+" → "+activity.name:item.name};
}
const POOLS={
 psionic:["Psionic Energy Dice","Psionic Energy Die","Psionic Power","Psionic Energy","靈能骰","靈能能量骰","靈能力量","靈能之力"],
 harm:["Monk's Focus","monks-focus","Ki","Ki Points","Focus Points","氣","氣點","集中力","武僧專注","武僧集中力","武僧之氣"]
};
export function bindResource(actor,owned,key,activityNames) {
 const exact=owned.flatMap(item=>resourceActivities(item).filter(a=>resourceMatches(a,activityNames)).map(activity=>({item,activity})));
 if(exact.length>1)return {error:"找到多個對應活動，請保留唯一資源來源"};
 const selected=exact[0] ?? (owned.length===1?{item:owned[0]}:undefined);
 if(!selected)return {error:"找不到唯一對應特性"};
 const {item,activity}=selected;
 const targets=activity?.consumption?.targets??[];
 if(targets.length) {
  const requests=[];
  for(const target of targets) {
   const cost=Number(target.value??1);
   if(!Number.isInteger(cost)||cost<1||target.scaling?.mode)return {error:"資源消耗公式或縮放不支援，請設定固定正整數消耗"};
   if(target.type==="itemUses") {
    const pool=target.target?resourceItems(actor).find(i=>i.id===target.target):item;
    if(!pool)return {error:"活動連結的資源不存在"};
    requests.push(usesResource(pool,null,cost));
   } else if(target.type==="activityUses") requests.push(usesResource(item,activity,cost));
   else if(target.type==="attribute"&&/^resources\.[\w-]+\.value$/.test(target.target)) {
    const path="system."+target.target,spent=path.replace(/\.value$/,".spent");
    const isSpent=resourceRead(actor._source,spent)!==undefined&&resourceRead(actor._source,path)===undefined;
    requests.push({path:isSpent?spent:path,direction:isSpent?1:-1,cost,label:key==="harm"?"氣／集中力":"靈能骰"});
   } else return {error:"此活動的資源類型尚不支援自動扣除"};
  }
  return {requests};
 }
 if(activity?.uses?.max>0)return {requests:[usesResource(item,activity)]};
 // Prefer the shared pool over feature-local counters when no explicit target exists.
 const pools=resourceItems(actor).filter(i=>i.type==="feat"&&resourceMatches(i,POOLS[key]??[]));
 if(pools.length>1)return {error:"找到多個同名資源池，請在能力活動中指定消耗來源"};
 if(pools.length===1)return {requests:[usesResource(pools[0])]};
 if(item.system?.uses?.max>0)return {requests:[usesResource(item)]};
 const attributes=Object.entries(actor.system?.resources??{}).filter(([,r])=>resourceMatches({name:r.label},POOLS[key]??[]));
 if(attributes.length===1)return {requests:[{path:"system.resources."+attributes[0][0]+".value",direction:-1,cost:1,label:attributes[0][1].label}]};
 return {error:attributes.length>1?"找到多個角色資源，請在活動中指定來源":"找不到氣／集中力或靈能骰資源；請設定能力活動的消耗來源"};
}
export function hitDicePools(actor) {
 return resourceItems(actor).filter(i=>i.type==="class").flatMap(item=>{
  const hd=item.system?.hd;
  if(!/^d(6|8|10|12)$/.test(hd?.denomination??""))return [];
  const max=hd.max??(Number(item.system.levels)+(Number(hd.additional)||0)),spent=hd.spent;
  return [{item,denomination:hd.denomination,maximum:max,
   remaining:Number.isInteger(spent)&&spent>=0&&Number.isFinite(max)?Math.max(0,max-spent):0,
   valid:Number.isInteger(spent)&&spent>=0&&Number.isFinite(max)&&max>=0}];
 });
}
export function hitDiceRequests(formula) {
 const terms=String(formula).replace(/\s/g,"").split("+"),requests=[];
 for(const term of terms) {
  const match=term.match(/^([12])d(6|8|10|12)$/);
  if(!match)throw Error("生命骰公式不支援");
  requests.push({kind:"hitDice",denomination:"d"+match[2],cost:Number(match[1])});
 }
 if(requests.reduce((n,r)=>n+r.cost,0)>2)throw Error("每次最多消耗兩顆生命骰");
 return requests;
}
// Combine all selections before checking funds, so two abilities cannot spend the same last die.
export function resourcePlan(actor,requests) {
 const expanded=[],reserved=new Map();
 for(const r of requests) {
  if(!Number.isInteger(r.cost)||r.cost<1)throw Error("無效資源消耗");
  if(r.kind!=="hitDice"){expanded.push(r);continue;}
  const pools=hitDicePools(actor).filter(p=>p.denomination===r.denomination&&p.valid&&p.item.isOwner);
  let needed=r.cost;
  for(const p of pools) {
   const available=p.remaining-(reserved.get(p.item.id)??0),cost=Math.min(needed,Math.max(0,available));
   if(cost) {
    expanded.push({itemId:p.item.id,path:"system.hd.spent",cost,label:"生命骰 "+r.denomination});
    reserved.set(p.item.id,(reserved.get(p.item.id)??0)+cost);needed-=cost;
   }
   if(!needed)break;
  }
  if(needed)throw Error("生命骰 "+r.denomination+" 不足或沒有修改權限");
 }
 const groups=new Map();
 for(const r of expanded) {
  const key=JSON.stringify([r.itemId??null,r.path]);
  if(groups.has(key))groups.get(key).cost+=r.cost;else groups.set(key,{...r});
 }
 const actorUpdates={},itemUpdates=new Map();
 for(const r of groups.values()) {
  const doc=r.itemId?resourceItems(actor).find(i=>i.id===r.itemId):actor;
  if(r.path==="system.hd.spent") {
   const pool=hitDicePools(actor).find(p=>p.item.id===r.itemId);
   if(!pool?.valid||!doc?.isOwner||pool.remaining<r.cost)throw Error("生命骰不足");
  } else {
   if(!/^(system\.uses\.spent|system\.activities\.[\w-]+\.uses\.spent|system\.resources\.[\w-]+\.(value|spent))$/.test(r.path))throw Error("無效資源欄位");
   const status=resourceStatus(actor,r);
   if(status.reason)throw Error((r.label??"資源")+"："+status.reason);
  }
  const value=resourceRead(doc,r.path)+(r.direction===-1?-r.cost:r.cost);
  if(r.itemId) {
   if(!itemUpdates.has(r.itemId))itemUpdates.set(r.itemId,{_id:r.itemId});
   itemUpdates.get(r.itemId)[r.path]=value;
  } else actorUpdates[r.path]=value;
 }
 return {actor:actorUpdates,items:[...itemUpdates.values()]};
}
export function resourceDescription(actor,requests) {
 return requests.map(r=>{
  if(r.kind==="hitDice") {
   const pools=hitDicePools(actor).filter(p=>p.denomination===r.denomination);
   return r.denomination+" 剩餘 "+pools.reduce((n,p)=>n+p.remaining,0)+"/"+pools.reduce((n,p)=>n+(p.valid?p.maximum:0),0)+"，消耗 "+r.cost+" 顆；來源："+(pools.map(p=>p.item.name).join("、")||"未找到對應職業");
  }
  const s=resourceStatus(actor,r);const storage=r.path?.startsWith("system.activities.")?"活動次數":r.path?.startsWith("system.resources.")?"角色資源":"特性次數";
  return "來源："+(r.label??"資源")+" → "+storage+"；剩餘 "+s.remaining+"/"+s.maximum+"，消耗 "+r.cost;
 }).join("；");
}
export function applyResourceBinding(entry,actor,binding) {
 entry.resourceRequests=binding.requests??[];
 entry.resourceText=binding.error??resourceDescription(actor,entry.resourceRequests);
 if(binding.error)entry.resourceError=binding.error;
 else try{resourcePlan(actor,entry.resourceRequests);}catch(error){entry.resourceError=error.message;}
 return entry;
}

/** Resolve the alternative Harm cost without ever borrowing the normal Ki pool. */
export function bindFlurryResource(actor,item,names) {
 const activities=resourceActivities(item);
 const own=activities.filter(a=>resourceMatches(a,names)&&a.uses?.max>0);
 if(own.length>1)return {error:"找到多個活殺自在活動資源，請指定唯一來源"};
 if(own.length===1)return {requests:[usesResource(item,own[0])]};
 if(item.system?.uses?.max>0)return {requests:[usesResource(item)]};
 const named=activities.filter(a=>resourceMatches(a,names)&&a.consumption?.targets?.length);
 const linked=named.length?named:activities.filter(a=>a.consumption?.targets?.length);
 if(linked.length>1)return {error:"找到多個活殺自在消耗活動，無法確定來源"};
 if(!linked.length)return {requests:[usesResource(item)]};
 const activity=linked[0];
 if((activity.consumption.targets??[]).some(t=>!["itemUses","activityUses"].includes(t.type)))
  return {error:"活殺自在僅支援特性／活動次數，不會改扣氣或其他屬性"};
 const binding=bindResource(actor,[item],"flurry",[activity.name]);
 if(binding.error)return binding;
 if(binding.requests.length!==1||binding.requests[0].cost!==1)
  return {error:"活殺自在須連結一項資源並消耗 1 次"};
 const request=binding.requests[0],pool=resourceItems(actor).find(i=>i.id===request.itemId);
 if(!pool||resourceMatches(pool,POOLS.harm))
  return {error:"活殺自在不可連結氣／集中力，請設定獨立次數"};
 return binding;
}
