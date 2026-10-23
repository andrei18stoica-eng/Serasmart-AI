import React, { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, Download, ExternalLink, Trash2, Monitor, Tablet, Smartphone, LoaderCircle, WandSparkles, Palette } from "lucide-react";
import { api, authedFetch, toast, cx, shortDate, relativeDay, openLink, saveBlobDownload, useAccess, ToolShell } from "../core.jsx";
import { DESIGN_KINDS } from "./Library.jsx";
import { BRAND_NAME } from "../brand.js";
import { t as tr, useLanguage } from "../i18n.jsx";

// 0.7.34: labels in English, shown through tr() at render time; the examples name no city, place, person, date or address.
const KIND_CHIPS=[["site","Website"],["landing","Landing page"],["afis","Poster"],["prezentare","Presentation"],["card","Business card"],["meniu","Menu"],["cv","CV"],["email","Email"]];
const EXAMPLES=[
  {kind:"site",text:"A presentation website for a café: menu, opening hours, gallery and contact form."},
  {kind:"landing",text:"A landing page for a fitness app, with benefits, 3 plans and a download button."},
  {kind:"afis",text:"A poster for an outdoor rock concert, in neon colours."},
  {kind:"prezentare",text:"A 6-slide presentation about solar energy for high school students."},
  {kind:"card",text:"A minimalist black-and-white business card for an architect."},
  {kind:"cv",text:"A modern CV for a junior programmer with 2 years of React experience."}
];
const WIDTHS=[["desktop","Desktop",Monitor,"100%"],["tablet","Tablet",Tablet,"820px"],["phone","Phone",Smartphone,"390px"]];
const STEPS=["Planning the structure…","Choosing colours and fonts…","Writing HTML and CSS…","Checking how it looks on a phone…","Almost done…"];
function fileName(title){return (String(title||"design").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,80)||"design")+".html";}

