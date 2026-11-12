import {test} from 'node:test';
import assert from 'node:assert/strict';

test('Divine Smite target checkbox follows main checkbox and resets bonus on deselect', async()=>{
  const hooks={};
  globalThis.Hooks={once(){},on(name,fn){hooks[name]=fn;}};
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.events={};}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(){}
    addEventListener(event,fn){this.events[event]=fn;}
    querySelector(selector){return selector.includes('data-application-part')?this:null;}
    change(){this.events.change({stopPropagation(){}});}
  }
  globalThis.HTMLElement=Element;
  globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({text})};
  globalThis.CONFIG={DND5E:{damageTypes:{radiant:{label:'Radiant'}},healingTypes:{}}};
  globalThis.game={settings:{get:()=> 'Divine Smite | divine | radiant'},i18n:{localize:x=>x}};
  globalThis.Roll={validate:()=>true};
  globalThis.ui={notifications:{error:message=>{throw Error(message);}}};
  await import('../scripts/main.mjs');
  const app={config:{subject:{actor:{isOwner:true,items:[{id:'d',type:'spell',name:'Divine Smite'}],system:{spells:{spell1:{value:2,max:2}}}}},rolls:[{parts:['1d8'],options:{type:'slashing'}}]},rebuild(){},setPosition(){}};
  const root=new Element('root');
  hooks.renderDamageRollConfigurationDialog(app,root);
  const panel=root.children[0];
  const main=panel.children[1].children[0];
  const target=panel.children[2].children[1].children[0];
  assert.equal(target.disabled,true);
  main.checked=true;main.change();assert.equal(target.disabled,false);
  target.checked=true;target.change();assert.equal(app.config.rolls[1].parts[0],'3d8');
  main.checked=false;main.change();assert.equal(target.disabled,true);assert.equal(target.checked,false);
  assert.equal(app.config.rolls.length,1);
  main.checked=true;main.change();assert.equal(app.config.rolls[1].parts[0],'2d8');
});
