import {test} from "node:test";
import assert from "node:assert/strict";
test("settings save separates checkbox state and custom text while preserving legacy backup",async()=>{
 const hooks={},saved=new Map([["entries","Original backup"],["separatedEntries",{version:1,disabled:[],custom:""}]]);
 let Settings;
 globalThis.Hooks={once(name,fn){(hooks[name]??=[]).push(fn);},on(){}};
 globalThis.FormApplication=class {static get defaultOptions(){return {};} async close(){}};
 globalThis.foundry={utils:{mergeObject:(a,b)=>({...a,...b})}};
 globalThis.CONFIG={DND5E:{damageTypes:{force:{label:"Force"}}}};
 globalThis.Roll={validate:()=>true};
 globalThis.game={user:{isGM:true},i18n:{localize:v=>v},settings:{
 register(){},registerMenu(id,key,data){Settings=data.type;},
 get:(id,key)=>saved.get(key),set:async(id,key,value)=>saved.set(key,value)
 }};
 globalThis.ui={notifications:{info(){},error:m=>{throw Error(m);}}};
 await import('../scripts/main.mjs?settings-ui');
 hooks.init.forEach(fn=>fn());
 const app=new Settings();
 await app._updateObject(null,{"enabled.獵人印記":true,custom:"Custom | 1d6 | force | Custom"});
 const result=saved.get("separatedEntries");
 assert.equal(result.version,1);assert.equal(result.disabled.length,44);
 assert.equal(result.custom,"Custom | 1d6 | force | Custom");
 assert.equal(saved.get("entries"),"Original backup");
});
