import React, { useEffect, useRef, useState } from "react";
import { Upload, Search, Eye, Download, Trash2, FileText, Film, Music, Palette, X, HardDrive, Play, MessageSquarePlus, Maximize2 } from "lucide-react";
import { FileViewer, FileName, canView } from "../viewer.jsx";
import { t as tr, useLanguage } from "../i18n.jsx";
import { api, authedFetch, toast, cx, plural, formatBytes, shortDate, mediaKind, kindLabel, uploadFileToLibrary, downloadLibraryFile, useAccess, deniedMessage, useModal, useAuthedBlobUrl, useInView, ToolShell } from "../core.jsx";

// 0.7.34: labels in English, translated with tr() where they are shown.
export const LIBRARY_FILTERS=[["all","All"],["document","Documents"],["image","Pictures"],["video","Video"],["audio","Audio"],["design","Design"]];
export const DESIGN_KINDS={site:"Website",landing:"Landing page",afis:"Poster",prezentare:"Presentation",card:"Business card",meniu:"Menu",cv:"CV",email:"Email",altceva:"Other"};
export function libraryCategory(x){if(x?.isDesign)return "design";const k=mediaKind(x.mime,x.name);return k==="image"||k==="audio"||k==="video"?k:"document";}
const TEXT_STATUS={pending:["Reading the text…","pending"],ok:["Text read for the AI","ok"],empty:["No readable text","warn"],too_large:["Too big to read","warn"],error:["The text could not be read","warn"]};
const SORTS=[["new","Newest"],["name","Name"],["size","Size"]];
function extOf(name){const m=String(name||"").match(/\.([a-z0-9]{1,6})$/i);return m?m[1].toUpperCase():"";}
function hasFiles(e){return [...(e.dataTransfer?.types||[])].includes("Files");}

function Thumb({x}){
  const cat=libraryCategory(x);
  const [ref,seen]=useInView();
  const {src}=useAuthedBlobUrl(cat==="image"&&seen&&!/heic|heif/i.test(`${x.mime} ${x.name}`)?`/api/library/${x.id}/content`:"");
  return <span ref={ref} className={cx("libThumbInner",cat)}>
    {src?<img src={src} alt="" loading="lazy"/>:cat==="video"?<><Film size={26}/><Play size={14} className="libPlayBadge"/></>:cat==="audio"?<Music size={26}/>:cat==="design"?<Palette size={26}/>:<><FileText size={26}/>{extOf(x.name)&&<em>{extOf(x.name)}</em>}</>}
  </span>;
}

function PreviewBody({item}){
  const cat=libraryCategory(item),kind=mediaKind(item.mime,item.name);
  const media=["image","video","audio"].includes(cat);
  const {src,failed}=useAuthedBlobUrl(media?`/api/library/${item.id}/content`:"");
  const [text,setText]=useState({loading:!media,value:"",note:""});
  useEffect(()=>{
    if(media)return;
    let active=true;
    (async()=>{
      try{
        if(kind==="text"){
          const r=await authedFetch(`/api/library/${item.id}/content`);const t=await r.text();
          if(active)setText({loading:false,value:t.slice(0,60000),note:t.length>60000?tr("Showing the first 60,000 characters."):""});
          return;
        }
        const d=(await api(`/api/library/${item.id}`)).data||{};
        const full=String(d.text||"");
        const pdf=/pdf/i.test(`${d.mime} ${d.name}`);
        const first=pdf&&full.includes("\f")?full.split("\f").find(p=>p.trim())||"":full.slice(0,pdf?3500:8000);
        const status=TEXT_STATUS[d.textStatus]?.[0];
        if(active)setText({loading:false,value:first,note:full?(pdf?tr("The first page, as text."):full.length>first.length?tr("The beginning of the document, as text."):""):(status||tr("This kind of file has no preview. You can download it."))});
      }catch(e){if(active)setText({loading:false,value:"",note:e.message})}
    })();
    return()=>{active=false};
  },[item.id]);
  if(media){
    if(!src)return <div className="previewPlaceholder">{failed?tr("The preview is not available."):tr("Loading…")}</div>;
    if(cat==="image")return <img className="previewMedia" src={src} alt={item.name}/>;
    if(cat==="video")return <video className="previewMedia" src={src} controls preload="metadata"/>;
    return <audio className="previewAudio" src={src} controls preload="metadata"/>;
  }
  if(text.loading)return <div className="previewPlaceholder">{tr("Loading the text…")}</div>;
  return <div className="previewText">{text.note&&<small>{text.note}</small>}{text.value&&<pre>{text.value}</pre>}</div>;
}

