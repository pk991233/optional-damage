// Keep the generated row compatible with the advanced text editor.
export function customRow(data, types) {
 const label=String(data.label??"").trim(), aliases=String(data.aliases??"").trim()||label;
 if(!label || /[|\r\n]/.test(label+aliases)) throw new Error("名稱不可空白，也不能包含換行或 |。");
 const count=Number(data.count),faces=Number(data.faces),bonus=Number(data.bonus??0);
 if(!Number.isInteger(count)||count<1||count>100)throw new Error("骰子數量須為 1–100 的整數。");
 if(![4,6,8,10,12,20,100].includes(faces))throw new Error("請選擇有效骰面。");
 if(!Number.isInteger(bonus)||Math.abs(bonus)>10000)throw new Error("固定加值須為 -10000 至 10000 的整數。");
 if(data.type!=="inherit"&&!Object.hasOwn(types,data.type))throw new Error("請選擇傷害類型。");
 return label+" | "+count+"d"+faces+(bonus>0?" + "+bonus:bonus<0?" - "+Math.abs(bonus):"")+" | "+data.type+" | "+aliases;
}
export const escapeWizard = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function quickAdd(types) {
 const data={label:"",count:1,faces:6,bonus:0,type:"inherit",aliases:""};
 const steps=[
  {key:"label",title:"附傷叫什麼名字？",hint:"例如：烈焰斬",input:"text"},
  {key:"count",title:"要擲幾顆骰子？",hint:"例如：2d6 的數量是 2。",input:"number",min:1,max:100},
  {key:"faces",title:"每顆骰子有幾面？",choices:[4,6,8,10,12,20,100].map(n=>[n,"d"+n])},
  {key:"bonus",title:"是否加入固定加值？",hint:"沒有就保留 0；可輸入負數。",input:"number",min:-10000,max:10000},
  {key:"type",title:"造成哪種傷害？",choices:[["inherit","沿用主要傷害類型"],...Object.entries(types).map(([k,v])=>[k,game.i18n.localize(v.label)])]},
  {key:"aliases",title:"角色需要擁有哪個能力？",hint:"填角色卡的法術或特性名稱；多個名稱用分號分隔。留空使用附傷名稱。",input:"text"}
 ];
 let index=0;
 while(index<steps.length) {
  const step=steps[index],esc=escapeWizard;
  const field=step.choices?'<select name="value">'+step.choices.map(([v,l])=>'<option value="'+esc(v)+'" '+(String(data[step.key])===String(v)?'selected':'')+'>'+esc(l)+'</option>').join("")+'</select>':
   '<input name="value" type="'+step.input+'" value="'+esc(data[step.key])+'" '+(step.input==="number"?'min="'+step.min+'" max="'+step.max+'" step="1"':'')+'>';
  const answer=await new Promise(resolve=>{
   const read=html=>(html[0]??html).querySelector('[name="value"]').value;
   const buttons={};
   if(index)buttons.back={label:"上一步",callback:html=>resolve({back:true,value:read(html)})};
   buttons.next={label:index===steps.length-1?"加入清單":"下一步",callback:html=>resolve({value:read(html)})};
   buttons.cancel={label:"取消",callback:()=>resolve(null)};
   new Dialog({title:"快捷新增附傷 · "+(index+1)+"/"+steps.length,
    content:'<div class="optional-damage-wizard"><p><i class="fas fa-dice"></i> '+esc(step.title)+'</p><label>'+esc(step.title)+field+'</label><p class="notes">'+esc(step.hint??"")+'</p><p>目前：'+esc(data.label||"未命名")+' · '+esc(data.count)+'d'+esc(data.faces)+'</p></div>',
    buttons,default:"next",close:()=>resolve(null)
   },{width:460}).render(true);
  });
  if(!answer)return null;
  data[step.key]=answer.value;
  if(answer.back){index--;continue;}
  try {
   // Validate the current answer without requiring later steps.
   customRow({...data,label:index===0?data.label:(data.label||"附傷")},types);
   index++;
  }catch(error){ui.notifications.error(error.message);}
 }
 return customRow(data,types);
}
