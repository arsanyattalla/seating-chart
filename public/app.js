const app = document.getElementById("app");
const isSeating = location.pathname.replace(/\/+$/, "") === "/seating";
let allData = { guests: [], tables: [] };
let searchTerm = "";
let editingId = null;
let toastTimer;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
async function api(url, options={}) {
  const res = await fetch(url, options);
  const type = res.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await res.json() : res;
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message, error=false) {
  document.querySelector(".toast")?.remove();
  const el=document.createElement("div"); el.className="toast"+(error?" error":""); el.textContent=message;
  document.body.appendChild(el); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.remove(),3200);
}
function brand() { return `<div class="brand"><div class="monogram">A<span style="font-size:11px">&</span>M</div><div><div class="brand-title">The Wedding of A & M</div><div class="brand-sub">Guest & seating management</div></div></div>`; }

async function start() {
  if (isSeating) return renderGuestPage();
  const session = await api("/api/session");
  if (!session.isAdmin) return renderLogin();
  await renderDashboard();
}
function renderLogin() {
  app.innerHTML=`<main class="login-screen"><section class="login-card"><div class="monogram">A<span style="font-size:12px">&</span>M</div><div class="eyebrow" style="text-align:center">Private access</div><h1>Welcome back</h1><p>Sign in to manage your wedding seating.</p><form id="loginForm"><div class="field"><label for="password">Dashboard password</label><input id="password" type="password" placeholder="Enter your password" required autofocus></div><button class="btn btn-gold" type="submit">Enter dashboard</button></form><p id="loginError" style="color:#9a5148;margin:13px 0 0"></p></section></main>`;
  document.getElementById("loginForm").addEventListener("submit", async e=>{
    e.preventDefault(); const button=e.submitter; button.disabled=true; button.textContent="Signing in…";
    try { await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:document.getElementById("password").value})}); renderDashboard(); }
    catch(err){document.getElementById("loginError").textContent=err.message;button.disabled=false;button.textContent="Enter dashboard";}
  });
}
async function renderDashboard() {
  try { allData=await api("/api/admin/data"); } catch(e) { return renderLogin(); }
  const assigned=allData.guests.filter(g=>g.table).length;
  const tableNums=[...new Set(allData.guests.filter(g=>g.table).map(g=>String(g.table)))];
  const filtered=allData.guests.filter(g=>g.name.toLowerCase().includes(searchTerm.toLowerCase())||String(g.table).includes(searchTerm));
  app.innerHTML=`
  <div class="floral-banner" aria-hidden="true"></div><header class="topbar"><div class="shell" style="display:flex;align-items:center;justify-content:space-between;width:100%">${brand()}<nav class="nav"><a class="active" href="/">Dashboard</a><a href="/seating" target="_blank">Guest page ↗</a><button class="btn btn-outline btn-small" id="logout">Sign out</button></nav></div></header>
  <main class="shell"><div class="page-head"><div><div class="eyebrow">Your celebration, beautifully organized</div><h1>Seating dashboard</h1><p>Manage your guest list and make every seat feel considered.</p></div><a class="btn btn-gold" href="/seating" target="_blank" style="text-decoration:none">Preview guest page ↗</a></div>
  <section class="stats"><div class="stat"><div class="stat-label">Total guests</div><div class="stat-value">${allData.guests.length}</div></div><div class="stat"><div class="stat-label">Guests assigned</div><div class="stat-value">${assigned}<span style="font:400 13px 'DM Sans';color:var(--muted)"> / ${allData.guests.length}</span></div></div><div class="stat"><div class="stat-label">Tables in use</div><div class="stat-value">${tableNums.length}</div></div></section>
  <div class="dashboard-grid"><section>
    <div class="panel"><div class="panel-head"><div><h2>Guest list</h2><div class="panel-note">Add, edit, and assign your guests.</div></div><div class="guest-tools"><input class="search" id="guestSearch" placeholder="Search guests or table…" value="${esc(searchTerm)}"><button class="btn btn-small" id="addGuest">+ Add guest</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>Guest name</th><th>Table</th><th>Notes</th><th></th></tr></thead><tbody>${filtered.length?filtered.map(g=>`<tr><td><strong>${esc(g.name)}</strong></td><td>${g.table?`<span class="table-pill">Table ${esc(g.table)}</span>`:'<span class="muted">Unassigned</span>'}</td><td class="muted">${esc(g.notes||"—")}</td><td><div class="actions"><button class="text-btn" data-edit="${g.id}">Edit</button><button class="text-btn" data-delete="${g.id}">Remove</button></div></td></tr>`).join(""):`<tr><td colspan="4" class="empty">No guests found. Add a guest or import your list.</td></tr>`}</tbody></table></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h2>Seating chart</h2><div class="panel-note">A quick overview of guests at each table.</div></div></div><div class="table-list">${buildTableList()}</div></div>
  </section><aside>
    <div class="panel"><div class="panel-head"><div><h2>Import guest list</h2><div class="panel-note">Upload your completed CSV template.</div></div></div><div class="upload-zone"><div class="eyebrow">CSV upload</div><p>Use columns for <strong>name</strong>, <strong>table</strong>, and <strong>notes</strong>. Matching names will be updated; new names will be added.</p><input type="file" id="csvFile" accept=".csv,text/csv"><div style="margin-top:13px"><button class="btn btn-gold btn-small" id="uploadCsv">Upload CSV</button></div></div><div style="display:flex;flex-direction:column;gap:9px;margin-top:14px"><a class="btn btn-outline" href="/guests-template.csv" download style="text-align:center;text-decoration:none">Download CSV template ↓</a><button class="btn btn-outline" id="exportCsv">Export current guest list ↓</button></div></div>
    <div class="panel" style="background:#f4f0e7"><div class="eyebrow">Guest experience</div><h2 style="margin-top:8px">Find your seat</h2><p class="panel-note" style="line-height:1.7;margin:8px 0 14px">Share this page with your guests or open it on a tablet at the entrance.</p><a href="/seating" target="_blank" style="color:var(--gold);font-size:11px">Open guest seating page ↗</a></div>
  </aside></div></main><div class="footer">Made with love · A & M</div><div id="modalRoot"></div>`;
  document.getElementById("logout").onclick=async()=>{await api("/api/logout",{method:"POST"});renderLogin();};
  document.getElementById("guestSearch").addEventListener("input",e=>{searchTerm=e.target.value;const pos=e.target.selectionStart;renderDashboard();const el=document.getElementById("guestSearch");el.focus();el.setSelectionRange(pos,pos);});
  document.getElementById("addGuest").onclick=()=>openGuestModal();
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openGuestModal(allData.guests.find(g=>g.id===b.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const g=allData.guests.find(x=>x.id===b.dataset.delete);if(confirm(`Remove ${g.name} from the guest list?`)){await api(`/api/admin/guests/${g.id}`,{method:"DELETE"});toast("Guest removed.");renderDashboard();}});
  document.getElementById("uploadCsv").onclick=uploadCsv;
  document.getElementById("exportCsv").onclick=()=>window.location.href="/api/admin/export";
}
function buildTableList(){
  const nums=[...new Set([...allData.tables.map(t=>String(t.number)),...allData.guests.filter(g=>g.table).map(g=>String(g.table))])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!nums.length)return '<div class="empty">Your tables will appear here once you assign guests.</div>';
  return nums.map(n=>{const count=allData.guests.filter(g=>String(g.table)===n).length;return `<div class="table-item"><div><strong>Table ${esc(n)}</strong></div><span>${count} ${count===1?"guest":"guests"}</span></div>`}).join("");
}
function openGuestModal(g=null){
 editingId=g?.id||null;
 document.getElementById("modalRoot").innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><form class="modal" id="guestForm"><h2>${g?"Edit guest":"Add a guest"}</h2><div class="field"><label>Guest name</label><input name="name" value="${esc(g?.name||"")}" placeholder="Full name" required autofocus></div><div class="field"><label>Table number</label><input name="table" value="${esc(g?.table||"")}" placeholder="e.g. 1"></div><div class="field"><label>Notes (optional)</label><input name="notes" value="${esc(g?.notes||"")}" placeholder="Dietary note, party, etc."></div><div class="modal-actions"><button type="button" class="btn btn-outline" id="cancelModal">Cancel</button><button class="btn btn-gold">${g?"Save changes":"Add guest"}</button></div></form></div>`;
 document.getElementById("cancelModal").onclick=()=>document.getElementById("modalRoot").innerHTML="";
 document.getElementById("modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")document.getElementById("modalRoot").innerHTML=""};
 document.getElementById("guestForm").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));try{await api(editingId?`/api/admin/guests/${editingId}`:"/api/admin/guests",{method:editingId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});toast(editingId?"Guest updated.":"Guest added.");document.getElementById("modalRoot").innerHTML="";renderDashboard();}catch(err){toast(err.message,true);}};
}
async function uploadCsv(){
 const file=document.getElementById("csvFile").files[0];if(!file)return toast("Choose a CSV file first.",true);
 const fd=new FormData();fd.append("file",file);
 try{const result=await api("/api/admin/import",{method:"POST",body:fd});toast(`Import complete: ${result.added} added, ${result.updated} updated.`);renderDashboard();}catch(e){toast(e.message,true);}
}
async function renderGuestPage(){
 app.innerHTML=`<main class="invitation-page">
   <div class="invitation-frame">
     <header class="invitation-header">
       <img class="floral-art" src="/floral-header.jpg" alt="">
       <div class="couple-title">Arsany <span>&amp;</span> Mariz</div>
       <div class="title-ornament"><i></i><span>◇</span><i></i></div>
       <p class="invitation-tagline">Find your seat </p>
     </header>
     <nav class="invitation-tabs" aria-label="Seating navigation">
       <button class="invitation-tab active" id="findTab">Find my seat</button>
       <button class="invitation-tab" id="chartTab">Seating chart</button>
     </nav>
     <section class="invitation-content" id="findPanel">
       <div class="guest-search-wrap">
         <input class="invitation-search" id="guestSearchInput" autocomplete="off" aria-label="Search your name" placeholder="Start typing your name…">
         <div class="invitation-suggestions hidden" id="suggestions"></div>
       </div>
       <div id="lookupResult"></div>
     </section>
     <section class="invitation-content chart-panel hidden" id="chartPanel">
       <div class="chart-grid invitation-chart" id="publicChart"><div class="empty">Loading seating chart…</div></div>
     </section>
   </div>
 </main>`;
 const findTab=document.getElementById("findTab"), chartTab=document.getElementById("chartTab");
 const findPanel=document.getElementById("findPanel"), chartPanel=document.getElementById("chartPanel");
 function show(which){
   const isFind=which==="find";
   findTab.classList.toggle("active",isFind); chartTab.classList.toggle("active",!isFind);
   findPanel.classList.toggle("hidden",!isFind); chartPanel.classList.toggle("hidden",isFind);
   const activePanel=isFind?findPanel:chartPanel;
   activePanel.classList.remove("panel-enter");
   void activePanel.offsetWidth;
   activePanel.classList.add("panel-enter");
 }
 findTab.onclick=()=>show("find"); chartTab.onclick=()=>show("chart");
 const input=document.getElementById("guestSearchInput"), list=document.getElementById("suggestions");
 let timer;
 input.addEventListener("input",()=>{
   clearTimeout(timer);const q=input.value.trim();document.getElementById("lookupResult").innerHTML="";
   if(!q){list.classList.add("hidden");return;}
   timer=setTimeout(async()=>{
     try{
       const matches=await api(`/api/lookup?q=${encodeURIComponent(q)}`);
       list.innerHTML=matches.length?matches.map((g,i)=>`<button class="invitation-suggestion" style="animation:popIn .24s ${Math.min(i*35,210)}ms both" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join(""):'<div class="invitation-no-match">No matching names found.</div>';
       list.classList.remove("hidden");
       list.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>selectGuest(b.dataset.id));
     }catch(e){list.classList.add("hidden");}
   },120);
 });
 document.addEventListener("click",e=>{if(!e.target.closest(".guest-search-wrap"))list.classList.add("hidden");});
 async function selectGuest(id){
   try{
     const g=await api(`/api/guest/${id}`);input.value=g.name;list.classList.add("hidden");
     document.getElementById("lookupResult").innerHTML=`<div class="invitation-result">
       <div class="result-script">Welcome, ${esc(g.name)}</div>
       ${g.table?`<div class="invitation-table-label">Your table</div><div class="invitation-table-number">${esc(g.table)}</div>`:`<div class="invitation-table-name">Please see our welcome team for your table assignment.</div>`}
     </div>`;
   }catch(e){toast(e.message,true);}
 }
 try{
   const data=await api("/api/seating"),chart=document.getElementById("publicChart");
   chart.innerHTML=data.tables.length?data.tables.map(t=>`<article class="invitation-chart-table"><div class="invitation-chart-number">Table ${esc(t.number)}</div><ul>${t.guests.map(n=>`<li>${esc(n)}</li>`).join("")}</ul></article>`).join(""):'<div class="invitation-no-match">The seating chart will be available soon.</div>';
 }catch(e){document.getElementById("publicChart").innerHTML='<div class="invitation-no-match">The seating chart is temporarily unavailable.</div>';}
}
start().catch(e=>{app.innerHTML=`<div class="login-screen"><div class="login-card"><h1>Something went wrong</h1><p>${esc(e.message)}</p></div></div>`;});
