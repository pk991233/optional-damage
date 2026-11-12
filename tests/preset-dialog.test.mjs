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
