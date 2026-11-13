// Opt-in damage presets. Conditions and manual costs are displayed to the player.
export const EXTRA_PRESETS = [
  [
    "暴徒：刺殺",
    "preset:thug",
    "inherit",
    "刺殺;Assassination;Thug;暴徒"
  ],
  [
    "刺客：暗殺",
    "preset:assassinate",
    "inherit",
    "暗殺;Assassinate"
  ],
  [
    "凶蠻打擊",
    "preset:brutal",
    "inherit",
    "凶蠻打擊;Brutal Strike"
  ],
  [
    "狂亂",
    "preset:frenzy",
    "inherit",
    "狂亂;Frenzy"
  ],
  [
    "神性狂怒",
    "preset:fury",
    "radiant",
    "神性狂怒;Divine Fury"
  ],
  [
    "靈能打擊",
    "preset:psionic",
    "force",
    "靈能打擊;Psionic Strike"
  ],
  [
    "奪命之手",
    "preset:harm",
    "necrotic",
    "奪命之手;Hand of Harm"
  ],
  [
    "神聖打擊",
    "preset:divineStrike",
    "radiant",
    "神聖打擊;Divine Strike;Blessed Strikes;祝福打擊"
  ],
  [
    "強力施法（牧師）",
    "preset:clericPotent",
    "inherit",
    "強力施法;Potent Spellcasting;Blessed Strikes;祝福打擊"
  ],
  [
    "死亡牽引",
    "preset:pull",
    "necrotic",
    "死亡牽引;Pull of Death;Circle of Mortality;生死輪迴"
  ],
  [
    "原初打擊",
    "preset:primal",
    "cold",
    "原初打擊;Primal Strike;Elemental Fury;元素狂怒"
  ],
  [
    "強力施法（德魯伊）",
    "preset:druidPotent",
    "inherit",
    "強力施法;Potent Spellcasting;Elemental Fury;元素狂怒"
  ],
  [
    "月之形態",
    "preset:lunar",
    "radiant",
    "月之形態;Lunar Form"
  ],
  [
    "奧法衝擊",
    "preset:jolt",
    "force",
    "奧法衝擊;Arcane Jolt"
  ],
  [
    "閃電發射器",
    "preset:launcher",
    "lightning",
    "閃電發射器;Lightning Launcher"
  ],
  [
    "煉金學者",
    "preset:savant",
    "inherit",
    "煉金學者;Alchemical Savant"
  ],
  [
    "化學精通",
    "preset:chemical",
    "force",
    "化學精通;Chemical Mastery"
  ],
  [
    "導引精準",
    "preset:guided",
    "inherit",
    "導引精準;Guided Precision"
  ],
  [
    "吸命斬",
    "preset:lifedrinker",
    "necrotic",
    "吸命斬;Lifedrinker;Eldritch Invocations: Lifedrinker"
  ],
  [
    "光耀之魂",
    "preset:soul",
    "inherit",
    "光耀之魂;Radiant Soul"
  ],
  [
    "墓穴之觸",
    "preset:grave",
    "necrotic",
    "墓穴之觸;Grave Touched"
  ],
  [
    "元素親和",
    "preset:affinity",
    "inherit",
    "元素親和;Elemental Affinity"
  ],
  [
    "強效塑能",
    "preset:evocation",
    "inherit",
    "強效塑能;Empowered Evocation"
  ],
  [
    "戰鬥激勵",
    "preset:inspiration",
    "inherit",
    "戰鬥激勵;Combat Inspiration"
  ],
  [
    "強化通靈",
    "preset:channeling",
    "inherit",
    "強化通靈;Empowered Channeling"
  ],
  [
    "天界顯化",
    "preset:celestial",
    "radiant",
    "天界顯化;Celestial Revelation"
  ],
  [
    "凶蠻攻擊",
    "preset:savage",
    "inherit",
    "凶蠻攻擊;野蠻攻擊;Savage Attacks"
  ],
  [
    "衝鋒者",
    "preset:charger",
    "inherit",
    "衝鋒者;Charger"
  ],
  [
    "巨武器大師",
    "preset:gwm",
    "inherit",
    "巨武器大師;Great Weapon Master"
  ],
  [
    "魔焰專家",
    "preset:spellfire",
    "inherit",
    "魔焰專家;Spellfire Adept"
  ],
  [
    "塑能增幅",
    "preset:fueled",
    "inherit",
    "塑能增幅;Fueled Evocation;Evocation Adept;塑能學派專家"
  ],
  [
    "冰霜之指",
    "preset:frost",
    "cold",
    "冰霜之指;Fingers of Frost"
  ]
];
export const EXTRA_KEYS = new Set([...EXTRA_PRESETS.map(p=>p[1]),"preset:radiant"]);
const CLASSES = {
 rogue:["rogue","遊蕩者","盜賊"], barbarian:["barbarian","野蠻人"], fighter:["fighter","戰士"],
 paladin:["paladin","聖騎士"], monk:["monk","武僧"], cleric:["cleric","牧師"],
 druid:["druid","德魯伊"], artificer:["artificer","奇械師"], warlock:["warlock","契術師"],
 sorcerer:["sorcerer","術士"], wizard:["wizard","法師"], bard:["bard","吟遊詩人"]
};
const norm = s => String(s??"").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
export function classLevel(actor,key) {
 const cls=Array.from(actor.items??[]).find(i=>i.type==="class" &&
  CLASSES[key]?.some(n=>[i.name,i.system?.identifier].some(v=>norm(v)===norm(n))));
 const n=Number(cls?.system?.levels);
 return Number.isInteger(n)&&n>0&&n<=20?n:0;
}
const RULES = {
 thug:["rogue",6,"偷襲浴血目標；額外骰為熟練加值的一半，奇數時請依 GM 裁定選擇取整。"],
 assassinate:["rogue",3,"戰鬥第一輪；此次攻擊必須已符合偷襲。"],
 brutal:["barbarian",9,"使用魯莽攻擊、放棄此次優勢且沒有劣勢；每個自己的回合一次。"],
 frenzy:["barbarian",3,"狂暴且使用魯莽攻擊；自己回合首次以力量攻擊命中。"],
 fury:["barbarian",3,"狂暴時，自己回合首次武器或徒手命中。"],
 psionic:["fighter",3,"武器命中30尺內目標；自己回合一次。需手動消耗1顆靈能骰。"],
 radiant:["paladin",11,"近戰武器或徒手命中；若角色卡已加入此傷害，請勿重複勾選。"],
 harm:["monk",3,"徒手命中，每回合一次；手動消耗1點集中力，或確認疾風連擊的免費次數。"],
 divineStrike:["cleric",7,"確認祝福打擊選的是神聖打擊；武器命中，自己回合一次。"],
 clericPotent:["cleric",7,"確認選的是強力施法；僅牧師戲法，請勿重複既有加值。"],
 pull:["cleric",3,"攻擊或法術傷害未滿血目標；每回合一次。"],
 primal:["druid",7,"確認元素狂怒選的是原初打擊；武器或荒野形態命中，自己回合一次。"],
 druidPotent:["druid",7,"確認選的是強力施法；僅德魯伊戲法，請勿重複既有加值。"],
 lunar:["druid",14,"荒野形態攻擊命中；每回合一次。"],
 jolt:["artificer",9,"魔法武器或鋼鐵守衛命中；每回合一次；自動消耗特性1次。"],
 launcher:["artificer",3,"僅閃電發射器命中；自己回合一次；確認原傷害尚未包含此額外1d6。"],
 savant:["artificer",5,"透過鍊金工具施放符合條件的強酸／火焰／毒素法術；一次傷害骰。"],
 chemical:["artificer",15,"奇械師法術造成強酸／火焰／毒素傷害；自己回合一次。"],
 guided:["artificer",5,"製圖師法術造成傷害，或攻擊命中自己妖火影響的目標；每回合一次。"],
 lifedrinker:["warlock",9,"契約武器命中；每回合一次。額外治療及生命骰消耗另行處理。"],
 soul:["warlock",6,"火焰／光耀法術對一個目標加傷；每回合一次。"],
 grave:["warlock",6,"恐懼形態中，符合條件的攻擊轉為黯蝕後增加一顆傷害骰；每回合一次。原傷害轉換需另行設定。"],
 affinity:["sorcerer",6,"僅與龍族元素親和相符的法術傷害；一次傷害骰。"],
 evocation:["wizard",10,"僅符合強效塑能條件的法師塑能法術；一次傷害骰。"],
 inspiration:[null,0,"僅使用勇氣學院給予的吟遊激勵；選給予者的骰面，並手動消耗持有的1次激勵。"],
 channeling:["bard",6,"使用法術位施放符合條件的吟遊詩人法術；每回合一次。"],
 celestial:[null,0,"天界顯化啟動期間；自己回合一次。變身次數在啟動變身時扣除。"],
 savage:[null,0,"僅近戰武器重擊；選武器的一顆基礎傷害骰，此額外骰不再因重擊翻倍。"],
 charger:[null,0,"攻擊動作中，直線移動至少10尺後立即近戰命中；每回合一次。"],
 gwm:[null,0,"自己回合，以攻擊動作中的重型武器命中；勿重複角色卡既有加值。"],
 spellfire:[null,0,"光耀法術傷害，每回合一次；需手動扣除所選生命骰，並持有網站要求的魔焰火花。"],
 fueled:[null,0,"塑能法術傷害，每回合一次；需手動扣除所選生命骰。"],
 frost:[null,0,"對束縛目標造成寒冷傷害時使用。"]
};
export function resolveExtra(entry,actor,owned,sourceItemId,useStatus) {
 const key=entry.formula.slice(7), rule=RULES[key];
 if(!rule) return [];
 const [cls,min,note]=rule, level=cls?classLevel(actor,cls):0;
 if(cls&&level<min) return [];
 const source=Array.from(actor.items??[]).find(i=>i.id===sourceItemId);
 if(key!=="launcher"&&sourceItemId&&owned.some(i=>i.id===sourceItemId)) return [];
 const spellOnly=["druidPotent","savant","chemical","soul","affinity","evocation","channeling","spellfire","fueled"];
 if(spellOnly.includes(key)&&source?.type!=="spell") return [];
 if(["druidPotent"].includes(key)&&Number(source.system?.level)!==0) return [];
 if(key==="channeling"&&!(Number(source.system?.level)>0)) return [];
 const prof=Number(actor.system?.attributes?.prof);
 const mod=a=>Number(actor.system?.abilities?.[a]?.mod);
 const e={...entry,presetKey:key,note,consumes:false,sourceItemId:owned[0].id};
 const choose=(formulas,types=[entry.type])=>{
  e.choices=formulas.flatMap(formula=>types.map(type=>({formula:String(formula),type})));
  e.formula=e.choices[0].formula;e.type=e.choices[0].type;e.choicePending=true;
 };
 const die=[4,6,8,10,12].map(d=>"1d"+d);
 const martial=level>=17?12:level>=11?10:level>=5?8:6;
 switch(key) {
 case "thug": {
  const low=Math.floor(prof/2),high=Math.ceil(prof/2);
  if(!Number.isFinite(prof)||low<1)return [];
  if(low===high)e.formula=low+"d6";else choose([low+"d6",high+"d6"]);
  break;
 }
 case "assassinate":e.formula=String(level);break;
 case "brutal":e.formula=level>=17?"2d10":"1d10";break;
 case "frenzy":e.formula=(level>=16?4:level>=9?3:2)+"d6";break;
 case "fury":choose(["1d6 + "+Math.floor(level/2)],["radiant","necrotic"]);break;
 case "psionic":e.formula="1d"+(level>=17?12:level>=11?10:level>=5?8:6)+" + "+mod("int");break;
 case "radiant":e.formula="1d8";break;
 case "harm":e.formula="1d"+martial+" + "+mod("wis");break;
 case "divineStrike":choose([level>=14?"2d8":"1d8"],["radiant","necrotic"]);e.choicePending=false;break;
 case "primal":choose([level>=15?"2d8":"1d8"],["cold","fire","lightning","thunder"]);break;
 case "clericPotent":case "druidPotent":e.formula=String(mod("wis"));break;
 case "pull":e.formula=level>=11?"1d6":"1d4";break;
 case "lunar":e.formula="2d10";break;
 case "jolt": {
  e.formula=level>=15?"4d6":"2d6";e.consumes=true;
  const status=useStatus(owned[0]);Object.assign(e,status,{disabledReason:status.reason});break;
 }
 case "launcher":e.formula="1d6";break;
 case "savant":choose([mod("int")],["acid","fire","poison"]);break;
 case "chemical":e.formula="2d8";break;
 case "guided":case "evocation":e.formula=String(mod("int"));break;
 case "lifedrinker":choose(["1d6"],["necrotic","psychic","radiant"]);break;
 case "soul":choose([mod("cha")],["fire","radiant"]);break;
 case "grave":choose(die,["necrotic"]);break;
 case "affinity":choose([mod("cha")],["acid","cold","fire","lightning","poison"]);break;
 case "inspiration":choose(["1d6","1d8","1d10","1d12"]);break;
 case "channeling":e.formula="1d6";break;
 case "celestial":choose([prof],["radiant","necrotic"]);break;
 case "savage":choose(die);e.noCritical=true;e.requiresCritical=true;break;
 case "charger":e.formula="1d8";break;
 case "gwm":e.formula=String(prof);break;
 case "spellfire":case "fueled":{
  const sizes=[...new Set(Array.from(actor.items??[]).filter(i=>i.type==="class").map(i=>{
   const value=i.system?.hd?.denomination??i.system?.hitDice;
   const match=String(value??"").match(/^(?:1)?d(6|8|10|12)$/);
   return match?Number(match[1]):null;
  }).filter(Boolean))];
  const ds=sizes.length?sizes:[6,8,10,12], formulas=ds.map(d=>"1d"+d);
  for(let a=0;a<ds.length;a++)for(let b=a;b<ds.length;b++)
   formulas.push(ds[a]===ds[b]?"2d"+ds[a]:"1d"+ds[a]+" + 1d"+ds[b]);
  choose(formulas,key==="spellfire"?["radiant"]:["inherit"]);break;
 }
 case "frost":e.formula=prof+"d4";break;
 }
 if(/NaN|undefined/.test(e.formula)||e.choices?.some(c=>/NaN|undefined/.test(c.formula)))
  e.disabledReason="無法讀取所需的屬性調整值或熟練加值";
 if(owned.length>1)e.disabledReason="找到多個對應特性，請保留唯一對應項目";
 return [e];
}
