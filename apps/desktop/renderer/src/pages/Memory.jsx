import React, { useEffect, useRef, useState } from "react";
import { Search, Trash2, Pin, PinOff, Pencil, Brain, History, Check, X } from "lucide-react";
import { api, toast, cx, plural, fmtTime, ToolShell, Switch } from "../core.jsx";
import { BRAND_NAME } from "../brand.js";
import { t as tr, useLanguage } from "../i18n.jsx";

export const PREFERENCE_ITEMS=[
  ["memoryEnabled","Use memory","{brand} keeps your preferences, decisions and lasting details on its own and uses them when they matter."],
  ["searchPastChats","Search past chats","When you ask something, it searches your other chats (archived ones too) and uses what is related. So you can continue a topic in a new chat."],
  ["askClarifyingQuestions","Ask clarifying questions (with answer choices)","When a request can be read in several ways, {brand} asks first, with choices you pick with one click."]
];
export function PreferenceSwitches({preferences,onChange,busyKey=""}){
  return <div className="prefList">{PREFERENCE_ITEMS.map(([k,title,desc])=><div className="prefRow" key={k}>
    <div className="prefText"><b>{tr(title)}</b><span>{tr(desc,{brand:BRAND_NAME})}</span></div>
    <Switch checked={preferences?.[k]!==false} label={tr(title)} disabled={busyKey===k} onChange={v=>onChange({[k]:v})}/>
  </div>)}</div>;
}

const MEMORY_SOURCES={manual:"added by you",automatic:"kept automatically",history:"from history",automation:"from a scheduled task"};
const CATEGORY_ORDER=["preferință","proiect","decizie","detaliu"];
const CATEGORY_LABELS={"preferință":"Preferences","proiect":"Projects and work","decizie":"Decisions","detaliu":"Other details"};

function MemoryItem({x,busy,onPin,onRemove,onSave}){
  const [editing,setEditing]=useState(false),[text,setText]=useState(x.text);
  useEffect(()=>{if(!editing)setText(x.text)},[x.text,editing]);
  async function save(){if(!text.trim()||text.trim()===x.text){setEditing(false);return;}if(await onSave(x,text.trim()))setEditing(false)}
  return <div className={cx("memoryItem",x.pinned&&"pinned")}>
    <button className="pinBtn" onClick={()=>onPin(x)} disabled={busy} aria-label={x.pinned?tr("Unpin"):tr("Pin this")} title={x.pinned?tr("Pinned — press to unpin"):tr("Pin")}>{x.pinned?<Pin size={16}/>:<PinOff size={16}/>}</button>
    <div className="memoryItemBody">
      {editing?<textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();save()}}} aria-label={tr("Text of the item")} autoFocus/>:<p>{x.text}</p>}
      <span>{tr(MEMORY_SOURCES[x.source]||x.source||"memory")} · {fmtTime(x.updatedAt||x.createdAt)}</span>
    </div>
    <div className="memoryItemActions">
      {editing?<>
        <button className="iconOnly smallIcon" onClick={save} disabled={busy||!text.trim()} aria-label={tr("Save the change")} title={tr("Save")}><Check size={15}/></button>
        <button className="iconOnly smallIcon" onClick={()=>setEditing(false)} aria-label={tr("Discard the change")} title={tr("Discard")}><X size={15}/></button>
      </>:<button className="iconOnly smallIcon" onClick={()=>setEditing(true)} disabled={busy} aria-label={tr("Edit this")} title={tr("Edit")}><Pencil size={15}/></button>}
      <button className="iconDanger" onClick={()=>onRemove(x)} disabled={busy} aria-label={tr("Delete this")} title={tr("Delete")}><Trash2 size={15}/></button>
    </div>
  </div>;
}

