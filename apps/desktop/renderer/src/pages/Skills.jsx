import React, { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Sparkles, Check } from "lucide-react";
import { api, toast, cx, Switch } from "../core.jsx";
import { t as tr, useLanguage } from "../i18n.jsx";
import { SkillLibraryList } from "./SkillLibrary.jsx";

// Skills (0.7.18): instructions saved once and called with /name in the chat, or kept always on.
const BLANK={name:"",slug:"",description:"",instructions:""};
// The ready-made skills, shown in English (the server keeps the Romanian names it was made with).
const TEMPLATE_EN={
  email:["Professional email","Writes a clear, polite email with a subject from a few ideas."],
  rezumat:["Summary","Sums up a text or a document in its main ideas."],
  corector:["Proofreader","Fixes grammar, diacritics and punctuation without changing the meaning."],
  traducere:["Translator","Translates naturally, keeping the tone and the formatting."],
  social:["Social media post","Posts for Instagram, Facebook, LinkedIn or TikTok."],
  simplu:["Explain simply","Explains any subject so a beginner understands it."],
  oferta:["Offer for a client","A clear service offer with steps, price and deadline."]
};
const tplName=t=>TEMPLATE_EN[t.slug]?tr(TEMPLATE_EN[t.slug][0]):t.name;
const tplText=t=>TEMPLATE_EN[t.slug]?tr(TEMPLATE_EN[t.slug][1]):t.description;

function SkillForm({initial,onCancel,onSaved}){
  useLanguage();
  const [f,setF]=useState(initial),[busy,setBusy]=useState(false);
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  async function save(e){
    e.preventDefault();if(busy)return;setBusy(true);
    try{
      const body={name:f.name,slug:f.slug||undefined,description:f.description,instructions:f.instructions};
      const d=f.id?await api(`/api/skills/${f.id}`,{method:"PATCH",body:JSON.stringify(body)}):await api("/api/skills",{method:"POST",body:JSON.stringify(body)});
      toast(tr("The skill /{slug} was saved.",{slug:d.data.slug}),"success");onSaved();
    }catch(err){toast(err.message)}finally{setBusy(false)}
  }
  return <form className="skillForm" onSubmit={save}>
    <label>{tr("Name")}<input value={f.name} onChange={e=>set("name",e.target.value)} maxLength={60} placeholder={tr("e.g. Reply to complaints")} required/></label>
    <label>{tr("Command in chat")}<div className="skillSlug"><span>/</span><input value={f.slug} onChange={e=>set("slug",e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} maxLength={32} placeholder={tr("made from the name")}/></div></label>
    <label>{tr("Short description")}<input value={f.description} onChange={e=>set("description",e.target.value)} maxLength={300} placeholder={tr("What it does, in one sentence")}/></label>
    <label>{tr("Instructions for the AI")}<textarea value={f.instructions} onChange={e=>set("instructions",e.target.value)} maxLength={40000} rows={8} placeholder={tr("What the AI must do every time you use this skill: tone, structure, what to include, what to avoid.")} required/></label>
    <div className="formActions"><button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button><button className="primary" disabled={busy}>{busy?tr("Saving…"):tr("Save the skill")}</button></div>
  </form>;
}

// 0.7.30: one of the three tabs of Extensions.
export function SkillsPanel(){
  useLanguage();
  const [items,setItems]=useState([]),[templates,setTemplates]=useState([]),[loading,setLoading]=useState(true),[editing,setEditing]=useState(null),[busy,setBusy]=useState("");
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function load(){
    try{const d=await api("/api/skills");if(mounted.current){setItems(d.data||[]);setTemplates(d.templates||[])}}
    catch(e){toast(tr("The skills could not be loaded: {error}",{error:e.message}))}
    finally{if(mounted.current)setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  async function run(key,fn){if(busy)return;setBusy(key);try{await fn();await load()}catch(e){toast(e.message)}finally{if(mounted.current)setBusy("")}}
  const addTemplate=t=>run("t:"+t.slug,async()=>{await api("/api/skills/template",{method:"POST",body:JSON.stringify({slug:t.slug})});toast(tr("You added /{slug}. Write it in chat to use it.",{slug:t.slug}),"success")});
  const patch=(x,p)=>run(x.id,()=>api(`/api/skills/${x.id}`,{method:"PATCH",body:JSON.stringify(p)}));
  const remove=x=>{if(!confirm(tr("Delete the skill /{slug}?",{slug:x.slug})))return;run(x.id,()=>api(`/api/skills/${x.id}`,{method:"DELETE"}))};
  const free=templates.filter(t=>!t.added);
  return <div className="skillsPanel">
    <div className="pageBody">
      <p className="panelLead">{tr("Instructions saved once and used any time: write /name in chat (for example /summary) or keep a skill always on.")}</p>
      {editing?<SkillForm initial={editing} onCancel={()=>setEditing(null)} onSaved={()=>{setEditing(null);load()}}/>:<>
        <div className="skillsHead"><h3>{tr("Your skills")}</h3><button className="primary" onClick={()=>setEditing({...BLANK})}><Plus size={14}/> {tr("New skill")}</button></div>
        {loading?<div className="emptyState small">{tr("Loading…")}</div>:!items.length?<div className="taskEmpty">
          <span className="taskIcon big"><Sparkles size={26}/></span><h3>{tr("No skills yet")}</h3>
          <p>{tr("A skill is a set of instructions the AI follows when you call it. Add one below or make your own.")}</p>
        </div>:<div className="skillList">{items.map(x=><div key={x.id} className={cx("skillCard",!x.enabled&&"off")}>
          <div className="skillCardText"><b>/{x.slug} <span>{x.name}</span></b><small>{x.description||String(x.instructions||"").slice(0,140)}</small>{x.source&&<small className="libSource">{tr("{pack} · by {author} · {license}",{pack:x.source.pack,author:x.source.author,license:x.source.license})}</small>}</div>
          <div className="skillCardActions">
            <label className="skillAuto" title={tr("Always on: used on every message, without /name")}><Switch checked={!!x.auto} label={tr("Always on {slug}",{slug:x.slug})} disabled={busy===x.id} onChange={v=>patch(x,{auto:v})}/><span>{tr("Always on")}</span></label>
            <Switch checked={x.enabled} label={tr("On {slug}",{slug:x.slug})} disabled={busy===x.id} onChange={v=>patch(x,{enabled:v})}/>
            <button className="iconOnly smallIcon" onClick={()=>setEditing({...x})} aria-label={tr("Edit {name}",{name:x.slug})} title={tr("Edit")}><Pencil size={15}/></button>
            <button className="iconDanger" onClick={()=>remove(x)} aria-label={tr("Delete {name}",{name:x.slug})} title={tr("Delete")}><Trash2 size={15}/></button>
          </div>
        </div>)}</div>}
        {free.length>0&&<section className="catalogSection"><h3>{tr("Ready-made")}</h3><div className="catalogGrid">
          {free.map(t=><div className="catalogCard" key={t.slug}>
            <span className="pluginLogo"><span>/</span></span>
            <div className="catalogText"><b>{tplName(t)} <small>/{t.slug}</small></b><small>{tplText(t)}</small></div>
            <button className="smallBtn addBtn" onClick={()=>addTemplate(t)} disabled={busy==="t:"+t.slug} aria-label={tr("Add {name}",{name:tplName(t)})}>{busy==="t:"+t.slug?<Check size={13}/>:<Plus size={13}/>} {tr("Add")}</button>
          </div>)}
        </div></section>}
        <SkillLibraryList/>
      </>}
    </div>
  </div>;
}
