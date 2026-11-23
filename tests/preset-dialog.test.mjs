import {afterEach, test} from "node:test";
import assert from "node:assert/strict";

class Element {
 constructor(tag) { this.tag = tag; this.children = []; this.events = {}; }
 append(...nodes) {
  for (const node of nodes) { node.parent = this; this.children.push(node); }
 }
 replaceWith(node) {
  const index = this.parent.children.indexOf(this);
  this.parent.children[index] = node; node.parent = this.parent;
 }
 remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
 setAttribute() {}
 addEventListener(event, fn) { this.events[event] = fn; }
 querySelector(selector) {
  if (selector === ".optional-damage-panel") return this.children.find(e => e.className === "optional-damage-panel");
  return selector.includes("data-application-part") ? this : null;
 }
 change() { this.events.change({stopPropagation(){}}); }
}

const originals = new Map(["Hooks", "HTMLElement", "document", "CONFIG", "game", "Roll", "ui"].map(key =>
 [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
 for (const [key, descriptor] of originals) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else delete globalThis[key];
 }
});

let fixtureId = 0;
async function setupDialog(settings, types) {
 const hooks = {};
 globalThis.Hooks = {once(){}, on(name, fn){ hooks[name] = fn; }};
 globalThis.HTMLElement = Element;
 globalThis.document = {createElement:tag => new Element(tag), createTextNode:text => ({text})};
 globalThis.CONFIG = {DND5E:{damageTypes:types, healingTypes:{}}};
 globalThis.game = {settings:{get:() => settings}, i18n:{localize:x => x}};
 globalThis.Roll = {validate:() => true};
 globalThis.ui = {notifications:{error:message => { throw Error(message); }}};
 await import(`../scripts/main.mjs?dialogFixture=${++fixtureId}`);
 return hooks;
}

