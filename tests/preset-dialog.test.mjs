import {test} from "node:test";
import assert from "node:assert/strict";

test('preset choice enables checkbox and changes damage without duplicating rolls',async()=>{
 const hooks={};
 globalThis.Hooks={once(){},on(name,fn){hooks[name]=fn;}};
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};}
  append(...nodes){this.children.push(...nodes);}
  setAttribute(){}
  addEventListener(event,fn){this.events[event]=fn;}
  querySelector(s){return s.includes('data-application-part')?this:null;}
  change(){this.events.change({stopPropagation(){}});}
 }
 globalThis.HTMLElement=Element;
 globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({text})};
 globalThis.CONFIG={DND5E:{damageTypes:{radiant:{label:'Radiant'},necrotic:{label:'Necrotic'}},healingTypes:{}}};
 globalThis.game={settings:{get:()=> '神性狂怒 | preset:fury | radiant | Divine Fury'},i18n:{localize:x=>x}};
 globalThis.Roll={validate:()=>true};
 globalThis.ui={notifications:{error:m=>{throw Error(m);}}};
 await import('../scripts/main.mjs?choices');
 const actor={items:[{id:'f',type:'feat',name:'Divine Fury'},{type:'class',name:'Barbarian',system:{levels:3}}]};
 const app={config:{subject:{actor},rolls:[{parts:['1d8'],options:{type:'slashing'}}]},rebuild(){},setPosition(){}};
 const root=new Element('root');hooks.renderDamageRollConfigurationDialog(app,root);
 const panel=root.children[0],check=panel.children[1].children[0],select=panel.children.find(e=>e.tag==='select');
 assert.equal(check.disabled,true);select.value='1';select.change();assert.equal(check.disabled,false);
 check.checked=true;check.change();assert.equal(app.config.rolls[1].options.type,'necrotic');
 select.value='0';select.change();assert.equal(app.config.rolls.length,2);assert.equal(app.config.rolls[1].options.type,'radiant');
 select.value='';select.change();assert.equal(check.disabled,true);assert.equal(app.config.rolls.length,1);
});

test('cleric checkboxes are immediately enabled and switch both directions',async()=>{
 const hooks={};
 globalThis.Hooks={once(){},on(name,fn){hooks[name]=fn;}};
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};}
  append(...nodes){this.children.push(...nodes);}
  setAttribute(){}
  addEventListener(event,fn){this.events[event]=fn;}
  querySelector(s){return s.includes('data-application-part')?this:null;}
  change(){this.events.change({stopPropagation(){}});}
 }
 globalThis.HTMLElement=Element;
 globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({text})};
 globalThis.CONFIG={DND5E:{damageTypes:{radiant:{label:'Radiant'},necrotic:{label:'Necrotic'}},healingTypes:{}}};
 globalThis.game={settings:{get:()=> '神聖打擊 | preset:divineStrike | radiant | Blessed Strikes\n強力施法（牧師） | preset:clericPotent | inherit | Blessed Strikes'},i18n:{localize:x=>x}};
 globalThis.Roll={validate:()=>true};
 globalThis.ui={notifications:{error:m=>{throw Error(m);}}};
 await import('../scripts/main.mjs?cleric');
 const actor={items:[{id:'f',type:'feat',name:'Blessed Strikes'},{type:'class',name:'Cleric',system:{levels:7}}],system:{abilities:{wis:{mod:3}}}};
 const app={config:{subject:{actor},rolls:[{parts:['1d8'],options:{type:'slashing'}}]},rebuild(){},setPosition(){}};
 const root=new Element('root');hooks.renderDamageRollConfigurationDialog(app,root);
 const checks=root.children[0].children.filter(e=>e.tag==='label').map(e=>e.children[0]);
 assert.equal(checks.length,2);assert.ok(checks.every(c=>!c.disabled));
 checks[0].checked=true;checks[0].change();
 checks[1].checked=true;checks[1].change();
 assert.equal(checks[0].checked,false);assert.equal(checks[0].disabled,false);
 assert.equal(app.config.rolls[1].parts[0],"3");
 checks[0].checked=true;checks[0].change();
 assert.equal(checks[1].checked,false);assert.equal(checks[1].disabled,false);
 assert.equal(app.config.rolls[1].parts[0],"1d8");assert.equal(app.config.rolls.length,2);
});

test('hit dice UI shows remaining dice, disables unaffordable choices and shares the budget',async()=>{
 const hooks={};
 globalThis.Hooks={once(){},on(name,fn){hooks[name]=fn;}};
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};}
  append(...nodes){this.children.push(...nodes);}
  setAttribute(){}
  addEventListener(event,fn){this.events[event]=fn;}
  querySelector(s){return s.includes('data-application-part')?this:null;}
  change(){this.events.change({stopPropagation(){}});}
 }
 globalThis.HTMLElement=Element;
 globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({text})};
 globalThis.CONFIG={DND5E:{damageTypes:{radiant:{label:'Radiant'}},healingTypes:{}}};
 globalThis.game={settings:{get:()=> '魔焰專家 | preset:spellfire | radiant | Spellfire Adept\n塑能增幅 | preset:fueled | inherit | Fueled Evocation'},i18n:{localize:x=>x}};
 globalThis.Roll={validate:()=>true};
 globalThis.ui={notifications:{error:m=>{throw Error(m);}}};
 await import('../scripts/main.mjs?hit-dice');
 const actor={isOwner:true,items:[
  {id:'s',type:'feat',name:'Spellfire Adept'},{id:'f',type:'feat',name:'Fueled Evocation'},
  {id:'spell',type:'spell',system:{level:1}},
  {id:'c',isOwner:true,type:'class',name:'Wizard',system:{levels:1,hd:{denomination:"d6",max:1,spent:0}}}
 ]};
 const app={config:{subject:{actor,item:{id:'spell'}},rolls:[{parts:['1d8'],options:{type:'radiant'}}]},rebuild(){},setPosition(){}};
 const root=new Element('root');hooks.renderDamageRollConfigurationDialog(app,root);
 const panel=root.children[0],checks=panel.children.filter(e=>e.tag==='label').map(e=>e.children[0]),selects=panel.children.filter(e=>e.tag==='select');
 assert.equal(checks.length,2);assert.ok(checks.every(c=>c.disabled));
 assert.match(selects[0].children[1].textContent,/剩餘 1\/1/);
 assert.equal(selects[0].children[2].disabled,true);
 selects[0].value='0';selects[0].change();selects[1].value='0';selects[1].change();
 assert.ok(checks.every(c=>!c.disabled));
 checks[0].checked=true;checks[0].change();assert.equal(checks[1].disabled,true);
 assert.equal(app.config.rolls[1].options.optionalDamageResources[0].cost,1);
 checks[0].checked=false;checks[0].change();assert.equal(checks[1].disabled,false);
 selects[1].value='1';selects[1].change();assert.equal(checks[1].disabled,true);
 assert.equal(app.config.rolls.length,1);
});