export function MemoryPage({onClose,preferences,onPreferences,prefBusy}){
  useLanguage();
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[enabled,setEnabled]=useState(true),[query,setQuery]=useState(""),[text,setText]=useState(""),[summary,setSummary]=useState(null),[busy,setBusy]=useState(""),[error,setError]=useState("");
  const seq=useRef(0),mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function load(q=query.trim()){
    const id=++seq.current;
    try{
      const [d,sm]=await Promise.all([api(`/api/memory${q?`?q=${encodeURIComponent(q)}`:""}`),api("/api/memory/summary").catch(()=>({data:null}))]);
      if(id!==seq.current||!mounted.current)return;
      setItems(d.data||[]);setEnabled(d.enabled!==false);setSummary(sm.data||null);setError("");
    }catch(e){if(id===seq.current&&mounted.current)setError(e.message)}
    finally{if(id===seq.current&&mounted.current)setLoading(false)}
  }
  useEffect(()=>{const t=setTimeout(()=>load(query.trim()),query.trim()?300:0);return()=>clearTimeout(t)},[query]);
  async function run(kind,fn){if(busy)return false;setBusy(kind);try{await fn();return true}catch(e){toast(e.message);return false}finally{if(mounted.current)setBusy("")}}
  const add=()=>{if(!text.trim())return;run("add",async()=>{await api("/api/memory",{method:"POST",body:JSON.stringify({text:text.trim(),pinned:true})});setText("");toast(tr("Saved and pinned in memory."),"ok");await load()})};
  const pin=x=>run("pin",async()=>{await api(`/api/memory/${x.id}`,{method:"PATCH",body:JSON.stringify({pinned:!x.pinned})});await load()});
  const saveText=(x,value)=>run("edit",async()=>{await api(`/api/memory/${x.id}`,{method:"PATCH",body:JSON.stringify({text:value})});await load()});
  const remove=x=>{if(!confirm(tr("Delete this from memory?")))return;run("remove",async()=>{await api(`/api/memory/${x.id}`,{method:"DELETE"});await load()})};
  const clear=()=>{if(!confirm(tr("Delete everything {brand} remembers for this account? This cannot be undone.",{brand:BRAND_NAME})))return;run("clear",async()=>{await api("/api/memory",{method:"DELETE"});setQuery("");await load("")})};
  const importHistory=()=>{if(!confirm(tr("Import lasting details (preferences, decisions, project details) from your chat history?")))return;run("import",async()=>{const d=await api("/api/memory/import-history",{method:"POST",body:"{}"});toast(tr("Imported {n} items from history.",{n:d.count||0}),"ok");await load()})};
  async function changePreferences(patch){
    const ok=await onPreferences(patch);
    if(ok&&"memoryEnabled" in patch)setEnabled(patch.memoryEnabled);
  }
  const prefs={...(preferences||{}),memoryEnabled:preferences&&typeof preferences.memoryEnabled==="boolean"?preferences.memoryEnabled:enabled};
  const facts=summary?[...(summary.recent||[])].sort((a,b)=>Number(b.pinned)-Number(a.pinned)).slice(0,5):[];
  const searching=!!query.trim();
  const grouped=searching?[[tr("Results"),items]]:CATEGORY_ORDER.map(c=>[tr(CATEGORY_LABELS[c]),items.filter(x=>(x.category||"detaliu")===c)]).concat([[tr("Others"),items.filter(x=>!CATEGORY_ORDER.includes(x.category||"detaliu"))]]).filter(([,list])=>list.length);
  return <ToolShell title={tr("Memory")} subtitle={tr("What {brand} remembers about you and how it uses earlier chats.",{brand:BRAND_NAME})} onClose={onClose} className="pageModal memoryPage">
    <div className="pageBody">
      <div className="memoryOverview">
        <section className="memoryCard">
          <h3><Brain size={17}/> {tr("Memory settings")}</h3>
          <PreferenceSwitches preferences={prefs} onChange={changePreferences} busyKey={prefBusy}/>
        </section>
        <section className="memoryCard">
          <h3><History size={17}/> {tr("What {brand} knows about you",{brand:BRAND_NAME})}</h3>
          {!prefs.memoryEnabled&&<p className="memoryOff">{tr("Memory is off: {brand} does not keep or use anything new until you turn it on.",{brand:BRAND_NAME})}</p>}
          {summary?.count?<>
            <div className="memoryStats"><span><b>{summary.count}</b> {summary.count===1?tr("item"):tr("items")}</span><span><b>{summary.pinned||0}</b> {tr("pinned")}</span><span><b>{Object.keys(summary.categories||{}).length}</b> {Object.keys(summary.categories||{}).length===1?tr("category"):tr("categories")}</span></div>
            <ul className="memoryFacts">{facts.map(f=><li key={f.id}>{f.pinned&&<Pin size={12}/>} {String(f.text).length>170?String(f.text).slice(0,170)+"…":f.text}</li>)}</ul>
          </>:<p className="memoryEmptyNote">{tr("Nothing yet. As you talk, {brand} keeps your preferences and important decisions. You can add something below too.",{brand:BRAND_NAME})}</p>}
        </section>
      </div>
      <div className="memoryAdd"><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();add()}}} placeholder={tr("Add something important for {brand} to remember… (Ctrl+Enter saves)",{brand:BRAND_NAME})} aria-label={tr("New item for memory")}/><button className="primary" onClick={add} disabled={!text.trim()||!!busy}>{busy==="add"?tr("Saving…"):tr("Save and pin")}</button></div>
      <div className="memoryToolbar">
        <div className="pageSearch"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("Search memory")} aria-label={tr("Search memory")}/></div>
        <button className="secondary" onClick={importHistory} disabled={!!busy}><History size={15}/> {busy==="import"?tr("Importing…"):tr("Import from history")}</button>
        <button className="dangerButton" onClick={clear} disabled={!!busy||!items.length}><Trash2 size={15}/> {tr("Delete all")}</button>
      </div>
      {error&&<div className="inlineError" role="alert">{error}</div>}
      {loading?<div className="emptyState small">{tr("Loading memory…")}</div>:!items.length?<div className="emptyState small">{searching?tr("Nothing found for this search."):tr("Memory is empty.")}</div>:
        grouped.map(([label,list])=><section className="memoryGroup" key={label}><h4>{label} <small>{list.length}</small></h4><div className="memoryList">{list.map(x=><MemoryItem key={x.id} x={x} busy={!!busy} onPin={pin} onRemove={remove} onSave={saveText}/>)}</div></section>)}
    </div>
  </ToolShell>;
}
