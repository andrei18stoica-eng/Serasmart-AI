import React, { useEffect, useRef, useState } from "react";
import { CalendarClock, Plus, Play, Pencil, Copy, Trash2, ArrowLeft, ChevronDown, RotateCcw, Clock, Bell, BellOff, Sparkles } from "lucide-react";
import { api, toast, cx, plural, ToolShell, Modal, Switch, relativeDay, shortDate, clockTime, Markdown } from "../core.jsx";
import { BRAND_NAME } from "../brand.js";
import { t as tr, useLanguage, getLanguage } from "../i18n.jsx";

// 0.7.34: day names in the chosen language (Intl), not fixed Romanian ones. 7 January 2024 was a Sunday.
const dayName=(d,width="long")=>{try{return new Intl.DateTimeFormat(getLanguage(),{weekday:width}).format(new Date(2024,0,7+Number(d)))}catch{return String(d)}};
const WEEK_ORDER=[1,2,3,4,5,6,0];
const WORKDAYS=[1,2,3,4,5];
const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
const sameDays=(a,b)=>{const x=[...new Set((a||[]).map(Number))].sort(),y=[...b].sort();return x.length===y.length&&x.every((v,i)=>v===y[i]);};
export function localTimeZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch{return ""}}

export function humanSchedule(x){
  const t=x?.time||"09:00";
  switch(x?.frequency){
    case "once":return x.runAt?tr("Once: {date}, {time}",{date:shortDate(x.runAt),time:clockTime(x.runAt)}):tr("Once");
    case "hourly":return tr("Every hour");
    case "interval":{const n=Number(x.intervalHours||1);return n<=1?tr("Every hour"):tr("Every {n} hours",{n});}
    case "weekly":return tr("Weekly, {day} at {time}",{day:dayName(x.weekday??1),time:t});
    case "selected_days":{
      const days=[...new Set((x.days||[]).map(Number))].filter(d=>d>=0&&d<=6);
      if(days.length===7)return tr("Daily at {time}",{time:t});
      if(sameDays(days,WORKDAYS))return tr("Monday–Friday at {time}",{time:t});
      if(sameDays(days,[0,6]))return tr("Saturday and Sunday at {time}",{time:t});
      const names=WEEK_ORDER.filter(d=>days.includes(d)).map(d=>dayName(d));
      return names.length?tr("{days} at {time}",{days:cap(names.join(", ")),time:t}):tr("No day chosen");
    }
    case "monthly":return tr("Monthly, on day {day}, at {time}",{day:x.monthday||1,time:t});
    default:return tr("Daily at {time}",{time:t});
  }
}

const STATUS={
  ok:["Succeeded","ok"],delivered:["Succeeded","ok"],no_change:["No changes","neutral"],checked_no_change:["No changes","neutral"],
  error:["Error","error"],disabled_after_errors:["Stopped after errors","error"],needs_login:["Needs sign-in","warn"],permission_denied:["Stopped by the Owner","warn"]
};
export function StatusPill({status,ran=true}){
  const [label,kind]=STATUS[status]||(ran?["Changed","idle"]:["Not run yet","idle"]);
  return <span className={cx("statusPill",kind)}>{tr(label)}</span>;
}

