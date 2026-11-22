
const DEFAULT_FLEET = [
 {id:"FRX-001",name:"Maruti Fronx Delta",type:"Own",rate:2298,status:"Available",fuel:"Petrol"},
 {id:"BLN-001",name:"Maruti Baleno Delta",type:"Own",rate:2174,status:"Available",fuel:"Petrol"},
 {id:"PCH-001",name:"Tata Punch",type:"Partner",rate:2174,status:"Available",fuel:"Petrol"}
];

let db = {
 fleet:[],bookings:[],requirements:[],feedback:[],suggestions:[]
};
let mode = "";
let apiURL = localStorage.getItem("rd_api") || "";

const $ = id => document.getElementById(id);
const money = n => "₹"+Number(n||0).toLocaleString("en-IN");
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function localLoad(){
 Object.keys(db).forEach(k=>{
  db[k]=JSON.parse(localStorage.getItem("rd_"+k)||"[]");
 });
 if(!db.fleet.length) db.fleet=structuredClone(DEFAULT_FLEET);
}
function saveLocal(){
 Object.keys(db).forEach(k=>
  localStorage.setItem("rd_"+k,JSON.stringify(db[k]))
 );
}
function toast(msg){
 $("toast").textContent=msg;
 $("toast").style.display="block";
 setTimeout(()=>$("toast").style.display="none",2500);
}

async function login(){
 const pin=$("pin").value;
 if(apiURL){
  try{
   const r=await apiCall("login",{pin},false);
   localStorage.setItem("rd_token",r.token);
   await loadData();
   enterApp();
  }catch(e){$("loginError").textContent=e.message}
 }else{
  if(pin!=="1234"){
   $("loginError").textContent="Incorrect PIN. Demo PIN: 1234";
   return;
  }
  localLoad();
  localStorage.setItem("rd_auth","yes");
  enterApp();
 }
}
function enterApp(){
 $("login").classList.add("hidden");
 $("app").classList.remove("hidden");
 renderAll();
}
function logout(){
 localStorage.removeItem("rd_auth");
 localStorage.removeItem("rd_token");
 $("app").classList.add("hidden");
 $("login").classList.remove("hidden");
}
function toggleMenu(){$("sidebar").classList.toggle("open")}
function page(name){
 document.querySelectorAll(".screen").forEach(x=>x.classList.add("hidden"));
 $(name).classList.remove("hidden");
 $("heading").textContent=name.charAt(0).toUpperCase()+name.slice(1);
 $("sidebar").classList.remove("open");
 renderAll();
}
function renderAll(){
 renderDashboard();renderFleet();renderBookings();
 renderRequirements();renderSuggestions();renderFeedback();renderFinance();
 renderRates();
}
function renderDashboard(){
 $("totalFleet").textContent=db.fleet.length;
 $("totalBookings").textContent=db.bookings.length;
 $("activeBookings").textContent=db.bookings.filter(b=>["Confirmed","Ongoing"].includes(b.status)).length;
 $("totalRevenue").textContent=money(db.bookings.filter(b=>b.status!=="Cancelled").reduce((s,b)=>s+Number(b.base||0),0));
 $("dashboardFleet").innerHTML=db.fleet.map(v=>
  `<p>${esc(v.name)} · ${esc(v.type)} · ${money(v.rate)}/day</p>`
 ).join("")||"No vehicles added";
 $("recentBookings").innerHTML=db.bookings.slice(-5).reverse().map(b=>
  `<p><b>${esc(b.guest)}</b> · ${esc(b.vehicleName)} · ${money(b.total)}</p>`
 ).join("")||"No bookings";
}
function renderRates(){
 $("rateCards").innerHTML=[
  ["Fronx",2298,"Own · No guest fee"],
  ["Baleno",2174,"Own · No guest fee"],
  ["Tata Punch",2174,"Partner · 10% guest fee"]
 ].map(x=>`<p><b>${x[0]}</b> — ${money(x[1])}/day · ${x[2]}</p>`).join("");
}
function renderFleet(){
 $("fleetList").innerHTML=db.fleet.map(v=>`
 <article class="card">
 <span class="tag">${esc(v.type)} Fleet</span>
 <h3>${esc(v.name)}</h3>
 <p>${esc(v.fuel||"")} · ${esc(v.status)}</p>
 <strong>${money(v.rate)}</strong><small> / day</small>
 <p><button onclick="editFleet('${v.id}')">Edit</button>
 <button onclick="deleteFleet('${v.id}')">Delete</button></p>
 </article>`).join("")||"No fleet vehicles";
}
function renderBookings(){
 let q=($("searchBooking")?.value||"").toLowerCase();
 let list=db.bookings.filter(b=>
  [b.id,b.guest,b.vehicleName].join(" ").toLowerCase().includes(q)
 ).reverse();
 $("bookingList").innerHTML=list.map(b=>`
 <article class="booking">
 <div><small>Booking ID</small><b>${esc(b.id)}</b></div>
 <div><small>Guest</small><b>${esc(b.guest)}</b></div>
 <div><small>Vehicle / Dates</small><b>${esc(b.vehicleName)}</b>
 <small>${esc(b.start)} – ${esc(b.end)}</small></div>
 <div><b>${money(b.total)}</b><small>${esc(b.status)}</small></div>
 </article>`).join("")||'<div class="panel">No bookings found.</div>';
}
function renderRequirements(){
 $("requirementList").innerHTML=db.requirements.map(x=>
 `<article class="card"><span class="tag">${esc(x.category)}</span><h3>${esc(x.title)}</h3><p>${esc(x.details)}</p><small>${esc(x.status)}</small></article>`
 ).join("")||"No requirements";
}
function renderSuggestions(){
 $("suggestionList").innerHTML=db.suggestions.map(x=>
 `<article class="card"><span class="tag">${esc(x.category)}</span><h3>${esc(x.title)}</h3><p>${esc(x.details)}</p><small>${esc(x.status)}</small></article>`
 ).join("")||"No suggestions";
}
function renderFeedback(){
 $("feedbackList").innerHTML=db.feedback.map(x=>
 `<article class="card"><h3>${esc(x.guest)}</h3><p>${esc(x.message)}</p><span class="tag">Rating ${esc(x.rating)}/5</span></article>`
 ).join("")||"No feedback";
}
function renderFinance(){
 const b=db.bookings.filter(x=>x.status!=="Cancelled");
 const sum=k=>b.reduce((s,x)=>s+Number(x[k]||0),0);
 $("finBase").textContent=money(sum("base"));
 $("finFees").textContent=money(sum("guestFee"));
 $("finCommission").textContent=money(sum("commission"));
 $("finPayout").textContent=money(sum("hostPayout"));
}

