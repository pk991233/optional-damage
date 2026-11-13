import {test} from "node:test";
import assert from "node:assert/strict";
import {customRow, quickAdd, escapeWizard} from "../scripts/wizard.mjs";
test("wizard produces compatible dice rows and validates input",()=>{
 const d={label:"烈焰斬",count:2,faces:6,bonus:3,type:"fire",aliases:"烈焰斬;Flame"};
 assert.equal(customRow(d,{fire:{}}),"烈焰斬 | 2d6 + 3 | fire | 烈焰斬;Flame");
 assert.equal(customRow({...d,bonus:-2,aliases:""},{fire:{}}),"烈焰斬 | 2d6 - 2 | fire | 烈焰斬");
 for(const patch of [{label:""},{count:0},{count:1.5},{faces:7},{bonus:0.5},{type:"bad"},{aliases:"a\nb"},{label:"a|b"}])
  assert.throws(()=>customRow({...d,...patch},{fire:{}}));
 assert.equal(escapeWizard('<"&'),"&lt;&quot;&amp;");
});
test("wizard supports back, confirmation and cancel without saving",async()=>{
 globalThis.game={i18n:{localize:x=>x}};
 globalThis.ui={notifications:{error:message=>{throw Error(message);}}};
 const queue=[["next","Flame"],["next","2"],["back","8"],["next","3"],["next","6"],["next","1"],["next","fire"],["next","Flame Power"]];
 globalThis.Dialog=class {constructor(data){this.data=data;}render(){
 const [button,value]=queue.shift();this.data.buttons[button].callback([{querySelector:()=>({value})}]);this.data.close();
 }};
 assert.equal(await quickAdd({fire:{label:"Fire"}}),"Flame | 3d6 + 1 | fire | Flame Power");
 globalThis.Dialog=class {constructor(data){this.data=data;}render(){this.data.close();}};
 assert.equal(await quickAdd({fire:{label:"Fire"}}),null);
});