const FREQUENCIES=[["once","Once"],["hourly","Every hour"],["interval","Every few hours"],["daily","Daily"],["weekdays","Working days (Monday–Friday)"],["selected_days","Chosen days"],["weekly","Weekly"],["monthly","Monthly"]];
const TIMED=["daily","weekdays","selected_days","weekly","monthly"];
function toLocalInput(ts){
  if(!ts)return "";
  const d=new Date(ts);if(!Number.isFinite(d.getTime()))return "";
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function blankForm(model=""){return {title:"",prompt:"",frequency:"daily",time:"09:00",weekday:1,days:[...WORKDAYS],runAt:"",intervalHours:3,monthday:1,model,notify:true,watch:false};}
function formFrom(x){
  return {...blankForm(x.model||""),title:x.title||"",prompt:x.prompt||"",
    frequency:x.frequency==="selected_days"&&sameDays(x.days,WORKDAYS)?"weekdays":(x.frequency||"daily"),
    time:x.time||"09:00",weekday:Number(x.weekday??1),days:Array.isArray(x.days)&&x.days.length?x.days.map(Number):[...WORKDAYS],
    runAt:toLocalInput(x.runAt),intervalHours:Number(x.intervalHours||3),monthday:Number(x.monthday||1),notify:x.notify!==false,watch:x.timingMode==="condition_watch"};
}
function payloadFrom(f){
  const weekdays=f.frequency==="weekdays";
  return {title:f.title.trim(),prompt:f.prompt.trim(),frequency:weekdays?"selected_days":f.frequency,time:f.time,weekday:Number(f.weekday),
    days:weekdays?[...WORKDAYS]:f.days,intervalHours:Number(f.intervalHours),monthday:Number(f.monthday),
    runAt:f.frequency==="once"?Date.parse(f.runAt):null,notify:!!f.notify,timingMode:f.watch?"condition_watch":"exact_schedule",
    timeZone:localTimeZone(),...(f.model?{model:f.model}:{})};
}
export function validateTask(f,{needsFuture=true}={}){
  if(!f.title.trim())return tr("Write a name for the task.");
  if(f.title.trim().length>120)return "Numele poate avea maximum 120 de caractere.";
  if(!f.prompt.trim())return tr("Write what {brand} should do.",{brand:BRAND_NAME});
  if(f.prompt.trim().length>8000)return tr("The instructions can have at most 8,000 characters.");
  if(TIMED.includes(f.frequency)&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time||""))return tr("Choose a valid time (00:00–23:59).");
  if(f.frequency==="interval"&&!(Number.isInteger(Number(f.intervalHours))&&f.intervalHours>=1&&f.intervalHours<=168))return tr("The interval must be between 1 and 168 hours.");
  if(f.frequency==="monthly"&&!(Number.isInteger(Number(f.monthday))&&f.monthday>=1&&f.monthday<=28))return tr("The day of the month must be between 1 and 28.");
  if(f.frequency==="selected_days"&&!f.days.length)return tr("Choose at least one day of the week.");
  if(f.frequency==="once"){const at=Date.parse(f.runAt||"");if(!Number.isFinite(at))return tr("Choose the date and time for the one-time task.");if(needsFuture&&at<=Date.now()+30000)return tr("Choose a date and time in the future.");}
  return "";
}
const EXAMPLES=[
  // 0.7.34: no country, city, shop or product names in the examples.
  {label:"News every morning",title:"Morning news",prompt:"Give me a short summary of today's most important news and technology news, with links to the sources.",frequency:"weekdays",time:"08:30"},
  {label:"Plan for the week",title:"Plan for the week",prompt:"Suggest a plan for the week that is starting: priorities, deadlines and one small step for each day.",frequency:"weekly",weekday:1,time:"09:00"},
  {label:"Watch a price",title:"Check the price",prompt:"Check the price of the product I follow on the shop's page and tell me only if it dropped below the price I set.",frequency:"daily",time:"10:00",watch:true}
];