function PreviewDrawer({item,onClose,onAttach,attaching,onRemove,onRenamed}){
  const {ref,backdropProps}=useModal(onClose);
  const [full,setFull]=useState(false);
  return <div className="drawerBackdrop" {...backdropProps}>
    <aside className="previewDrawer" ref={ref} role="dialog" aria-modal="true" aria-label={tr("Preview: {name}",{name:item.name})} tabIndex={-1}>
      <div className="drawerHead"><div><FileName id={item.id} name={item.name} onRenamed={name=>onRenamed?.(item,name)}/><small>{kindLabel(mediaKind(item.mime,item.name),item.mime,item.name)} · {formatBytes(item.size)} · {shortDate(item.createdAt)}</small></div><button className="iconOnly" onClick={onClose} aria-label={tr("Close the preview")} title={tr("Close")}><X size={18}/></button></div>
      <div className="drawerBody"><PreviewBody item={item}/></div>
      <div className="drawerActions">
        {onAttach&&<button className="primary" onClick={()=>onAttach(item)} disabled={!!attaching}><MessageSquarePlus size={15}/> {attaching===item.id?tr("Preparing…"):tr("Use in chat")}</button>}
        {canView({mime:item.mime,name:item.name})&&<button className="secondary" onClick={()=>setFull(true)}><Maximize2 size={15}/> {tr("Open")}</button>}
        <button className="secondary" onClick={()=>downloadLibraryFile({libraryId:item.id,name:item.name}).catch(e=>toast(e.message))}><Download size={15}/> {tr("Download")}</button>
        <button className="dangerButton" onClick={()=>onRemove(item)}><Trash2 size={15}/> {tr("Delete")}</button>
      </div>
      {full&&<FileViewer file={{libraryId:item.id,name:item.name,mime:item.mime,size:item.size}} onClose={()=>setFull(false)}/>}
    </aside>
  </div>;
}