function Progress({job,onCancel}){
  useLanguage();
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
  const s=Math.max(0,Math.round((now-job.started)/1000));
  const pct=Math.round(92*(1-Math.exp(-s/28)));
  return <div className="designProgress" role="status" aria-live="polite">
    <LoaderCircle size={30} className="spin"/>
    <h3>{job.type==="revise"?tr("Applying the changes…"):tr("Creating the design…")}</h3>
    <p>{tr(STEPS[Math.min(STEPS.length-1,Math.floor(s/10))]}</p>
    <div className="progressBar" aria-hidden="true"><span style={{transform:`scaleX(${pct/100})`}}/></div>
    <small>{tr("{s} s · it usually takes about a minute",{s})}</small>
    {job.prompt&&<blockquote>{job.prompt}</blockquote>}
    <button className="secondary" onClick={onCancel}>{tr("Cancel")}</button>
  </div>;
}

export function DesignPage({onClose,model,models,initialId=null}){
  useLanguage();
  const {can,deny}=useAccess();
  const [list,setList]=useState([]),[listError,setListError]=useState(""),[loadingList,setLoadingList]=useState(true);
  const [currentId,setCurrentId]=useState(initialId),[design,setDesign]=useState(null),[version,setVersion]=useState(null),[preview,setPreview]=useState({url:"",error:""});
  const [prompt,setPrompt]=useState(""),[kind,setKind]=useState("site"),[genModel,setGenModel]=useState(model||"");
  const [job,setJob]=useState(null),[error,setError]=useState(""),[width,setWidth]=useState("desktop"),[title,setTitle]=useState(""),[revise,setRevise]=useState("");
  const mounted=useRef(true),controller=useRef(null),promptRef=useRef(null);
  useEffect(()=>()=>{mounted.current=false;try{controller.current?.abort()}catch{}},[]);
  async function loadList(){
    try{const d=await api("/api/designs");if(mounted.current){setList([...(d.data||[])].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)));setListError("")}}
    catch(e){if(mounted.current)setListError(e.message)}
    finally{if(mounted.current)setLoadingList(false)}
  }
  useEffect(()=>{loadList()},[]);
  useEffect(()=>{
    if(!currentId){setDesign(null);setVersion(null);return;}
    if(design?.id===currentId)return;
    let active=true;
    api(`/api/designs/${currentId}`).then(d=>{if(!active)return;setDesign(d.data);setTitle(d.data?.title||"");setVersion(d.data?.latest||d.data?.versions?.at(-1)?.n||1)})
      .catch(e=>{if(active){toast(e.message);setCurrentId(null)}});
    return()=>{active=false};
  },[currentId]);
  useEffect(()=>{
    if(!design?.id||!version)return;
    let active=true;
    setPreview({url:"",error:""});
    api(`/api/designs/${design.id}/preview-token?v=${version}`).then(d=>{if(active)setPreview({url:d.data?.url||"",error:d.data?.url?"":tr("The preview is not available.")})})
      .catch(e=>{if(active)setPreview({url:"",error:e.message})});
    return()=>{active=false};
  },[design?.id,version,design?.latest]);
  function show(d){setDesign(d);setTitle(d?.title||"");setVersion(d?.latest||d?.versions?.at(-1)?.n||1);setCurrentId(d?.id||null)}
  async function runJob(type,path,body,label){
    if(!can("document_generation")){deny("document_generation");return false;}
    if(job)return false;
    const c=new AbortController();controller.current=c;
    setError("");setJob({type,started:Date.now(),prompt:label});
    try{
      const d=await api(path,{method:"POST",body:JSON.stringify(body),signal:c.signal});
      if(!mounted.current)return false;
      show(d.data);loadList();
      return true;
    }catch(e){
      if(mounted.current&&!c.signal.aborted)setError(e.message);
      return false;
    }finally{if(mounted.current&&controller.current===c){controller.current=null;setJob(null)}}
  }
  async function generate(e){
    e?.preventDefault?.();
    const text=prompt.trim();
    if(!text){setError(tr("First describe what we should build."));promptRef.current?.focus();return;}
    if(await runJob("create","/api/designs",{prompt:text,kind,...(genModel?{model:genModel}:{})},text))setPrompt("");
  }
  async function doRevise(e){
    e?.preventDefault?.();
    const text=revise.trim();if(!text||!design)return;
    if(await runJob("revise",`/api/designs/${design.id}/revise`,{instructions:text,v:version,...(genModel?{model:genModel}:{})},text))setRevise("");
  }
  function cancel(){try{controller.current?.abort()}catch{}controller.current=null;setJob(null);setTimeout(loadList,1500)}
  async function rename(){
    const t=title.trim();
    if(!design||!t||t===design.title){setTitle(design?.title||"");return;}
    try{const d=await api(`/api/designs/${design.id}`,{method:"PATCH",body:JSON.stringify({title:t})});setDesign(v=>({...v,...(d.data||{}),title:d.data?.title||t}));loadList()}
    catch(e){toast(e.message);setTitle(design.title||"")}
  }
  async function download(){
    try{const r=await authedFetch(`/api/designs/${design.id}/download?v=${version}`);await saveBlobDownload(await r.blob(),fileName(design.title))}
    catch(e){toast(tr("Download: {error}",{error:e.message}))}
  }
  async function openInBrowser(){
    try{const d=await api(`/api/designs/${design.id}/preview-token?v=${version}`);if(d.data?.url)openLink(d.data.url);else toast(tr("The preview link is not available."))}
    catch(e){toast(e.message)}
  }
  async function remove(){
    if(!design||!confirm(tr("Delete the design «{name}» with all its versions?",{name:design.title})))return;
    try{await api(`/api/designs/${design.id}`,{method:"DELETE"});setCurrentId(null);setDesign(null);loadList()}catch(e){toast(e.message)}
  }
  function newDesign(){if(job)return;setCurrentId(null);setDesign(null);setError("");setTimeout(()=>promptRef.current?.focus(),0)}
  const modelOptions=[...new Set([...(models||[]),genModel].filter(Boolean))];
  const versions=[...(design?.versions||[])].sort((a,b)=>b.n-a.n);
  const current=versions.find(v=>v.n===version);
  const frameWidth=WIDTHS.find(w=>w[0]===width)?.[3]||"100%";
  const modelSelect=<label className="designModel"><span>Model</span><select value={genModel} onChange={e=>setGenModel(e.target.value)} aria-label={tr("Model for the design")}><option value="">{tr("Default")}</option>{modelOptions.map(m=><option key={m} value={m}>{m}</option>)}</select></label>;
  return <ToolShell title="Design" subtitle={tr("Describe a website, a poster or a presentation; {brand} makes an HTML mock-up you can see, change and download.",{brand:BRAND_NAME})} onClose={onClose} className="pageModal designPage" actions={<button className="secondary" onClick={newDesign} disabled={!!job}><Plus size={15}/> {tr("New design")}</button>}>
    <div className="designLayout">
      <aside className="designList" aria-label={tr("Your designs")}>
        <div className="designListHead">{tr("Your designs")}</div>
        {listError&&<div className="inlineError" role="alert">{listError}</div>}
        {loadingList?<p className="designListEmpty">{tr("Loading…")}</p>:!list.length?<p className="designListEmpty">{tr("No designs yet. Describe the first one on the right.")}</p>:
          list.map(d=><button key={d.id} className={cx("designListItem",d.id===currentId&&"active")} onClick={()=>{if(!job)setCurrentId(d.id)}} disabled={!!job&&d.id!==currentId}><b>{d.title||tr("Untitled design")}</b><small>{tr(DESIGN_KINDS[d.kind]||"Design")} · {shortDate(d.updatedAt||d.createdAt)}</small></button>)}
      </aside>
      <section className="designMain">
        {job?.type==="create"?<Progress job={job} onCancel={cancel}/>:design?<div className="designWorkspace">
          <div className="designToolbar">
            <input className="designTitle" value={title} onChange={e=>setTitle(e.target.value)} onBlur={rename} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur()}}} maxLength={120} aria-label={tr("Design title")}/>
            <label className="versionSelect"><span>{tr("Version")}</span><select value={version||""} onChange={e=>setVersion(Number(e.target.value))} aria-label={tr("Version")}>{versions.map(v=><option key={v.n} value={v.n}>v{v.n}{v.n===design.latest?" "+tr("(latest)"):""} · {shortDate(v.at)}</option>)}</select></label>
            <div className="segmented" role="group" aria-label={tr("Preview width")}>{WIDTHS.map(([k,label,Icon])=><button key={k} aria-pressed={width===k} className={cx(width===k&&"active")} onClick={()=>setWidth(k)} title={tr(label)}><Icon size={15}/><span>{label}</span></button>)}</div>
            <div className="designToolbarActions">
              <button className="secondary" onClick={download}><Download size={15}/> {tr("Download HTML")}</button>
              <button className="secondary" onClick={openInBrowser}><ExternalLink size={15}/> {tr("Open in browser")}</button>
              <button className="dangerButton" onClick={remove}><Trash2 size={15}/> {tr("Delete")}</button>
            </div>
          </div>
          {current?.prompt&&<p className="designCaption" title={current.prompt}><b>v{current.n}</b> {current.prompt} · {relativeDay(current.at)}</p>}
          <div className={cx("designStage",width)}>
            {preview.url?<div className="designFrameWrap" style={{width:frameWidth}}><iframe key={preview.url} title={tr("Preview: {name}",{name:design.title||"design"})} sandbox="allow-scripts allow-forms allow-popups" src={preview.url}/></div>
              :<div className="previewPlaceholder">{preview.error||tr("Loading the preview…")}</div>}
            {job?.type==="revise"&&<div className="designRevising" role="status"><LoaderCircle size={18} className="spin"/> {tr("Applying the changes…")} <button className="smallBtn" onClick={cancel}>{tr("Cancel")}</button></div>}
          </div>
          {error&&<div className="inlineError" role="alert">{error}</div>}
          <form className="designRevise" onSubmit={doRevise}>
            <textarea value={revise} onChange={e=>setRevise(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent?.isComposing){e.preventDefault();doRevise()}}} placeholder={tr("Change… (e.g. make the background dark blue and add a pricing section)")} aria-label={tr("What should I change")}/>
            <button className="primary" disabled={!revise.trim()||!!job}><WandSparkles size={15}/> {tr("Change")}</button>
          </form>
        </div>:currentId?<div className="previewPlaceholder">{tr("Loading the design…")}</div>:<form className="designStart" onSubmit={generate}>
          <span className="designHero"><Palette size={26}/></span>
          <h3>{tr("What are we building today?")}</h3>
          <p>{tr("Describe the page, the poster or the presentation. {brand} writes a single HTML file you see right away, change with words and download.",{brand:BRAND_NAME})}</p>
          <div className="designPromptBox">
            <textarea ref={promptRef} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();generate()}}} placeholder={tr("Describe what we should build…")} aria-label={tr("Describe what we should build")}/>
            <div className="designPromptBar">{modelSelect}<button className="primary" disabled={!prompt.trim()}><Sparkles size={15}/> {tr("Generate")}</button></div>
          </div>
          <div className="chipRow designKinds" role="radiogroup" aria-label={tr("Design type")}>{KIND_CHIPS.map(([k,label])=><button type="button" key={k} role="radio" aria-checked={kind===k} className={cx("filterChip",kind===k&&"active")} onClick={()=>setKind(k)}>{tr(label)}</button>)}</div>
          {error&&<div className="inlineError" role="alert">{error}</div>}
          <div className="designExamples"><h4>{tr("Examples")}</h4><div className="designExampleGrid">{EXAMPLES.map(x=><button type="button" key={x.text} className="designExample" onClick={()=>{setPrompt(tr(x.text));setKind(x.kind);promptRef.current?.focus()}}><b>{tr(DESIGN_KINDS[x.kind])}</b><span>{tr(x.text)}</span></button>)}</div></div>
        </form>}
      </section>
    </div>
  </ToolShell>;
}