function TaskForm({initial,editing,models,onClose,onSave}){
  useLanguage();
  const [f,setF]=useState(initial),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  const set=patch=>setF(v=>({...v,...patch}));
  const modelOptions=[...new Set([...(models||[]),f.model].filter(Boolean))];
  async function submit(e){
    e.preventDefault();
    if(saving)return;
    const problem=validateTask(f,{needsFuture:!editing||editing.enabled!==false});
    if(problem){setError(problem);return;}
    setError("");setSaving(true);
    try{await onSave(payloadFrom(f))}
    catch(err){if(mounted.current){setError(err.message);setSaving(false)}}
  }
  function toggleDay(d){set({days:f.days.includes(d)?f.days.filter(x=>x!==d):[...f.days,d]})}
  return <Modal title={editing?tr("Edit the task"):tr("New task")} subtitle={tr("{brand} runs the instructions by itself at the chosen time, while the app is running.",{brand:BRAND_NAME})} className="modal taskFormModal" onClose={onClose}>
    <form className="taskForm" onSubmit={submit} noValidate>
      <label>{tr("Name")}<input value={f.title} maxLength={120} onChange={e=>set({title:e.target.value})} placeholder={tr("E.g. News summary")} autoFocus/></label>
      <label>{tr("Instructions")}<textarea value={f.prompt} maxLength={8000} onChange={e=>set({prompt:e.target.value})} placeholder={tr("What should {brand} do? E.g. Find today's important news and give me a summary with links.",{brand:BRAND_NAME})}/></label>
      <div className="taskFormGrid">
        <label>{tr("Frequency")}<select value={f.frequency} onChange={e=>set({frequency:e.target.value})}>{FREQUENCIES.map(([k,l])=><option key={k} value={k}>{tr(l)}</option>)}</select></label>
        {TIMED.includes(f.frequency)&&<label>{tr("Time")}<input type="time" value={f.time} onChange={e=>set({time:e.target.value})}/></label>}
        {f.frequency==="interval"&&<label>{tr("Every (hours)")}<input type="number" min="1" max="168" value={f.intervalHours} onChange={e=>set({intervalHours:Math.max(1,Math.min(168,Math.round(Number(e.target.value)||1)))})}/></label>}
        {f.frequency==="once"&&<label>{tr("Date")}<input type="datetime-local" value={f.runAt} onChange={e=>set({runAt:e.target.value})}/></label>}
        {f.frequency==="weekly"&&<label>{tr("Day")}<select value={f.weekday} onChange={e=>set({weekday:Number(e.target.value)})}>{WEEK_ORDER.map(d=><option key={d} value={d}>{cap(dayName(d))}</option>)}</select></label>}
        {f.frequency==="monthly"&&<label>{tr("Day of the month")}<input type="number" min="1" max="28" value={f.monthday} onChange={e=>set({monthday:Math.max(1,Math.min(28,Math.round(Number(e.target.value)||1)))})}/></label>}
        <label>Model<select value={f.model} onChange={e=>set({model:e.target.value})}><option value="">{tr("The default model")}</option>{modelOptions.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
      </div>
      {f.frequency==="selected_days"&&<div className="dayPicker" role="group" aria-label={tr("Days")}>{WEEK_ORDER.map(d=><button type="button" key={d} aria-pressed={f.days.includes(d)} aria-label={dayName(d)} className={f.days.includes(d)?"active":""} onClick={()=>toggleDay(d)}>{dayName(d,"short")}</button>)}</div>}
      <p className="taskPreview"><Clock size={13}/> {humanSchedule(payloadFrom({...f,runAt:f.runAt||""}))}</p>
      <label className="checkRow"><input type="checkbox" checked={f.notify} onChange={e=>set({notify:e.target.checked})}/><span><b>{tr("Notify me")}</b><small>{tr("Shows a notification when the task has a result.")}</small></span></label>
      <label className="checkRow"><input type="checkbox" checked={f.watch} onChange={e=>set({watch:e.target.checked})}/><span><b>{tr("Only when something changes")}</b><small>{tr("For checks (prices, listings): no notification when the result is the same as last time.")}</small></span></label>
      {error&&<div className="inlineError" role="alert">{error}</div>}
      <div className="modalActions"><button type="button" className="secondary" onClick={onClose}>{tr("Cancel")}</button><button className="primary" disabled={saving}>{saving?tr("Saving…"):editing?tr("Save"):tr("Create the task")}</button></div>
    </form>
  </Modal>;
}

function RunHistory({task,runs}){
  const [open,setOpen]=useState(null);
  const list=runs?.data||(task.lastRunAt?[{id:"last",at:task.lastRunAt,status:task.lastStatus,model:task.model,result:task.lastResult}]:[]);
  if(runs?.loading&&!runs?.data)return <div className="emptyState small">{tr("Loading the history…")}</div>;
  if(!list.length)return <div className="emptyState small"><Clock size={22}/>{tr("The task has not run yet. Press «Run now» to see a result.")}</div>;
  return <div className="runList">
    {runs?.error&&<div className="inlineError" role="alert">{runs.error}</div>}
    {list.map((r,i)=>{const key=r.id||i,isOpen=open===key;return <div className={cx("runItem",isOpen&&"open")} key={key}>
      <button className="runHead" aria-expanded={isOpen} onClick={()=>setOpen(isOpen?null:key)}><StatusPill status={r.status}/><span className="runWhen">{relativeDay(r.at)}</span><small className="runModel">{r.model||""}</small><ChevronDown size={16}/></button>
      {isOpen&&<div className="runResult assistantBody">{r.result?<Markdown text={r.result}/>:<p>{tr("No text result.")}</p>}</div>}
    </div>})}
  </div>;
}

export function ScheduledPage({onClose,model,models}){
  useLanguage();
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  const [openId,setOpenId]=useState(null),[form,setForm]=useState(null),[running,setRunning]=useState(null),[busy,setBusy]=useState(null),[runs,setRuns]=useState({});
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function load(){
    try{const d=await api("/api/automations");if(mounted.current){setItems(d.data||[]);setLoadError("")}}
    catch(e){if(mounted.current)setLoadError(e.message)}
    finally{if(mounted.current)setLoading(false)}
  }
  async function loadRuns(id){
    setRuns(r=>({...r,[id]:{...(r[id]||{}),loading:true}}));
    try{const d=await api(`/api/automations/${id}/runs`);if(mounted.current)setRuns(r=>({...r,[id]:{data:Array.isArray(d.data)?d.data:[]}}))}
    catch(e){if(mounted.current)setRuns(r=>({...r,[id]:{data:null,error:e.status===404?"":e.message}}))}
  }
  useEffect(()=>{load();const id=setInterval(()=>{if(!document.hidden)load()},30000);return()=>clearInterval(id)},[]);
  useEffect(()=>{if(openId)loadRuns(openId)},[openId]);
  const selected=items.find(x=>x.id===openId)||null;
  useEffect(()=>{if(openId&&!loading&&!selected)setOpenId(null)},[openId,loading,selected]);
  async function toggle(x){
    if(busy)return;setBusy(x.id);
    try{await api(`/api/automations/${x.id}`,{method:"PATCH",body:JSON.stringify({enabled:!x.enabled,timeZone:localTimeZone()})});await load()}
    catch(e){toast(e.message)}
    finally{if(mounted.current)setBusy(null)}
  }
  async function run(x){
    if(running)return;setRunning(x.id);
    try{await api(`/api/automations/${x.id}/run`,{method:"POST",body:"{}"});toast(tr("«{name}» ran. The result is in the history.",{name:x.title}),"ok")}
    catch(e){toast(`„${x.title}”: ${e.message}`)}
    finally{if(mounted.current){setRunning(null);await load();loadRuns(x.id)}}
  }
  async function duplicate(x){
    if(busy)return;setBusy(x.id);
    try{const d=await api(`/api/automations/${x.id}/duplicate`,{method:"POST",body:"{}"});await load();if(d.data?.id&&mounted.current)setOpenId(d.data.id);toast(tr("Made a copy, turned off: «{name}».",{name:d.data?.title||x.title+" "+tr("(copy)")}),"ok")}
    catch(e){toast(e.message)}
    finally{if(mounted.current)setBusy(null)}
  }
  async function remove(x){
    if(!confirm(tr("Delete the task «{name}»? Its run history is lost.",{name:x.title})))return;
    try{await api(`/api/automations/${x.id}`,{method:"DELETE"});if(mounted.current)setOpenId(null);await load()}catch(e){toast(e.message)}
  }
  async function save(payload){
    if(form.editing){
      await api(`/api/automations/${form.editing.id}`,{method:"PATCH",body:JSON.stringify(payload)});
      toast(tr("The task was updated."),"ok");
    }else{
      const d=await api("/api/automations",{method:"POST",body:JSON.stringify({...payload,enabled:true})});
      toast(tr("The task «{name}» was created.",{name:d.data?.title||payload.title}),"ok");
    }
    if(!mounted.current)return;
    const editedId=form.editing?.id;
    setForm(null);await load();
    if(editedId)loadRuns(editedId);
  }
  const newTask=(preset={})=>setForm({initial:{...blankForm(model||""),...preset},editing:null});
  const header=<button className="primary" onClick={()=>newTask()}><Plus size={16}/> {tr("New task")}</button>;
  return <ToolShell title="Scheduled" subtitle={tr("Tasks {brand} runs by itself at the time you choose.",{brand:BRAND_NAME})} onClose={onClose} className="pageModal scheduledPage" actions={header}>
    <div className="pageBody">
      {loadError&&<div className="inlineError" role="alert">{tr("The tasks could not be loaded: {error}",{error:loadError})} <button className="linkBtn" onClick={()=>{setLoading(true);load()}}>{tr("Try again")}</button></div>}
      {selected?<div className="taskDetail">
        <button className="backButton" onClick={()=>setOpenId(null)}><ArrowLeft size={16}/> Toate sarcinile</button>
        <div className="taskDetailHead">
          <span className="taskIcon big"><CalendarClock size={22}/></span>
          <div className="taskDetailTitle"><h3>{selected.title}</h3><p>{humanSchedule(selected)}{selected.enabled?" · "+tr("next: {when}",{when:relativeDay(selected.nextRunAt)}):" · "+tr("off")}</p></div>
          <StatusPill status={selected.lastStatus} ran={!!selected.lastRunAt}/>
          <Switch checked={selected.enabled} disabled={busy===selected.id} label={tr(selected.enabled?"Turn off {name}":"Turn on {name}",{name:selected.title})} onChange={()=>toggle(selected)}/>
        </div>
        <div className="taskActions">
          <button className="primary" onClick={()=>run(selected)} disabled={!!running}>{running===selected.id?<RotateCcw size={15} className="spin"/>:<Play size={15}/>} {running===selected.id?tr("Running…"):tr("Run now")}</button>
          <button className="secondary" onClick={()=>setForm({initial:formFrom(selected),editing:selected})}><Pencil size={15}/> {tr("Edit")}</button>
          <button className="secondary" onClick={()=>duplicate(selected)} disabled={busy===selected.id}><Copy size={15}/> {tr("Duplicate")}</button>
          <button className="dangerButton" onClick={()=>remove(selected)}><Trash2 size={15}/> {tr("Delete")}</button>
        </div>
        <div className="taskInfoGrid">
          <div><span>{tr("Schedule")}</span><b>{humanSchedule(selected)}</b></div>
          <div><span>{tr("Next run")}</span><b>{selected.enabled&&selected.nextRunAt?relativeDay(selected.nextRunAt):"—"}</b></div>
          <div><span>Model</span><b title={selected.model||""}>{selected.model||tr("Default")}</b></div>
          <div><span>{tr("Notifications")}</span><b>{selected.notify!==false?<><Bell size={13}/> {tr("Yes")}</>:<><BellOff size={13}/> {tr("No")}</>}{selected.timingMode==="condition_watch"?" · "+tr("only on changes"):""}</b></div>
        </div>
        <section className="taskSection"><h4>{tr("Instructions")}</h4><div className="taskPromptFull">{selected.prompt}</div></section>
        <section className="taskSection"><h4>{tr("Run history")}</h4><RunHistory task={selected} runs={runs[selected.id]}/></section>
      </div>:loading?<div className="emptyState small">{tr("Loading the tasks…")}</div>:!items.length?<div className="taskEmpty">
        <span className="taskIcon big"><CalendarClock size={26}/></span>
        <h3>{tr("No scheduled task yet")}</h3>
        <p>{tr("Write once what {brand} should do and choose when. For example: «Every working day at 08:30, give me a news summary.»",{brand:BRAND_NAME})}</p>
        <div className="taskExamples">{EXAMPLES.map(({label,...preset})=><button key={label} className="secondary" onClick={()=>newTask({...preset,title:tr(preset.title),prompt:tr(preset.prompt)})}><Sparkles size={14}/> {tr(label)}</button>)}</div>
      </div>:<div className="taskList" role="list">
        {items.map(x=><div key={x.id} className={cx("taskRow",!x.enabled&&"off")} role="listitem">
          <button className="taskRowMain" onClick={()=>setOpenId(x.id)} title={tr("Open the task")}>
            <span className="taskIcon"><CalendarClock size={18}/></span>
            <span className="taskText"><b>{x.title}</b><small className="taskPromptLine">{String(x.prompt||"").replace(/\s+/g," ")}</small><span className="taskMeta"><Clock size={12}/> {humanSchedule(x)} · {x.enabled?tr("next: {when}",{when:relativeDay(x.nextRunAt)}):tr("off")}</span></span>
          </button>
          <StatusPill status={x.lastStatus} ran={!!x.lastRunAt}/>
          <Switch checked={x.enabled} disabled={busy===x.id} label={tr(x.enabled?"Turn off {name}":"Turn on {name}",{name:x.title})} onChange={()=>toggle(x)}/>
        </div>)}
      </div>}
    </div>
    {form&&<TaskForm initial={form.initial} editing={form.editing} models={models} onClose={()=>setForm(null)} onSave={save}/>}
  </ToolShell>;
}