function openModal(title,fields,type){
 mode=type;
 $("modalTitle").textContent=title;
 $("formError").textContent="";
 $("formFields").innerHTML=fields.map(f=>{
  let input;
  if(f.type==="select"){
   input=`<select id="f_${f.id}" ${f.required?"required":""}>${f.options.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>`;
  }else if(f.type==="textarea"){
   input=`<textarea id="f_${f.id}" ${f.required?"required":""}></textarea>`;
  }else{
   input=`<input id="f_${f.id}" type="${f.type||"text"}" ${f.required?"required":""} ${f.min!==undefined?`min="${f.min}"`:""}>`;
  }
  return `<div class="field ${f.full?"full":""}"><label>${f.label}</label>${input}</div>`;
 }).join("");
 $("modal").classList.remove("hidden");
}
function closeModal(){$("modal").classList.add("hidden")}
function val(id){return $("f_"+id).value}
function openFleet(){
 openModal("Add Vehicle",[
  {id:"name",label:"Vehicle name",required:true},
  {id:"type",label:"Fleet type",type:"select",options:["Own","Partner"].map(x=>({value:x,label:x}))},
  {id:"rate",label:"Daily base rental",type:"number",required:true,min:0},
  {id:"fuel",label:"Fuel",type:"select",options:["Petrol","Diesel","CNG","Electric"].map(x=>({value:x,label:x}))},
  {id:"status",label:"Availability",type:"select",options:["Available","Booked","Maintenance","Inactive"].map(x=>({value:x,label:x}))}
 ],"fleet");
}
function openBooking(){
 if(!db.fleet.length){toast("Add a vehicle first");return}
 openModal("New Booking",[
  {id:"guest",label:"Guest name",required:true},
  {id:"phone",label:"Guest phone",type:"tel",required:true},
  {id:"vehicle",label:"Vehicle",type:"select",options:db.fleet.map(v=>({value:v.id,label:v.name+" ("+v.type+")"}))},
  {id:"start",label:"Pickup date",type:"date",required:true},
  {id:"end",label:"Return date",type:"date",required:true},
  {id:"base",label:"Base rental amount (₹)",type:"number",required:true,min:0},
  {id:"status",label:"Booking status",type:"select",options:["Requested","Confirmed","Ongoing","Completed","Cancelled"].map(x=>({value:x,label:x}))},
  {id:"notes",label:"Notes",type:"textarea",full:true}
 ],"booking");
 const vehicle=db.fleet[0];
 $("f_base").value=vehicle.rate;
 $("f_vehicle").addEventListener("change",e=>{
  const v=db.fleet.find(x=>x.id===e.target.value);
  if(v)$("f_base").value=v.rate;
 });
}
function openRequirement(){
 openModal("Add Requirement",[
  {id:"category",label:"Category",type:"select",options:["Guest","Vehicle","Operations","Documents","Other"].map(x=>({value:x,label:x}))},
  {id:"title",label:"Title",required:true},
  {id:"status",label:"Status",type:"select",options:["Open","In Progress","Completed"].map(x=>({value:x,label:x}))},
  {id:"details",label:"Details",type:"textarea",required:true,full:true}
 ],"requirement");
}
function openSuggestion(){
 openModal("Add Suggestion",[
  {id:"category",label:"Source",type:"select",options:["Guest","Host","Team","Business Improvement"].map(x=>({value:x,label:x}))},
  {id:"title",label:"Title",required:true},
  {id:"status",label:"Status",type:"select",options:["New","Under Review","Accepted","Implemented"].map(x=>({value:x,label:x}))},
  {id:"details",label:"Details",type:"textarea",required:true,full:true}
 ],"suggestion");
}
$("recordForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  if(mode==="fleet"){
   const item={id:"CAR-"+Date.now(),name:val("name"),type:val("type"),rate:Number(val("rate")),fuel:val("fuel"),status:val("status")};
   await saveRecord("fleet",item,"saveFleet");
  }
  if(mode==="booking"){
   const vehicle=db.fleet.find(v=>v.id===val("vehicle"));
   const base=Number(val("base"));
   const partner=vehicle.type==="Partner";
   const guestFee=partner?Math.round(base*.10):0;
   const commission=partner?Math.round(base*.20):0;
   const item={
    id:"RD-"+Date.now(),guest:val("guest"),phone:val("phone"),
    vehicleId:vehicle.id,vehicleName:vehicle.name,fleetType:vehicle.type,
    start:val("start"),end:val("end"),base,
    guestFee,commission,hostPayout:partner?base-commission:0,
    total:base+guestFee,status:val("status"),notes:val("notes"),
    createdAt:new Date().toISOString()
   };
   await saveRecord("bookings",item,"saveBooking");
  }
  if(mode==="requirement"){
   const item={id:"REQ-"+Date.now(),category:val("category"),title:val("title"),status:val("status"),details:val("details"),date:new Date().toISOString()};
   await saveRecord("requirements",item,"saveRequirement");
  }
  if(mode==="suggestion"){
   const item={id:"SUG-"+Date.now(),category:val("category"),title:val("title"),status:val("status"),details:val("details"),date:new Date().toISOString()};
   await saveRecord("suggestions",item,"saveSuggestion");
  }
  closeModal();renderAll();toast("Record saved successfully");
 }catch(err){$("formError").textContent=err.message}
});
async function saveRecord(collection,item,action){
 if(apiURL) await apiCall(action,{item});
 db[collection].push(item);
 if(!apiURL)saveLocal();
}
function editFleet(id){
 const v=db.fleet.find(x=>x.id===id);
 openFleet();
 $("f_name").value=v.name;$("f_type").value=v.type;
 $("f_rate").value=v.rate;$("f_fuel").value=v.fuel;
 $("f_status").value=v.status;
 mode="editFleet";
}
function deleteFleet(id){
 if(!confirm("Delete this vehicle?"))return;
 db.fleet=db.fleet.filter(x=>x.id!==id);
 saveLocal();renderAll();
}
async function apiCall(action,data={},auth=true){
 return new Promise((resolve,reject)=>{
  const cb="rd_"+Date.now();
  const url=new URL(apiURL);
  url.searchParams.set("action",action);
  url.searchParams.set("data",JSON.stringify(data));
  if(auth)url.searchParams.set("token",localStorage.getItem("rd_token")||"");
  if(action==="login")url.searchParams.set("pin",data.pin);
  url.searchParams.set("callback",cb);
  window[cb]=r=>{delete window[cb];script.remove();r.ok?resolve(r):reject(Error(r.error))};
  const script=document.createElement("script");
  script.src=url.toString();
  script.onerror=()=>{delete window[cb];reject(Error("Backend connection failed"))};
  document.body.appendChild(script);
 });
}
async function loadData(){
 const r=await apiCall("getAll",{});
 db={...db,...r.data};
}
function saveSettings(){
 apiURL=$("apiUrl").value.trim();
 localStorage.setItem("rd_api",apiURL);
 $("connectionStatus").textContent=apiURL?"URL saved. Sign out and sign in again.":"Demo mode";
 toast("Settings saved");
}

(function init(){
 $("apiUrl").value=apiURL;
 if(!apiURL&&localStorage.getItem("rd_auth")==="yes"){
  localLoad();enterApp();
 }
 if(apiURL&&localStorage.getItem("rd_token")){
  loadData().then(enterApp).catch(()=>{});
 }
})();