test('preset choice enables checkbox and changes damage without duplicating rolls',async()=>{
 const hooks=await setupDialog('神性狂怒 | preset:fury | radiant | Divine Fury',{radiant:{label:'Radiant'},necrotic:{label:'Necrotic'}});
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
 const hooks=await setupDialog('神聖打擊 | preset:divineStrike | radiant | Blessed Strikes\n強力施法（牧師） | preset:clericPotent | inherit | Blessed Strikes',{radiant:{label:'Radiant'},necrotic:{label:'Necrotic'}});
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
 const hooks=await setupDialog('魔焰專家 | preset:spellfire | radiant | Spellfire Adept\n塑能增幅 | preset:fueled | inherit | Fueled Evocation',{radiant:{label:'Radiant'}});
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
test('harm variants switch both directions and carry distinct resource requests',async()=>{
 const hooks=await setupDialog('奪命之手 | preset:harm | necrotic | Hand of Harm',{radiant:{label:'Radiant'},necrotic:{label:'Necrotic'}});
 const actor={items:[
 {id:"harm",type:"feat",name:"Hand of Harm"},
 {id:"ki",isOwner:true,type:"feat",name:"Ki",system:{uses:{max:11,spent:0}}},
 {id:"flurry",isOwner:true,type:"feat",name:"Flurry of Healing and Harm",system:{uses:{max:3,spent:0}}},
 {type:"class",name:"Monk",system:{levels:11}}],system:{abilities:{wis:{mod:3}}}};
 const app={config:{subject:{actor},rolls:[{parts:['1d8'],options:{type:'slashing'}}]},rebuild(){},setPosition(){}};
 const root=new Element('root');hooks.renderDamageRollConfigurationDialog(app,root);
 const checks=root.children[0].children.filter(e=>e.tag==='label').map(e=>e.children[0]);
 assert.equal(checks.length,2);assert.ok(checks.every(c=>!c.disabled));
 checks[0].checked=true;checks[0].change();
 checks[1].checked=true;checks[1].change();
 assert.equal(checks[0].checked,false);assert.equal(checks[0].disabled,false);
 assert.equal(app.config.rolls[1].options.optionalDamageResources[0].itemId,"flurry");
 checks[0].checked=true;checks[0].change();
 assert.equal(checks[1].checked,false);assert.equal(checks[1].disabled,false);
 assert.equal(app.config.rolls[1].options.optionalDamageResources[0].itemId,"ki");assert.equal(app.config.rolls.length,2);
});

test('resource change on rerender clears the checkbox and actual extra roll together',async()=>{
 const hooks=await setupDialog('魔焰專家 | preset:spellfire | radiant | Spellfire Adept\n塑能增幅 | preset:fueled | inherit | Fueled Evocation',{radiant:{label:'Radiant'}});
 const actor={isOwner:true,items:[
  {id:'s',type:'feat',name:'Spellfire Adept'},{id:'f',type:'feat',name:'Fueled Evocation'},
  {id:'spell',type:'spell',system:{level:1}},
  {id:'c',isOwner:true,type:'class',name:'Wizard',system:{levels:1,hd:{denomination:"d6",max:1,spent:0}}}
 ]};
 const app={config:{subject:{actor,item:{id:'spell'}},rolls:[{parts:['1d8'],options:{type:'radiant'}}]},rebuild(){},setPosition(){}};
 const root=new Element('root');hooks.renderDamageRollConfigurationDialog(app,root);
 const panel=root.children[0],checks=panel.children.filter(e=>e.tag==='label').map(e=>e.children[0]),selects=panel.children.filter(e=>e.tag==='select');

 selects[0].value='0';selects[0].change();checks[0].checked=true;checks[0].change();
 assert.equal(app.config.rolls.length,2);
 actor.items.find(i=>i.id==="c").system.hd.spent=1;
 const root2=new Element("root");hooks.renderDamageRollConfigurationDialog(app,root2);
 const after=root2.children[0].children.filter(e=>e.tag==="label").map(e=>e.children[0]);
 assert.equal(after[0].checked,false);assert.equal(after[0].disabled,true);
 assert.equal(app.config.rolls.length,1);
});
test("both smites reserve one shared pact slot and a divine smite with inherited type can switch slots", async () => {
 const hooks = await setupDialog("至聖斬 | divine | inherit | Divine Smite\n魔能重斬 | eldritch | force | Eldritch Smite", {force:{label:"Force"}});
 const actor = {isOwner:true, items:[
  {id:"d", type:"spell", name:"Divine Smite"}, {id:"e", type:"feat", name:"Eldritch Smite"}
 ], system:{spells:{spell1:{value:1, max:1}, pact:{level:3, value:1, max:1}}}};
 const app = {config:{subject:{actor}, rolls:[{parts:["1d8"], options:{type:"slashing"}}]}, rebuild(){}, setPosition(){}};
 const root = new Element("root");
 const render = () => hooks.renderDamageRollConfigurationDialog(app,root);
 render();
 const rows = () => root.children[0].children.filter(e => e.tag === "label").map(e => e.children[0]);
 const controls = root.children[0].children.filter(e => e.tag === "div");
 const divineSlots = controls[0].children[0], target = controls[0].children[1].children[0];
 divineSlots.value = "pact"; divineSlots.change();
 rows()[1].checked = true; rows()[1].change();
 assert.equal(rows()[0].disabled, true);
 assert.equal(divineSlots.disabled, false);
 assert.equal(divineSlots.children[1].disabled, true);
 divineSlots.value = "spell1"; divineSlots.change();
 rows()[0].checked = true; rows()[0].change();
 target.checked = true; target.change();
 assert.equal(app.config.rolls.length,3);
 assert.equal(app.config.rolls[1].options.type,"slashing");
 assert.deepEqual(app.config.rolls[1].parts, ["3d8"]);
 actor.system.spells.pact.value = 0;
 render(); // Foundry rerendered only its formulas part; the existing panel is still attached.
 assert.equal(root.children.length,1);
 assert.equal(rows()[0].checked,true);
 assert.equal(rows()[1].checked,false);
 assert.equal(rows()[1].disabled,true);
 assert.equal(app.config.rolls.length,2);
 assert.equal(app.config.rolls[1].options.optionalDamageSlot.key, "spell1");
 actor.system.spells.pact.value = 1;
 render();
 assert.equal(rows()[1].disabled,false);
 assert.equal(rows()[1].checked,false);
});

test("a used or restored Giant Ancestry charge is reflected on a partial render", async () => {
 const hooks = await setupDialog("火之燃燒 | 1d10 | fire | Giant Ancestry (Fire)", {fire:{label:"Fire"}});
 const fire = {id:"fire", name:"Giant Ancestry (Fire)", type:"feat", isOwner:true, system:{uses:{spent:0,max:1}}};
 const app = {config:{subject:{actor:{items:[fire]}},rolls:[{parts:["1d8"],options:{type:"fire"}}]},rebuild(){},setPosition(){}};
 const root = new Element("root");
 const render = () => hooks.renderDamageRollConfigurationDialog(app,root);
 const check = () => root.children[0].children.find(e => e.tag === "label").children[0];
 render(); check().checked = true; check().change();
 assert.equal(app.config.rolls.length,2);
 fire.system.uses.spent = 1; render();
 assert.equal(check().disabled,true); assert.equal(check().checked,false);
 assert.equal(app.config.rolls.length,1);
 fire.system.uses.spent = 0; render();
 assert.equal(check().disabled,false); assert.equal(check().checked,false);
 assert.equal(root.children.length,1);
});

test("Savage Attacks can be selected before pressing the final critical button", async () => {
 const hooks = await setupDialog("野蠻攻擊 | preset:savage | inherit | Savage Attacks", {});
 const app = {config:{subject:{actor:{items:[{id:"s",type:"feat",name:"Savage Attacks"}]}}, rolls:[{parts:["1d8"],options:{type:"slashing"}}]},rebuild(){},setPosition(){}};
 const root = new Element("root");
 hooks.renderDamageRollConfigurationDialog(app,root);
 const controls = root.children[0].children;
 const select = controls.find(e=>e.tag==="select"), check = controls.find(e=>e.tag==="label").children[0];
 select.value="2"; select.change();
 assert.equal(check.disabled,false);
 check.checked=true; check.change(); assert.equal(app.config.rolls.length,2);
 app.config.critical={allow:false}; hooks.renderDamageRollConfigurationDialog(app,root);
 assert.equal(app.config.rolls.length,1);
});
