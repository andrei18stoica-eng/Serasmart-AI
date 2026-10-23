import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Check, Trash2, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { api, toast, cx, openLink } from "../core.jsx";
import { t as tr, useLanguage } from "../i18n.jsx";

// 0.7.31: the open-source skill library. Plugins = packs of several skills (Extensions → Plugins → Skill plugins);
// single skills are added one by one (Extensions → Skills → Library). Every card names the author and the licence.

const CATEGORY_NAMES={
  creative:"Design and creativity",workflows:"Ways of working",science:"Science",business:"Business",development:"Development",
  languages:"Programming languages",security:"Security",documentation:"Documentation","ai-ml":"AI and machine learning",
  marketing:"Marketing",infrastructure:"Infrastructure",operations:"Operations",utilities:"Utilities",quality:"Quality",
  data:"Data",database:"Databases",api:"APIs",testing:"Testing",performance:"Performance",modernization:"Modernisation",
  governance:"Governance",blockchain:"Blockchain",finance:"Finance",payments:"Payments",gaming:"Games",accessibility:"Accessibility"
};
const categoryName=c=>tr(CATEGORY_NAMES[c]||c);

function useSkillLibrary(){
  const [lib,setLib]=useState(null),[busy,setBusy]=useState("");
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function load(){
    try{const d=await api("/api/skills/library");if(mounted.current)setLib(d)}
    catch(e){toast(tr("The skill library could not be loaded: {error}",{error:e.message}))}
  }
  useEffect(()=>{load()},[]);
  async function run(key,fn,done){
    if(busy)return;setBusy(key);
    try{await fn();if(done)toast(done,"success");await load()}catch(e){toast(e.message)}finally{if(mounted.current)setBusy("")}
  }
  return {lib,busy,run,load};
}

function Source({author,license,repo}){
  return <small className="libSource">{tr("by {author} · {license}",{author,license})}{repo&&<> · <button type="button" className="linkBtn" onClick={()=>openLink(repo)}>{tr("source")} <ExternalLink size={11}/></button></>}</small>;
}

// 0.7.32: the attribution and the full licence texts, shown on request (MIT and Apache 2.0 ask for them).
export function LicenceNotice(){
  useLanguage();
  const [data,setData]=useState(null),[open,setOpen]=useState(false);
  async function toggle(){
    if(!open&&!data){try{setData(await api("/api/skills/library/notice"))}catch(e){toast(e.message);return}}
    setOpen(o=>!o);
  }
  return <div className="licenceNotice">
    <button type="button" className="linkBtn" aria-expanded={open} onClick={toggle}>{open?<ChevronDown size={13}/>:<ChevronRight size={13}/>} {tr("Licences and authors")}</button>
    {open&&data&&<div className="licenceText">
      <pre>{data.notice}</pre>
      {data.licenses.map(l=><details key={l.name}><summary>{l.name}</summary><pre>{l.text}</pre></details>)}
    </div>}
  </div>;
}