export function LibraryPage({onClose,onAttach,toAttachment,initialFilter="all",onOpenDesign}){
  useLanguage();
  const {can,deny}=useAccess();
  const [items,setItems]=useState([]),[designs,setDesigns]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  const [uploading,setUploading]=useState(0),[attaching,setAttaching]=useState(null),[filter,setFilter]=useState(initialFilter),[query,setQuery]=useState(""),[sort,setSort]=useState("new"),[preview,setPreview]=useState(null),[dragOver,setDragOver]=useState(false);
  const input=useRef(null),mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function load(){
    try{
      const [d,ds]=await Promise.all([api("/api/library"),api("/api/designs").catch(()=>({data:[]}))]);
      if(!mounted.current)return;
      setItems(d.data||[]);setDesigns(Array.isArray(ds.data)?ds.data:[]);setLoadError("");
    }catch(e){if(mounted.current)setLoadError(e.message)}
    finally{if(mounted.current)setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  const pending=items.some(x=>x.textStatus==="pending");
  useEffect(()=>{if(!pending)return;const t=setTimeout(load,4000);return()=>clearTimeout(t)},[pending,items]);
  const uploadLocked=!can("file_upload");
  async function upload(files){
    if(!files.length)return;
    if(uploadLocked){deny("file_upload");return;}
    setUploading(n=>n+files.length);
    const failed=[];
    for(const f of files){try{await uploadFileToLibrary(f)}catch(err){failed.push(`${f.name}: ${err.message}`)}finally{if(mounted.current)setUploading(n=>Math.max(0,n-1))}}
    if(failed.length)toast(tr("File upload: {error}",{error:failed.join(" · ")}));
    else toast(files.length===1?tr("The file was added to the Library."):tr("{n} files added to the Library.",{n:files.length}),"ok");
    if(mounted.current)await load();
  }
  async function remove(x){
    if(!confirm(tr("Delete «{name}» from the Library? It can no longer be downloaded from the conversations where it was used either.",{name:x.name})))return;
    try{await api(`/api/library/${x.id}`,{method:"DELETE"});if(mounted.current)setPreview(p=>p?.id===x.id?null:p);await load()}catch(e){toast(tr("Delete: {error}",{error:e.message}))}
  }
  async function attach(x){
    if(attaching||!onAttach)return;
    setAttaching(x.id);
    try{const a=await toAttachment(x);onAttach(a);onClose()}
    catch(e){toast(tr("Attach: {error}",{error:e.message}))}
    finally{if(mounted.current)setAttaching(null)}
  }
  const designEntries=designs.map(d=>({...d,isDesign:true,name:d.title||tr("Untitled design"),size:0,createdAt:d.updatedAt||d.createdAt}));
  const all=[...items,...designEntries];
  const q=query.trim().toLowerCase();
  const visible=all.filter(x=>(filter==="all"||libraryCategory(x)===filter)&&(!q||String(x.name||"").toLowerCase().includes(q)||(x.isDesign&&String(x.prompt||"").toLowerCase().includes(q))))
    .sort((a,b)=>sort==="name"?String(a.name).localeCompare(String(b.name),"ro",{sensitivity:"base"}):sort==="size"?Number(b.size||0)-Number(a.size||0):Number(b.createdAt||0)-Number(a.createdAt||0));
  const counts=Object.fromEntries(LIBRARY_FILTERS.map(([k])=>[k,k==="all"?all.length:all.filter(x=>libraryCategory(x)===k).length]));
  const dropProps={
    onDragOver:e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect=uploadLocked?"none":"copy";setDragOver(true)},
    onDragLeave:e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOver(false)},
    onDrop:e=>{if(!hasFiles(e))return;e.preventDefault();setDragOver(false);upload([...(e.dataTransfer.files||[])])}
  };
  const header=<><button className={cx("primary",uploadLocked&&"locked")} onClick={()=>uploadLocked?deny("file_upload"):input.current?.click()} title={uploadLocked?deniedMessage("file_upload"):tr("At most 2 GB per file")}><Upload size={16}/> {uploading?tr("Loading…"):tr("Add files")}</button><input ref={input} type="file" multiple hidden onChange={e=>{const f=[...(e.target.files||[])];e.target.value="";upload(f)}}/></>;
  return <ToolShell title={tr("Library")} subtitle={tr("Your files, pictures, videos and designs, ready to use in conversations.")} onClose={onClose} className="pageModal libraryPage" actions={header}>
    <div className="libraryToolbar">
      <div className="chipRow" role="tablist" aria-label={tr("Library filters")}>{LIBRARY_FILTERS.map(([k,label])=><button key={k} role="tab" aria-selected={filter===k} className={cx("filterChip",filter===k&&"active")} onClick={()=>setFilter(k)}>{tr(label)}{counts[k]>0&&<small>{counts[k]}</small>}</button>)}</div>
      <div className="libraryTools">
        <div className="pageSearch"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("Search by name")} aria-label={tr("Search the Library")}/></div>
        <label className="sortSelect"><span>{tr("Sort")}</span><select value={sort} onChange={e=>setSort(e.target.value)} aria-label={tr("Sort")}>{SORTS.map(([k,l])=><option key={k} value={k}>{tr(l)}</option>)}</select></label>
      </div>
    </div>
    <div className={cx("pageBody libraryBody",dragOver&&"dragOver")} {...dropProps}>
      {dragOver&&<div className="dropOverlay">{uploadLocked?deniedMessage("file_upload"):tr("Drop to add the files to the Library")}</div>}
      {loadError&&<div className="inlineError" role="alert">{loadError} <button className="linkBtn" onClick={()=>{setLoading(true);load()}}>{tr("Try again")}</button></div>}
      {uploading>0&&<div className="toolStatus" role="status">{uploading===1?tr("Uploading 1 file… big files can take a while."):tr("Uploading {n} files… big files can take a while.",{n:uploading})}</div>}
      {loading?<div className="emptyState"><HardDrive size={30}/>{tr("Loading the Library…")}</div>:!visible.length?<div className="emptyState"><HardDrive size={30}/>{all.length?tr("No file matches the filter."):<span>{tr("The Library is empty. Drag files here or press «Add files».")}</span>}</div>:
      <div className="libGrid">{visible.map(x=>{
        if(x.isDesign)return <div className="libCard design" key={"d"+x.id}>
          <button className="libThumb" onClick={()=>onOpenDesign?.(x.id)} aria-label={tr("Open the design {name}",{name:x.name})}><Thumb x={x}/></button>
          <div className="libInfo"><b title={x.name}>{x.name}</b><small>Design · {tr(DESIGN_KINDS[x.kind]||"Design")} · {(x.versionCount||1)===1?tr("1 version"):tr("{n} versions",{n:x.versionCount})} · {shortDate(x.createdAt)}</small></div>
          <div className="libActions"><button className="smallBtn" onClick={()=>onOpenDesign?.(x.id)}><Palette size={13}/> {tr("Open in Design")}</button></div>
        </div>;
        const status=libraryCategory(x)==="document"&&TEXT_STATUS[x.textStatus];
        return <div className="libCard" key={x.id}>
          <button className="libThumb" onClick={()=>setPreview(x)} aria-label={tr("Open the preview of {name}",{name:x.name})}><Thumb x={x}/></button>
          <div className="libInfo"><b title={x.name}>{x.name}</b><small>{kindLabel(mediaKind(x.mime,x.name),x.mime,x.name)} · {formatBytes(x.size)} · {shortDate(x.createdAt)}</small>{status&&<span className={cx("textStatus",status[1])}>{tr(status[0])}</span>}</div>
          <div className="libActions">
            {onAttach&&<button className="smallBtn" onClick={()=>attach(x)} disabled={!!attaching}>{attaching===x.id?tr("Preparing…"):tr("Use in chat")}</button>}
            <button className="iconOnly smallIcon" onClick={()=>setPreview(x)} aria-label={tr("Preview {name}",{name:x.name})} title={tr("Preview")}><Eye size={16}/></button>
            <button className="iconOnly smallIcon" onClick={()=>downloadLibraryFile({libraryId:x.id,name:x.name}).catch(e=>toast(e.message))} aria-label={tr("Download {name}",{name:x.name})} title={tr("Download")}><Download size={16}/></button>
            <button className="iconDanger" onClick={()=>remove(x)} aria-label={tr("Delete {name}",{name:x.name})} title={tr("Delete")}><Trash2 size={16}/></button>
          </div>
        </div>;
      })}</div>}
    </div>
    {preview&&<PreviewDrawer item={preview} onClose={()=>setPreview(null)} onAttach={onAttach?attach:null} attaching={attaching} onRemove={remove} onRenamed={(x,name)=>{setPreview(p=>p?.id===x.id?{...p,name}:p);setItems(list=>list.map(i=>i.id===x.id?{...i,name}:i))}}/>}
  </ToolShell>;
}
