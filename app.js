const $=id=>document.getElementById(id);
const DEFAULT_MODELS=[
 {id:"openai:gpt-4o-mini",name:"GPT-4o mini",provider:"openai",model:"gpt-4o-mini",kind:"cloud"},
 {id:"deepseek:deepseek-chat",name:"DeepSeek Chat",provider:"deepseek",model:"deepseek-chat",kind:"cloud"},
 {id:"groq:llama-3.3-70b-versatile",name:"Llama 3.3 70B (Groq)",provider:"groq",model:"llama-3.3-70b-versatile",kind:"cloud"},
 {id:"openrouter:deepseek/deepseek-chat",name:"DeepSeek via OpenRouter",provider:"openrouter",model:"deepseek/deepseek-chat",kind:"cloud"},
 {id:"gemini:gemini-3.8-flash",name:"Gemini 3.8 Flash",provider:"gemini",model:"gemini-3.8-flash",kind:"cloud"}
];
let models=[...DEFAULT_MODELS], chats=[], activeChat=null, importedText="";
const DB="personal-ai-hub", STORE="chats";
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbPut(v){const d=await openDB();return new Promise((res,rej)=>{let t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put(v);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function dbAll(){const d=await openDB();return new Promise((res,rej)=>{let r=d.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbClear(){const d=await openDB();return new Promise(res=>{let t=d.transaction(STORE,"readwrite");t.objectStore(STORE).clear();t.oncomplete=res})}
function settings(){const s=JSON.parse(localStorage.getItem("pah-settings")||"{}");s.appPassword=sessionStorage.getItem("pah-app-password")||"";return s}
function saveSettings(){let s=JSON.parse(localStorage.getItem("pah-settings")||"{}");s.workerUrl=$("workerUrl").value.trim().replace(/\/$/,"");localStorage.setItem("pah-settings",JSON.stringify(s));sessionStorage.setItem("pah-app-password",$("appPassword").value);$("testResult").textContent="تنظیمات ذخیره شد. رمز تا پایان این نشست مرورگر نگهداری می‌شود."}
function modelOptions(sel){sel.innerHTML=models.map(m=>`<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)} · ${m.kind==="local"?"محلی":"ابری"}</option>`).join("")}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}
function renderHistory(){$("history").innerHTML="";chats.sort((a,b)=>b.updated-a.updated).forEach(c=>{let b=document.createElement("button");b.textContent=c.title||"گفت‌وگوی جدید";b.onclick=()=>loadChat(c.id);$("history").append(b)})}
function renderMessages(){let el=$("messages");el.innerHTML="";if(!activeChat||!activeChat.messages.length){el.innerHTML='<div class="welcome"><div class="welcome-icon">✦</div><h1>یک مرکز، چندین هوش مصنوعی</h1><p>مدل ابری یا محلی را انتخاب کنید و گفتگو را آغاز کنید.</p></div>';return}activeChat.messages.forEach(m=>{let d=document.createElement("div");d.className="message "+m.role;d.innerHTML=`<div class="meta">${m.role==="user"?"شما":escapeHtml(m.model||"دستیار")}</div>${escapeHtml(m.content)}`;el.append(d)});el.scrollTop=el.scrollHeight}
async function persist(){if(!activeChat)return;activeChat.updated=Date.now();await dbPut(activeChat);renderHistory()}
function newChat(){activeChat={id:crypto.randomUUID(),title:"گفت‌وگوی جدید",updated:Date.now(),messages:[]};renderMessages();persist()}
async function loadChat(id){activeChat=chats.find(c=>c.id===id)||await (async()=>{let a=await dbAll();return a.find(c=>c.id===id)})();renderMessages()}
function selectedModel(id){return models.find(m=>m.id===id)||models[0]}
async function askCloud(m, messages){
 const s=settings();if(!s.workerUrl)throw Error("ابتدا نشانی Cloudflare Worker را در تنظیمات وارد کنید.");
 const r=await fetch(s.workerUrl+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json","X-App-Password":s.appPassword||""},body:JSON.stringify({provider:m.provider,model:m.model,messages,stream:false})});
 const data=await r.json().catch(()=>({error:"پاسخ نامعتبر از سرور"}));if(!r.ok)throw Error(data.error||`خطای سرور ${r.status}`);
 return data.content||data.choices?.[0]?.message?.content||"پاسخی دریافت نشد.";
}
async function askLocal(m,messages){
 const base=(m.baseUrl||"http://localhost:11434/v1").replace(/\/$/,"");
 const r=await fetch(base+"/chat/completions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:m.model,messages})});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?.message||"اتصال به مدل محلی ناموفق بود؛ CORS و اجرای سرویس را بررسی کنید.");
 return data.choices?.[0]?.message?.content||"پاسخی دریافت نشد.";
}
async function ask(m,msgs){return m.kind==="local"?askLocal(m,msgs):askCloud(m,msgs)}
async function send(){
 const prompt=$("prompt").value.trim();if(!prompt)return;if(!activeChat)newChat();
 $("prompt").value="";activeChat.messages.push({role:"user",content:prompt});if(activeChat.title==="گفت‌وگوی جدید")activeChat.title=prompt.slice(0,42);renderMessages();await persist();
 const btn=$("send");btn.disabled=true;btn.textContent="...";
 const msgs=activeChat.messages.map(({role,content})=>({role,content}));
 let chosen=selectedModel($("modelSelect").value), results=[];
 try{
  if($("compareMode").checked){let second=selectedModel($("compareSelect").value);let pair=await Promise.allSettled([ask(chosen,msgs),ask(second,msgs)]);pair.forEach((p,i)=>results.push({model:i?second.name:chosen.name,content:p.status==="fulfilled"?p.value:"خطا: "+p.reason.message}))}
  else if($("autoMode").checked){let order=[chosen,...models.filter(x=>x.id!==chosen.id&&x.kind==="cloud")];let last;for(const m of order){try{results.push({model:m.name,content:await ask(m,msgs)});break}catch(e){last=e}}if(!results.length)throw last||Error("هیچ مدلی در دسترس نیست")}
  else results.push({model:chosen.name,content:await ask(chosen,msgs)});
  results.forEach(x=>activeChat.messages.push({role:"assistant",model:x.model,content:x.content}));
 }catch(e){activeChat.messages.push({role:"assistant",model:"خطا",content:e.message})}
 finally{renderMessages();await persist();btn.disabled=false;btn.textContent="ارسال ↑"}
}
function renderModels(){$("modelCards").innerHTML=models.map(m=>`<div class="model-card"><b>${escapeHtml(m.name)}</b><small>${m.kind==="local"?"مدل محلی":"مدل ابری"} · ${escapeHtml(m.provider)}</small><p class="muted">${escapeHtml(m.model)}</p></div>`).join("")}
function showPanel(name){document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));$(name+"Panel").classList.remove("hidden");document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.panel===name))}
function download(name,content){let a=document.createElement("a"),u=URL.createObjectURL(new Blob([content],{type:"application/json"}));a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
async function init(){
 const s=settings();$("workerUrl").value=s.workerUrl||"";$("appPassword").value=s.appPassword||"";
 chats=await dbAll();renderHistory();modelOptions($("modelSelect"));modelOptions($("compareSelect"));renderModels();
 if(chats.length)await loadChat(chats.sort((a,b)=>b.updated-a.updated)[0].id);else newChat();
 document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
 $("newChat").onclick=newChat;$("send").onclick=send;$("prompt").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
 $("compareMode").onchange=()=> $("compareSelect").classList.toggle("hidden",!$("compareMode").checked);
 $("saveSettings").onclick=saveSettings;$("testConnection").onclick=async()=>{let u=$("workerUrl").value.trim().replace(/\/$/,"");try{let r=await fetch(u+"/api/health");let j=await r.json();$("testResult").textContent=r.ok?"اتصال برقرار است.":"پاسخ نامعتبر";$("connectionLabel").textContent=r.ok?"Worker متصل":"اتصال ناموفق"}catch(e){$("testResult").textContent="اتصال برقرار نشد: "+e.message}};
 $("clearChat").onclick=()=>{if(activeChat){activeChat.messages=[];persist();renderMessages()}};
 $("addCustom").onclick=()=>{let m={id:"custom:"+$("customId").value,provider:$("customId").value.trim(),name:$("customName").value.trim(),model:$("customModel").value.trim(),baseUrl:$("customBase").value.trim(),kind:"local"};if(!m.provider||!m.name||!m.model||!m.baseUrl)return alert("همه فیلدها الزامی است.");models.push(m);modelOptions($("modelSelect"));modelOptions($("compareSelect"));renderModels()};
 $("addLocal").onclick=()=>{let m={id:"local:"+Date.now(),provider:"local",name:$("localName").value,model:$("localModel").value.trim(),baseUrl:$("localUrl").value.trim(),kind:"local"};if(!m.model)return alert("شناسه مدل را وارد کنید.");models.push(m);modelOptions($("modelSelect"));modelOptions($("compareSelect"));renderModels()};
 $("exportData").onclick=async()=>download("personal-ai-hub-export.json",JSON.stringify({version:1,chats:await dbAll()},null,2));
 $("deleteData").onclick=async()=>{if(confirm("تمام گفتگوهای ذخیره‌شده در این مرورگر حذف شود؟")){await dbClear();chats=[];newChat();renderHistory()}};
 $("previewImport").onclick=async()=>{let f=$("archiveFile").files[0];if(!f)return;let t=await f.text();importedText=t;let count=1;try{let j=JSON.parse(t);count=Array.isArray(j)?j.length:(j.conversations?.length||j.chats?.length||1)}catch{}$("importPreview").textContent=`فایل: ${f.name} · حجم: ${f.size.toLocaleString()} بایت · برآورد گفتگو/بخش: ${count}`;$("confirmImport").classList.remove("hidden")};
 $("confirmImport").onclick=async()=>{let f=$("archiveFile").files[0];let content=importedText;let parsed;try{parsed=JSON.parse(content)}catch{parsed=null}
 let items=parsed?.chats||parsed?.conversations||(Array.isArray(parsed)?parsed:null);
 if(!items){items=[{title:f.name,messages:[{role:"assistant",content}]}]}
 for(let item of items){let msgs=item.messages||item.mapping&&Object.values(item.mapping).map(x=>x.message).filter(Boolean).map(x=>({role:x.author?.role==="user"?"user":"assistant",content:(x.content?.parts||[]).join("\n")}))||[];msgs=msgs.map(x=>({role:["user","assistant","system"].includes(x.role)?x.role:"assistant",content:typeof x.content==="string"?x.content:JSON.stringify(x.content)}));let c={id:crypto.randomUUID(),title:item.title||item.name||"گفتگوی واردشده",updated:Date.now(),messages:msgs};await dbPut(c)}
 chats=await dbAll();renderHistory();$("importPreview").textContent="ورود انجام شد؛ گفتگوها به تاریخچه محلی افزوده شدند.";$("confirmImport").classList.add("hidden")};
}
init().catch(console.error);