export function SkillPacks(){
  useLanguage();
  const {lib,busy,run}=useSkillLibrary();
  const [query,setQuery]=useState(""),[open,setOpen]=useState("");
  const added=useMemo(()=>new Map((lib?.added?.packs||[]).map(x=>[x.pack,x.id])),[lib]);
  if(!lib)return <div className="emptyState small">{tr("Loading…")}</div>;
  const q=query.trim().toLowerCase();
  const packs=lib.packs.filter(p=>!q||[p.name,p.description,p.author,categoryName(p.category),...p.skills.map(s=>s.name)].some(v=>String(v).toLowerCase().includes(q)));
  const mine=packs.filter(p=>added.has(p.id)),rest=packs.filter(p=>!added.has(p.id));
  const add=p=>run("p:"+p.id,()=>api("/api/skills/library",{method:"POST",body:JSON.stringify({pack:p.id})}),tr("{name} was added: its {n} skills work with /name in chat.",{name:p.name,n:p.skills.length}));
  const remove=p=>{if(!confirm(tr("Remove the plugin «{name}»?",{name:p.name})))return;run("p:"+p.id,()=>api(`/api/skills/${added.get(p.id)}`,{method:"DELETE"}))};
  const card=p=>{const isOn=added.has(p.id),expanded=open===p.id;return <div className={cx("packCard",isOn&&"on")} key={p.id}>
    <div className="packTop">
      <span className="pluginLogo"><span>{p.name.slice(0,1)}</span></span>
      <div className="catalogText"><b>{p.name} <small>{tr("{n} skills",{n:p.skills.length})}</small></b><small>{p.description}</small><Source author={p.author} license={p.license} repo={p.repo}/></div>
      {isOn?<button className="smallBtn dangerSmall" onClick={()=>remove(p)} disabled={busy==="p:"+p.id} aria-label={tr("Remove {name}",{name:p.name})}><Trash2 size={13}/> {tr("Remove")}</button>
        :<button className="smallBtn addBtn" onClick={()=>add(p)} disabled={busy==="p:"+p.id} aria-label={tr("Add {name}",{name:p.name})}>{busy==="p:"+p.id?<Check size={13}/>:<Plus size={13}/>} {tr("Add")}</button>}
    </div>
    <button type="button" className="packToggle" aria-expanded={expanded} onClick={()=>setOpen(expanded?"":p.id)}>{expanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>} {tr("What it contains")}</button>
    {expanded&&<ul className="packSkills">{p.skills.map(s=><li key={s.slug}><b>/{s.slug}</b> <span>{s.description}</span></li>)}</ul>}
  </div>};
  const groups=[...new Set(rest.map(p=>p.category))].map(c=>({c,items:rest.filter(p=>p.category===c)}));
  return <div className="skillPacks">
    <p className="panelLead">{tr("A plugin is a set of skills. Add it once and write /name in chat for any of its skills. A plugin counts as one skill in your plan.")}</p>
    <div className="pageSearch"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("Search plugins and skills")} aria-label={tr("Search plugins and skills")}/></div>
    {mine.length>0&&<section className="catalogSection"><h3>{tr("Added")}</h3><div className="packGrid">{mine.map(card)}</div></section>}
    {groups.map(({c,items})=><section className="catalogSection" key={c}><h3>{categoryName(c)}</h3><div className="packGrid">{items.map(card)}</div></section>)}
    {!packs.length&&<div className="emptyState small">{tr("Nothing found.")}</div>}
    <p className="libNote">{tr("The plugins come from open-source projects (MIT and Apache 2.0 licences); each card names its author and links to the source.")}</p>
    <LicenceNotice/>
  </div>;
}

export function SkillLibraryList(){
  useLanguage();
  const {lib,busy,run}=useSkillLibrary();
  const [query,setQuery]=useState(""),[shown,setShown]=useState(30);
  const all=useMemo(()=>(lib?.packs||[]).flatMap(p=>p.skills.map(s=>({...s,pack:p}))),[lib]);
  const added=useMemo(()=>new Set((lib?.added?.skills||[]).map(x=>x.slug)),[lib]);
  if(!lib)return null;
  const q=query.trim().toLowerCase();
  const list=all.filter(s=>!added.has(s.slug)&&(!q||[s.slug,s.name,s.description,s.pack.name].some(v=>String(v).toLowerCase().includes(q))));
  const add=s=>run("s:"+s.slug,()=>api("/api/skills/library",{method:"POST",body:JSON.stringify({skill:s.slug})}),tr("You added /{slug}. Write it in chat to use it.",{slug:s.slug}));
  return <section className="catalogSection skillLibrary">
    <h3>{tr("Library")} <small>{tr("{n} skills",{n:all.length})}</small></h3>
    <div className="pageSearch"><Search size={16}/><input value={query} onChange={e=>{setQuery(e.target.value);setShown(30)}} placeholder={tr("Search the library")} aria-label={tr("Search the library")}/></div>
    <div className="catalogGrid">{list.slice(0,shown).map(s=><div className="catalogCard" key={s.slug}>
      <span className="pluginLogo"><span>/</span></span>
      <div className="catalogText"><b>{s.name} <small>/{s.slug}</small></b><small className="clamp2">{s.description}</small><Source author={s.pack.author} license={s.pack.license} repo={s.pack.repo}/></div>
      <button className="smallBtn addBtn" onClick={()=>add(s)} disabled={busy==="s:"+s.slug} aria-label={tr("Add {name}",{name:s.name})}>{busy==="s:"+s.slug?<Check size={13}/>:<Plus size={13}/>} {tr("Add")}</button>
    </div>)}</div>
    {list.length>shown&&<button className="secondary moreBtn" onClick={()=>setShown(n=>n+30)}>{tr("Show more ({n} left)",{n:list.length-shown})}</button>}
    {!list.length&&<div className="emptyState small">{tr("Nothing found.")}</div>}
    <LicenceNotice/>
  </section>;
}
