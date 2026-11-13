import {test} from "node:test";
import assert from "node:assert/strict";
test("players save only their own flag and cannot alter world configuration",async()=>{
 const hooks={},menus={},writes=[];
 globalThis.Hooks={once(name,fn){(hooks[name]??=[]).push(fn);},on(){}};
 globalThis.FormApplication=class {static get defaultOptions(){return {};} async close(){}};
 globalThis.foundry={utils:{mergeObject:(a,b)=>({...a,...b})}};
 globalThis.CONFIG={DND5E:{damageTypes:{fire:{label:"Fire"}}}};
 globalThis.Roll={validate:()=>true};
 const flags={customEntries:""};
 globalThis.game={user:{isGM:false,getFlag:(id,key)=>flags[key],setFlag:async(id,key,value)=>{flags[key]=value;}},
  i18n:{localize:v=>v},settings:{register(){},registerMenu(id,key,data){menus[key]=data;},
  get:(id,key)=>key==="separatedEntries"?{version:1,disabled:[],custom:"World | 1d6 | fire | World"}:"",
  set:async(...args)=>writes.push(args)}};
 globalThis.ui={notifications:{info(){},error:message=>{throw Error(message);}}};
 await import("../scripts/main.mjs?personal-ui");
 hooks.init.forEach(fn=>fn());
 assert.equal(menus.personalConfigure.restricted,false);
 assert.equal(menus.configure.restricted,true);
 const personal=new menus.personalConfigure.type();
 await personal._updateObject(null,{custom:"Mine | 2d6 | fire | Mine"});
 assert.equal(flags.customEntries,"Mine | 2d6 | fire | Mine");
 assert.equal(personal.getData().personal,true);
 assert.equal(personal.getData().custom,flags.customEntries);
 await new menus.configure.type()._updateObject(null,{custom:"Malicious"});
 assert.equal(writes.length,0);
 await personal._updateObject(null,{custom:""});
 assert.equal(flags.customEntries,"");
});
