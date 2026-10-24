import React, { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  Menu, Plus, Search, Folder, Bot, Settings, LogOut, Share2, MoreHorizontal,
  Paperclip, Mic, ArrowUp, Copy, ThumbsUp, ThumbsDown, RotateCcw, X,
  ChevronDown, User, Check, Wifi, Sparkles, SquarePen, Square,
  CalendarClock, Plug, Puzzle, Library, Brain, Upload, Trash2, Play, Pin, PinOff,
  FileText, Image as ImageIcon, HardDrive, ToggleLeft, ToggleRight,
  Compass, Map as MapIcon, Globe2, Archive, ArchiveRestore, ExternalLink, SlidersHorizontal, Volume2,
  PanelTopOpen, ShieldCheck, UserCheck, Download, Bell, Lock, Pencil, Palette, Clapperboard, Eye, Maximize2, LoaderCircle, SquareTerminal, Gauge,
  Mail, Sun, Moon, CreditCard, KeyRound, UserCircle, ChevronRight, ChevronLeft
} from "lucide-react";
import "@fontsource-variable/manrope";
import "@fontsource-variable/dm-sans";
import "./styles.css";
import { t as tr, LANGUAGES, getLanguage, setLanguage, useLanguage, languageProgress } from "./i18n.jsx";
import { useTheme, setTheme, resolvedTheme } from "./theme.js";
import {
  DEFAULT_GATEWAY, TOKEN_KEY, USER_KEY, PERMISSIONS_KEY, MODEL_CACHE_KEY, MODEL_SELECTED_KEY, MANUAL_MODEL_KEY, RESPONSE_MODE_KEY, GITHUB_BACKUP_KEY,
  FIRST_RUN_KEY, SIDEBAR_COLLAPSED_KEY, ACCOUNT_KEYS, storage, cleanGatewayUrl, GATEWAY, setGatewayUrl, toast, isAuthLost, apiError, authHeaders, api,
  deniedMessage, AccessContext, useAccess, uploadFileToLibrary, formatBytes, plural, cx, uid, writeClipboardText, openLink, downloadGeneratedFile,
  downloadLibraryFile, fmtTime, mediaKind, kindLabel, fetchLibraryBlob, modalStack, useModal, useDismiss, ToolShell, Modal, Markdown, useAuthedBlobUrl,
  isHttpUrl, setAuthLostHandler, IS_WEB, errorFromBody
} from "./core.jsx";
import { InstallApp } from "./install.jsx";
import { FileViewer, canView } from "./viewer.jsx";
import { ServerUpdate } from "./serverUpdate.jsx";
import { AccessRequestDialog, PhoneNotifications } from "./accessRequest.jsx";
import { ScheduledPage } from "./pages/Scheduled.jsx";
import { CodePage } from "./pages/Code.jsx";
import { requestedMediaGeneration } from "./mediaIntent.mjs";
import { detectSpeechLang, voiceFor, speakableText } from "./speechLang.mjs";
import { normalizeIntent, FILE_FORMATS, FORMAT_CANDIDATES, requestedDocumentFormat, editedDocumentFormat, answerFileFormat, asksForFile, fileTitleFor } from "./documentIntent.mjs";
import { ExtensionsPage } from "./pages/Extensions.jsx";
import { ToolRunCard, PendingApprovals } from "./pages/Connectors.jsx";
import { MemoryPage, PreferenceSwitches } from "./pages/Memory.jsx";
import { UsagePage, BillingPage, CreditsDialog } from "./pages/Usage.jsx";
import { useAccountSettings, ProfileTab, NotifyTab, PrivacyTab, SecurityTab, AccountAvatar } from "./pages/AccountSettings.jsx";
import { LibraryPage } from "./pages/Library.jsx";
import { DesignPage } from "./pages/Design.jsx";
import { splitQuestions, QuestionCard, QuestionsPending } from "./questions.jsx";
import { BRAND_NAME, BRAND_SHORT, BRAND_DOMAIN } from "./brand.js";
// 0.7.29: loaded only when the microphone is used.
const VoiceOrb=React.lazy(()=>import("./voiceOrb.jsx"));

let DICTATION_LANG = "ro";
const SPEECH_LOCALES = {ro:"ro-RO",en:"en-US",fr:"fr-FR"};
function speechLocale(){return SPEECH_LOCALES[DICTATION_LANG]||"ro-RO";}


class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){console.error(`${BRAND_NAME} renderer error`,error,info);}
  render(){
    if(this.state.error){
      return <div className="crashScreen">
        <div>
          <h1>{tr("{brand} ran into a problem",{brand:BRAND_NAME})}</h1>
          <p>{tr("The window could not show this part of the app. Press «Reload». If it happens again, copy the details below and send them to the app's administrator.")}</p>
          <pre>{String(this.state.error?.stack||this.state.error?.message||this.state.error)}</pre>
          <button className="primary" onClick={()=>location.reload()}>{tr("Reload {brand}",{brand:BRAND_NAME})}</button>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

function titleFrom(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > 48 ? `${s.slice(0,48)}…` : (s || tr("New chat"));
}
function messageText(m) {
  if (m?.displayText) return m.displayText;
  if (typeof m?.content === "string") return m.content || (m.attachmentOnly ? String(m.artifactSource||"") : "");
  if (Array.isArray(m?.content)) return m.content.filter(x => x?.type === "text").map(x => x.text).join("\n");
  return "";
}
function inferModelProvider(model,provider="") {
  const p=String(provider||"").toLowerCase();
  if(p)return p;
  const m=String(model||"").toLowerCase();
  const first=m.split("/")[0];
  // Subscription prefixes are shared (OmniRoute: gc/ is Gemini CLI and Grok Build): the model's name decides.
  if(/^(cx|codex|cc|claude-code|gc|gemini-cli|gh|kr|ag)$/.test(first)){
    if(/\bgrok/.test(m))return "xai";if(/claude/.test(m))return "anthropic";if(/gemini|gemma/.test(m))return "gemini";if(/codex|gpt/.test(m))return "openai";
  }
  const prefixMap={openai:"openai",anthropic:"anthropic",google:"gemini",gemini:"gemini",cerebras:"cerebras",groq:"groq",cloudflare:"cloudflare",openrouter:"openrouter",runway:"runway","@cf":"cloudflare",xai:"xai","x-ai":"xai",cx:"openai",codex:"openai",cc:"anthropic","claude-code":"anthropic",gc:"gemini","gemini-cli":"gemini"};
  if(prefixMap[first])return prefixMap[first];
  if(/groq/.test(m))return "groq";
  if(/cerebras/.test(m))return "cerebras";
  if(/cloudflare|@cf\//.test(m))return "cloudflare";
  if(/openrouter/.test(m))return "openrouter";
  if(/runway/.test(m))return "runway";
  if(/claude|anthropic/.test(m))return "anthropic";
  if(/gemini|google/.test(m))return "gemini";
  if(/openai|codex|\/o[134](?:\b|[-_.])/i.test(m)||(!/gpt[-_. ]?oss/.test(m)&&/gpt/.test(m)))return "openai";
  return "ai";
}
function providerLabel(provider,model="") {
  const p=inferModelProvider(model,provider);
  return ({openai:"OpenAI",anthropic:"Anthropic",gemini:"Google Gemini",cerebras:"Cerebras",groq:"Groq",xai:"Grok (xAI)",cloudflare:"Cloudflare AI",openrouter:"OpenRouter",runway:"Runway",ai:"AI"})[p]||String(provider||"AI");
}
function routeTaskLabel(task) {
  return ({
    coding:"Programming",reasoning:"Maths / logic",legal_analysis:"Legal analysis",
    long_context:"Document / long context",research:"Research",creative:"Creative",
    vision:"Picture / vision",fast:"Quick answer",general:"General",manual:"Model chosen by hand",
    "direct-fallback":"Automatic backup: direct API",direct:"Direct API chosen by hand",auto:"Main combination (automatic)",image_generation:"Picture generation",video_generation:"Video generation"
  })[task]||"General";
}
function RouteBadge({info}) {
  if(!info?.model)return null;
  const provider=providerLabel(info.provider,info.model);
  const served=info.servedBy?` → ${info.servedBy}`:"";
  return <div className="routeBadge" title={info.servedBy?tr("You chose {model}; {brand} sent the question to {served}.",{brand:BRAND_NAME,model:info.model,served:info.servedBy}):tr("{brand} used {provider} · {model}",{brand:BRAND_NAME,provider,model:info.model})}>
    <Sparkles size={12}/><span><b>{info.servedBy&&/\//.test(info.servedBy)?providerLabel("",info.servedBy):provider}</b><em>{info.model}{served}</em></span><small>{tr(routeTaskLabel(info.task))}</small>
    {info.skills?.length>0&&<small className="routeSkills" title={info.skills.map(x=>x.name).join(", ")}>{tr("Skills used")}: {info.skills.map(x=>`/${x.slug}`).join(", ")}</small>}
    {info.apps?.length>0&&<small className="routeSkills">{tr("Apps")}: {info.apps.join(", ")}</small>}
  </div>;
}
function friendlyError(raw){
  const msg=String(raw||tr("Unknown error.")).trim();
  let friendly="";
  if(/HTTP 429|rate.?limit|quota|too many requests/i.test(msg))friendly=tr("The AI provider's free limit was reached. Choose another model or try again later.");
  else if(/HTTP 40[13]\b|invalid.{0,12}api.?key|unauthorized|incorrect api key/i.test(msg))friendly=tr("The provider's API key is wrong or has no access to this model.");
  else if(/timeout|timed out|TimeoutError/i.test(msg))friendly=tr("The AI provider did not answer in time. Try again.");
  else if(/failed to fetch|networkerror|load failed/i.test(msg))friendly=tr("Cannot reach the {brand} service. Check that the app is running and the internet connection.",{brand:BRAND_NAME});
  else if(/^Niciun model selectat de .{1,40}? nu a putut răspunde/i.test(msg))friendly=tr("None of the configured AIs could answer now. Check the chosen model or the API keys.");
  if(!friendly)return msg;
  return `${friendly}\n\n_${tr("Technical details: {details}",{details:msg.slice(0,600)})}_`;
}

function safeFileTitle(value){return String(value||`${BRAND_NAME}`).replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,90)||`${BRAND_NAME}`;}

// The last file the AI made in this chat (its format), so "add a slide" or "translate it" changes that file (0.7.29).
function lastMadeFormat(messages){
  for(const m of [...(messages||[])].reverse()){
    if(m.role!=="assistant")continue;
    const f=(m.attachments||[]).find(a=>a?.source==="ai-export"||a?.format);
    if(f)return String(f.format||String(f.name||"").split(".").pop()||"").toLowerCase()||null;
  }
  return null;
}
// What file a message asks for: a new one ("make a PDF…") or a change to the attached / last made one.
function fileRequestFor(text,attachmentNames,messages){
  const made=requestedDocumentFormat(text);
  if(made)return {format:made,edit:false};
  const edited=editedDocumentFormat(text,attachmentNames,lastMadeFormat(messages));
  return edited?{format:edited,edit:true,source:attachmentNames.find(n=>String(n||"").toLowerCase().endsWith("."+edited))||""}:null;
}
function answerFormat(answerText,messages){
  const request=[...messages].reverse().find(m=>m.role==="user");
  const original=request?requestedDocumentFormat(messageText(request)):null;
  if(!original)return null;
  const t=normalizeIntent(answerText);
  const hit=FORMAT_CANDIDATES.find(([,re])=>re.test(t));
  return hit?hit[0]:/\bdocument\b/.test(t)?"docx":original;
}
function standaloneExportRequest(value){
  const t=normalizeIntent(value).replace(/[^a-z0-9.\s-]/g," ").replace(/\s+/g," ").trim();
  if(!requestedDocumentFormat(t))return false;
  if(/de mai sus|raspunsul|mesajul anterior|acesta|aceasta|asta|ultimul|tabelul|textul|lista|continutul|rezultatul|rezumatul|codul|conversatia/.test(t))return true;
  let stripped=t.replace(new RegExp("\\b("+FILE_FORMATS.join("|")+"|word|powerpoint|excel|prezentare|document|fisier|format|markdown|jupyter|notebook)\\b","g")," ");
  stripped=stripped.replace(/\b(trimite|da|dami|descarca|exporta|export|salveaza|creeaza|genereaza|fa|fami|in|ca|te|rog|mi|un|o|acum|si|imi|mie|format|fisier|fisierul|document|documentul)\b/g," ").replace(/[-.\s]+/g," ").trim();
  return !stripped;
}
function groupLabel(ts) {
  const d = new Date(ts || Date.now()), now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.floor((start - t) / 86400000);
  if (days <= 0) return tr("Today");
  if (days === 1) return tr("Yesterday");
  if (days <= 7) return tr("Previous 7 days");
  if (days <= 30) return tr("Previous 30 days");
  return tr("Older");
}
async function extractVideoFrames(blob,count=4) {
  if(typeof document==="undefined")return [];
  const url=URL.createObjectURL(blob),video=document.createElement("video");
  video.muted=true;video.preload="metadata";video.src=url;
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Video metadata timeout")),10000);
      video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};
      video.onerror=()=>{clearTimeout(timer);reject(new Error("Video invalid"))};
      video.load();
    });
    const duration=Number(video.duration||0);
    if(!Number.isFinite(duration)||duration<=0||!video.videoWidth||!video.videoHeight)return [];
    const fractions=count===1?[0.5]:[0.08,0.34,0.62,0.9].slice(0,count);
    const out=[];
    for(const fraction of fractions){
      const target=Math.max(0.01,Math.min(duration-0.01,duration*fraction));
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("Video seek timeout")),8000);
        const done=()=>{clearTimeout(timer);resolve()};
        video.onseeked=done;video.onerror=()=>{clearTimeout(timer);reject(new Error("Video seek error"))};
        video.currentTime=target;
      });
      const maxSide=768,scale=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
      const ctx=canvas.getContext("2d");ctx.drawImage(video,0,0,canvas.width,canvas.height);
      out.push({type:"image_url",image_url:{url:canvas.toDataURL("image/jpeg",0.72)}});
    }
    return out;
  } finally {URL.revokeObjectURL(url);video.removeAttribute("src");}
}
async function libraryItemToAttachment(item) {
  const d=(await api(`/api/library/${item.id}`)).data;
  if(!d?.id)throw new Error(tr("The file was not found in the Library."));
  const kind=mediaKind(d.mime,d.name)||d.kind;
  const base={name:d.name,mime:d.mime||"",size:d.size||0,libraryId:d.id};
  if(kind==="image"){
    if(/heic|heif/i.test(`${d.mime} ${d.name}`))return {...base,type:"stored",part:{type:"text",text:`Imagine atașată: ${d.name}. Formatul HEIC/HEIF nu este acceptat de modelele AI; salvează poza ca JPG sau PNG și atașeaz-o din nou.`}};
    if(Number(d.size||0)<=20*1024*1024)return {...base,type:"image",part:{type:"image_url",image_url:{url:`serasmart-library://${d.id}`}}};
    return {...base,type:"stored",part:{type:"text",text:`Imagine atașată: ${d.name} (${formatBytes(d.size)}). Depășește 20 MB, așa că AI-ul nu o poate analiza direct.`}};
  }
  if(kind==="text"&&Number(d.size||0)<=10*1024*1024){
    const text=(await (await fetchLibraryBlob(d.id)).text()).slice(0,250000);
    return {...base,type:"text",part:{type:"text",text:`Conținutul fișierului ${d.name}:\n${text}`}};
  }
  if(kind==="audio"||kind==="video"){
    let transcript="",transcriptionError="";
    if(Number(d.size||0)<=25*1024*1024){
      try{const tr=await api(`/api/library/${d.id}/transcribe`,{method:"POST",body:JSON.stringify({language:DICTATION_LANG})});transcript=String(tr.text||"").trim()}
      catch(e){transcriptionError=e.message}
    }else transcriptionError="Fișierul depășește 25 MB pentru transcriere automată.";
    let frames=[];
    if(kind==="video"&&Number(d.size||0)<=100*1024*1024){
      try{frames=await extractVideoFrames(await fetchLibraryBlob(d.id),4)}catch{}
    }
    const details=[
      `Fișier ${kind==="video"?"video":"audio"} atașat: ${d.name} (${formatBytes(d.size)}).`,
      transcript?`Transcriere audio:\n${transcript}`:"",
      kind==="video"&&frames.length?`${frames.length} cadre reprezentative din videoclip sunt atașate după această descriere.`:"",
      !transcript&&transcriptionError?`Transcriere indisponibilă: ${transcriptionError}`:""
    ].filter(Boolean).join("\n\n");
    return {...base,type:kind,transcript,part:{type:"text",text:details},transientParts:frames};
  }
  if(typeof d.text==="string"&&d.text.trim()){
    const limit=120000,body=d.text.length>limit?d.text.slice(0,limit)+"\n[… document trunchiat]":d.text;
    return {...base,type:"document",part:{type:"text",text:`Conținutul fișierului ${d.name}:\n${body}`}};
  }
  const why=d.textStatus==="pending"?"textul este încă în curs de citire; încearcă din nou în câteva secunde":d.textStatus==="empty"?"fișierul nu conține text citibil (de exemplu un PDF scanat)":"conținutul acestui tip de fișier nu poate fi citit automat";
  return {...base,type:"stored",part:{type:"text",text:`Fișier atașat: ${d.name} (${formatBytes(d.size)}). Este salvat în Biblioteca ${BRAND_NAME}, dar ${why}.`}};
}
function toProviderMessages(messages,extra={}){
  return (messages||[]).map(m=>{
    if(!m||!["user","assistant","system"].includes(m.role)||m.error||m.mediaGenerationError)return null;
    let content=m.content;
    if(m.role==="assistant"&&typeof content==="string"&&!content.trim()&&m.attachmentOnly)content=String(m.artifactSource||"");
    // 0.7.30: a file the AI made shows one line in the chat; the AI still sees the file's text, so it can change it later.
    if(m.role==="assistant"&&m.artifactSource&&(m.attachments||[]).some(x=>x?.source==="ai-export"||x?.format))content=`${String(m.content||"").split("\n")[0]}\n\n${String(m.artifactSource)}`;
    if(m.role==="assistant"&&m.mediaKind&&m.attachments?.length&&!String(content||"").trim())content=`Am generat ${m.mediaKind==="video"?"videoclipul":"imaginea"} „${m.attachments[0]?.name||"fișier"}”.`;
    const more=extra[m.id];
    if(more?.length)content=[...(Array.isArray(content)?content:(String(content||"").trim()?[{type:"text",text:String(content)}]:[])),...more];
    if(Array.isArray(content)){
      content=content.filter(p=>p&&((p.type==="text"&&String(p.text||"").trim())||(p.type==="image_url"&&p.image_url?.url))).map(p=>p.type==="text"?{type:"text",text:String(p.text)}:{type:"image_url",image_url:{url:p.image_url.url}});
      if(!content.length)return null;
    }else{
      content=String(content??"");
      if(!content.trim())return null;
    }
    return {role:m.role,content};
  }).filter(Boolean);
}

function cachedModels() {
  const v=storage.json(MODEL_CACHE_KEY,[]);
  return Array.isArray(v)?v.filter(x=>typeof x==="string"&&x):[];
}
function uniqueModels(values) {
  return [...new Set((values||[]).map(x=>String(x||"").trim()).filter(Boolean))];
}

// Sign-in calls answer with more than an error: "verify_email" asks for the code sent by email.
async function authPost(path,body){
  const r=await fetch(`${GATEWAY}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const text=await r.text();let data={};try{data=JSON.parse(text||"{}")}catch{}
  return {ok:r.ok,status:r.status,data,error:r.ok?"":errorFromBody(text,r.status)};
}
function AuthScreen({ onAuth, notice:initialNotice="" }) {
  useLanguage();
  const [code,setCode]=useState(""),[resendIn,setResendIn]=useState(0);
  useEffect(()=>{if(resendIn<=0)return;const t=setTimeout(()=>setResendIn(n=>n-1),1000);return()=>clearTimeout(t)},[resendIn]);
  const [mode,setMode]=useState("login"),[name,setName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(initialNotice),[busy,setBusy]=useState(false),[cloud,setCloud]=useState(null),[networkIssue,setNetworkIssue]=useState(false);
  useEffect(()=>{setNotice(initialNotice)},[initialNotice]);
  useEffect(()=>{
    let active=true;
    fetch(`${GATEWAY}/health`).then(r=>r.json()).then(h=>{if(active)setCloud(!!h.cloudConfigured)}).catch(()=>{if(active)setCloud(null)});
    return()=>{active=false};
  },[]);
  async function submit(e) {
    e.preventDefault(); if(busy)return; setBusy(true); setError(""); setNotice(""); setNetworkIssue(false);
    try {
      if(mode==="verify"){
        const v=await authPost("/auth/verify-email",{email,code:code.trim()});
        if(!v.ok)throw new Error(v.error);
        setNotice(v.data?.token?tr("Email confirmed."):tr("Email confirmed. Your access is waiting for the Owner's approval."));setMode("login");setCode("");setPassword("");return;
      }
      const r = await authPost(mode==="login"?"/auth/login":"/auth/register",mode==="login"?{email,password}:{name,email,password});
      if(r.data?.status==="verify_email"){
        setMode("verify");setCode("");setNotice(r.ok?tr("We sent you a code by email."):tr("First confirm your email with the code you got. If you cannot find it, look in Spam or ask for a new one."));if(r.ok)setResendIn(60);return;
      }
      if(!r.ok)throw new Error(r.error);
      const data=r.data;
      if(data?.status==="pending"&&!data?.token){
        setNotice(tr("The account was created and is waiting for the Owner's approval."));
        setMode("login"); setPassword(""); return;
      }
      if(!data?.token||!data?.user) throw new Error(tr("The server did not return a valid session."));
      storage.set(TOKEN_KEY,data.token); storage.set(USER_KEY,JSON.stringify(data.user)); storage.set(PERMISSIONS_KEY,JSON.stringify(data.permissions||{}));
      onAuth(data.user,data.permissions||{});
    } catch(e2){ setError(e2.message); if(/failed to fetch|networkerror|load failed/i.test(e2.message))setNetworkIssue(true); } finally { setBusy(false); }
  }
  async function resendCode(){
    if(busy||resendIn>0)return;setBusy(true);setError("");
    try{const r=await authPost("/auth/resend-code",{email});if(!r.ok)throw new Error(r.error);setNotice(tr("We sent you a new code."));setResendIn(60)}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function resetGateway(){setGatewayUrl(DEFAULT_GATEWAY);Promise.resolve(window.Serasmart?.setConfig?.({gatewayUrl:DEFAULT_GATEWAY})).catch(()=>{});setNetworkIssue(false);setError("");setNotice(tr("Back to the default local service. Try signing in again."));}
  return <div className="authShell"><div className="authGlow"/><div className="authTopTools"><ThemeSwitch/><LanguageMenu/></div>
    <div className="authBrand"><img src="./serasmart-ai-768.webp" alt={`${BRAND_NAME}`}/><h1>{BRAND_NAME}</h1><p>{tr("Your AI, every model")}</p>
      <div className="authFeature"><Sparkles size={17}/> {tr("Chat with every top AI, memory, files, pictures, video and automations.")}</div>
      <div className="authFeature"><Wifi size={17}/> {tr("Your apps connected: the AI reads and works in them with your approval.")}</div>
      <div className="authFeature"><User size={17}/> {tr("A personal account, confirmed by email and protected by your password.")}</div>
    </div>
    <form className="authCard" onSubmit={submit}>
      <div className="authTabs" role="tablist"><button type="button" role="tab" aria-selected={mode==="login"} className={mode==="login"?"active":""} onClick={()=>{setMode("login");setError("");}}>{tr("Sign in")}</button><button type="button" role="tab" aria-selected={mode==="register"} className={mode==="register"?"active":""} onClick={()=>{setMode("register");setError("");setNotice("");}}>{tr("Create account")}</button></div>
      {mode==="verify"?<>
      <h2>{tr("Confirm your email")}</h2>
      <p className="muted">{tr("We sent a 6-digit code to {email}. If you do not see it, look in Spam. The code expires in 15 minutes.",{email})}</p>
      <label>{tr("Code from the email")}<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="codeInput"/></label>
      {notice&&<div className="authNotice" role="status"><UserCheck size={17}/><span>{notice}</span></div>}
      {error&&<div className="authError" role="alert">{tr(error)}</div>}
      <button className="primaryWide" disabled={busy||code.length!==6}>{busy?tr("Working…"):tr("Confirm email")}</button>
      <div className="codeActions"><button type="button" className="linkBtn" disabled={busy||resendIn>0} onClick={resendCode}>{resendIn>0?tr("Send the code again ({s}s)",{s:resendIn}):tr("Send the code again")}</button><button type="button" className="linkBtn" onClick={()=>{setMode("login");setError("");setNotice("")}}>{tr("Back")}</button></div>
      </>:<>
      <h2>{mode==="login"?tr("Welcome back"):tr("Create your {brand} account",{brand:BRAND_NAME})}</h2>
      <p className="muted">{mode==="register"?(cloud?tr("You get a code by email to confirm the address, then the Owner approves the account."):IS_WEB?tr("The account is created on the {brand} server.",{brand:BRAND_NAME}):tr("The account is created on this computer and you can use it right away.")):tr("Use the email of your {brand} account.",{brand:BRAND_NAME})}</p>
      {mode==="register"&&<label>{tr("Name")}<input value={name} onChange={e=>setName(e.target.value)} placeholder={tr("Your name")} autoComplete="name"/></label>}
      <label>{tr("Email")}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" required autoComplete="email"/></label>
      <label>{tr("Password")}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==="register"?tr("At least 10 characters"):tr("Your account password")} required minLength={mode==="register"?10:undefined} autoComplete={mode==="register"?"new-password":"current-password"}/></label>
      {notice&&<div className="authNotice" role="status"><UserCheck size={17}/><span>{notice}</span></div>}
      {error&&<div className="authError" role="alert">{tr(error)}</div>}
      {networkIssue&&GATEWAY!==DEFAULT_GATEWAY&&<button type="button" className="secondary wideBtn" onClick={resetGateway}>{tr("Use the default local service")}</button>}
      <button className="primaryWide" disabled={busy}>{busy?tr("Working…"):mode==="login"?tr("Sign in to {brand}",{brand:BRAND_NAME}):(cloud?tr("Send the access request"):tr("Create the account"))}</button>
      <div className="localNote">{cloud?tr("The Owner approves accounts and decides which AI services they can use."):IS_WEB?tr("Accounts and chats are kept on the {brand} server.",{brand:BRAND_NAME}):tr("Accounts and chats are kept on this computer.")}</div>
      </>}
      <InstallApp/>
    </form>
  </div>;
}

function localZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch{return ""}}
// 0.7.30: only the S (no name), turning slowly; faster while the AI answers (html[data-thinking]); still with «reduce motion».
function BrandMark({small=false}) { return <div className={cx("brandMark brandS",small&&"small")}><img src="./serasmart-s.webp" alt={`${BRAND_NAME}`} draggable="false"/></div>; }

// 0.7.26: the order of the approved mockup; labels in English, shown through tr().
const TOOL_ITEMS=[["explore",Compass,"Explore",null],["library",Library,"Library",null],["extensions",Puzzle,"Extensions",null],["automations",CalendarClock,"Automations","automations"],["design",Palette,"Design","document_generation"],["memory",Brain,"Memory",null],["code",SquareTerminal,"Code","code"],["billing",CreditCard,"Billing",null]];
// The plan's week under the menu (only when plans and credits are on and the account pays): opens Usage.
function SideUsage({onOpen}) {
  const [d,setD]=useState(null);
  useEffect(()=>{let live=true;const load=()=>api("/api/credits?peek=1").then(x=>{if(live)setD(x)}).catch(()=>{});load();window.addEventListener("focus",load);return()=>{live=false;window.removeEventListener("focus",load)}},[]);
  if(!d?.enabled||d.unlimited||!d.week)return null;
  const p=Math.max(0,Math.min(100,Number(d.week.percent)||0));
  return <button className="sideUsage" onClick={onOpen} aria-label={tr("{plan} plan: {percent}% of this week used",{plan:d.plan?.name||"",percent:p})}>
    <span className="sideUsageHead"><span>{d.plan?.name} · {tr("this week")}</span><b>{p}%</b></span>
    <span className="sideUsageBar"><span style={{width:`${p}%`}}/></span>
  </button>;
}
function Sidebar({open,setOpen,user,search,setSearch,projects,assistants,conversations,currentId,busyIds,onSelect,onDeleteConversation,onUnarchive,onNew,selectedProject,setSelectedProject,activeAssistantId,onUseAssistant,onNewProject,onNewAssistant,onEditProject,onEditAssistant,onTool,onSettings,onLogout}) {
  const {can,isOwner}=useAccess();
  const [showArchived,setShowArchived]=useState(false);
  const searchQuery=String(search||"").trim().toLowerCase();
  const archived=useMemo(()=>conversations.filter(c=>c.archived),[conversations]);
  const searchResults=useMemo(()=>{
    if(!searchQuery)return [];
    return conversations.map(c=>{
      const title=String(c.title||tr("Chat"));
      const titleHit=title.toLowerCase().includes(searchQuery);
      let snippet="",matchedAt=0;
      for(const m of c.messages||[]){
        const text=messageText(m);
        const idx=text.toLowerCase().indexOf(searchQuery);
        if(idx>=0){
          matchedAt=Number(m.createdAt||c.updatedAt||0);
          const from=Math.max(0,idx-70),to=Math.min(text.length,idx+searchQuery.length+110);
          snippet=(from>0?"…":"")+text.slice(from,to).replace(/\s+/g," ").trim()+(to<text.length?"…":"");
          break;
        }
      }
      if(!titleHit&&!snippet)return null;
      return {conversation:c,snippet,matchedAt};
    }).filter(Boolean).sort((a,b)=>(b.matchedAt||b.conversation.updatedAt||0)-(a.matchedAt||a.conversation.updatedAt||0));
  },[conversations,searchQuery]);
  const groups=useMemo(()=>{
    const out={};
    conversations.filter(c=>!c.archived&&(!selectedProject||c.projectId===selectedProject)).forEach(c=>{const g=groupLabel(c.updatedAt);(out[g]||=[]).push(c)});
    return Object.entries(out);
  },[conversations,selectedProject]);
  const anyVisible=conversations.some(c=>!c.archived);
  const busySet=new Set(busyIds||[]);
  useLanguage();
  const brandWords=BRAND_NAME.split(" "),brandLast=brandWords.length>1?brandWords.pop():"";
  return <aside className={cx("sidebar",open&&"open")} aria-label={tr("Navigation")}>
    <div className="sideTop"><div className="brandLine"><BrandMark small/><div><b className="wordmark">{brandWords.join(" ").toUpperCase()}{brandLast&&<> <em>{brandLast.toUpperCase()}</em></>}</b><span>{tr("Your AI, every model")}</span></div></div><button className="iconOnly mobileClose" onClick={()=>setOpen(false)} aria-label={tr("Close the menu")} title={tr("Close the menu")}><X size={20}/></button></div>
    <button className="newChat" onClick={onNew}><SquarePen size={17}/> {tr("New chat")}</button>
    <div className="searchBox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Escape"&&search){e.preventDefault();setSearch("")}}} placeholder={tr("Search chats")} aria-label={tr("Search chats")}/>{search&&<button className="searchClear" onClick={()=>setSearch("")} title={tr("Clear the search")} aria-label={tr("Clear the search")}><X size={14}/></button>}</div>
    <div className="sideScroll">
      <nav className="sideSection sideTools" aria-label={tr("Tools")}>
        {TOOL_ITEMS.filter(([name])=>name!=="code"||can("code")).map(([name,Icon,label,perm])=>{const locked=perm&&!can(perm);return <button key={name} className={cx("sideItem",name==="explore"?"exploreItem":"toolItem",locked&&"locked")} onClick={()=>onTool(name)} title={locked?deniedMessage(perm):tr(label)}><Icon size={17}/> {tr(label)}{locked&&<Lock size={13} className="lockIcon"/>}</button>})}
        {isOwner&&<button className="sideItem ownerItem" onClick={()=>onTool("admin")}><ShieldCheck size={17}/> Control Center</button>}
      </nav>
      <div className="sideSection"><div className="sectionHead"><span>{tr("Projects")}</span><button onClick={onNewProject} aria-label={tr("New project")} title={tr("New project")}><Plus size={15}/></button></div>
        <button className={cx("sideItem",selectedProject===null&&"active")} onClick={()=>setSelectedProject(null)}><Folder size={16}/> {tr("All chats")}</button>
        {projects.map(p=><div key={p.id} className={cx("sideRow",selectedProject===p.id&&"active")}><button className={cx("sideItem",selectedProject===p.id&&"active")} onClick={()=>setSelectedProject(p.id)} title={p.name}><Folder size={16}/><span className="sideLabel">{p.name}</span></button><button className="sideEdit" onClick={()=>onEditProject(p)} aria-label={tr("Edit the project {name}",{name:p.name})} title={tr("Edit the project")}><Pencil size={13}/></button></div>)}
      </div>
      <div className="sideSection"><div className="sectionHead"><span>{tr("Assistants")}</span><button onClick={onNewAssistant} aria-label={tr("New assistant")} title={tr("New assistant")}><Plus size={15}/></button></div>
        {assistants.map(a=><div key={a.id} className={cx("sideRow",activeAssistantId===a.id&&"active")}><button className={cx("sideItem",activeAssistantId===a.id&&"active")} onClick={()=>onUseAssistant(a.id)} title={tr("New chat with {name}",{name:a.name})}><Bot size={16}/><span className="sideLabel">{a.name}</span></button>{!a.builtIn&&<button className="sideEdit" onClick={()=>onEditAssistant(a)} aria-label={tr("Edit the assistant {name}",{name:a.name})} title={tr("Edit the assistant")}><Pencil size={13}/></button>}</div>)}
        {!assistants.length&&<div className="sideEmpty">{tr("No custom assistants yet.")}</div>}
      </div>
      <div className="sideSection historySection">
        <div className="sectionHead"><span>{searchQuery?tr("Search results"):tr("Chats")}</span>{searchQuery&&<small>{searchResults.length}</small>}</div>
        {searchQuery?<>
          {currentId&&<button className="currentConversationReturn" onClick={()=>{onSelect(currentId);setSearch("")}}><RotateCcw size={15}/><span><b>{tr("Current chat")}</b><small>{tr("Go back to the chat you were in")}</small></span></button>}
          <div className="conversationSearchResults">
            {searchResults.map(({conversation:c,snippet})=><button key={c.id} className={cx("conversationSearchResult",currentId===c.id&&"current")} onClick={()=>{onSelect(c.id);setSearch("")}}>
              <div className="conversationSearchHead"><b>{c.title||tr("Chat")}</b>{currentId===c.id?<span>{tr("Current")}</span>:c.archived?<span>{tr("Archived")}</span>:null}</div>
              {snippet&&<p>{snippet}</p>}
              <small><Search size={12}/> {tr("Open the chat")}</small>
            </button>)}
            {!searchResults.length&&<div className="searchNoResults"><Search size={18}/><span>{tr("This text is not in your chats.")}</span></div>}
          </div>
        </>:<>
          {groups.map(([g,items])=><div key={g} className="historyGroup"><div className="historyLabel">{g}</div>{items.map(c=><div className={cx("historyRow",currentId===c.id&&"active")} key={c.id}><button className="historyItem" onClick={()=>onSelect(c.id)} title={c.title}>{busySet.has(c.id)&&<span className="historyBusy" aria-label={tr("Answer in progress")}/>}{c.title||tr("Chat")}</button><button className="historyDelete" title={tr("Delete the chat")} aria-label={tr("Delete the chat {name}",{name:c.title||""})} onClick={e=>{e.stopPropagation();onDeleteConversation(c.id)}}><Trash2 size={14}/></button></div>)}</div>)}
          {!groups.length&&<div className="sideEmpty">{selectedProject?tr("No chats in this project yet. Write a message to start one."):anyVisible?tr("No chats to show."):tr("No chats yet.")}</div>}
          {archived.length>0&&<div className="archivedBlock">
            <button className="archivedToggle" onClick={()=>setShowArchived(v=>!v)} aria-expanded={showArchived}><Archive size={14}/> {tr("Archived")} ({archived.length}) <ChevronDown size={14} className={showArchived?"open":""}/></button>
            {showArchived&&archived.map(c=><div className={cx("historyRow archivedRow",currentId===c.id&&"active")} key={c.id}><button className="historyItem" onClick={()=>onSelect(c.id)} title={c.title}>{c.title||tr("Chat")}</button><button className="historyDelete" title={tr("Restore the chat")} aria-label={tr("Restore the chat {name}",{name:c.title||""})} onClick={e=>{e.stopPropagation();onUnarchive(c.id)}}><ArchiveRestore size={14}/></button></div>)}
          </div>}
        </>}
      </div>
    </div>
    <div className="accountArea">
      <SideUsage onOpen={()=>onTool("usage")}/>
      <div className="accountBadge"><AccountAvatar user={user}/><div className="accountText"><b>{user?.name||tr("{brand} account",{brand:BRAND_SHORT})}</b><span>{user?.email}{user?.role==="owner"?" · Owner":""}</span></div>
        <div className="accountButtons"><button onClick={onSettings} aria-label={tr("Settings")} title={tr("Settings")}><Settings size={17}/></button><button onClick={onLogout} aria-label={tr("Sign out")} title={tr("Sign out")}><LogOut size={17}/></button></div></div>
    </div>
  </aside>;
}

const MODEL_PROVIDERS=[["cerebras","Cerebras"],["groq","Groq"],["gemini","Gemini"],["mistral","Mistral"],["nvidia","NVIDIA"],["github","GitHub Models"],["openrouter","OpenRouter"],["cloudflare","Cloudflare Workers AI"],["cohere","Cohere"],["huggingface","Hugging Face"],["openai","OpenAI"]];
// Combinations (names without "provider/") first, then one group per direct provider, then the rest of OmniRoute.
const COMBO_CACHE_KEY="serasmartComboModelsV1";
let COMBO_IDS=new Set(storage.json(COMBO_CACHE_KEY,[])||[]);
function groupModels(list){
  const groups=new Map();
  const add=(key,name,x,opts)=>{if(!groups.has(key))groups.set(key,{name,items:[],...opts});groups.get(key).items.push(x)};
  for(const x of list){
    const id=String(x||"");
    if(COMBO_IDS.has(id)||!id.includes("/")){add("combo","Combinations",id,{combo:true,short:v=>v});continue;}
    const prefix=id.split("/")[0].toLowerCase(),known=MODEL_PROVIDERS.find(([k])=>k===prefix);
    if(known)add(known[0],known[1],id,{short:v=>v.slice(prefix.length+1)});
    else add("omni","Other models",id,{short:v=>v});
  }
  // Your own combinations ("Ai principal" …) before OmniRoute's automatic auto/* ones.
  const combo=groups.get("combo");
  if(combo)combo.items=[...combo.items.filter(v=>!/^auto\//i.test(v)),...combo.items.filter(v=>/^auto\//i.test(v))];
  const order=["combo",...MODEL_PROVIDERS.map(([k])=>k),"omni"];
  return order.filter(k=>groups.has(k)).map(k=>groups.get(k));
}
function ModelPicker({model,onSelect,models,onRefresh,refreshing,policyEnforced,deniedCount=0,locked=[]}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState("");
  const ref=useRef(null),listRef=useRef(null);
  useDismiss(open,()=>setOpen(false),ref);
  useEffect(()=>{if(!open)setQuery("")},[open]);
  useEffect(()=>{if(open)setTimeout(()=>{const el=ref.current?.querySelector(".modelSearch input")||listRef.current?.querySelector(".modelOption.active")||listRef.current?.querySelector(".modelOption");el?.focus()},0)},[open]);
  const list=policyEnforced?uniqueModels(models):uniqueModels([model,...models]);
  // The models the Owner does not allow this account: listed too, locked; choosing one only says why.
  const lockedMap=new Map((locked||[]).filter(x=>x&&x.id&&!list.includes(x.id)).map(x=>[String(x.id),String(x.reason||"")]));
  const all=[...list,...lockedMap.keys()];
  const filtered=all.filter(x=>!query||x.toLowerCase().includes(query.toLowerCase()));
  const notAllowed=x=>toast(tr("«{model}» is not allowed for you by the Owner.",{model:x})+(lockedMap.get(x)?" "+lockedMap.get(x):"")+" "+tr("Ask for access or pick another model."));
  function onListKey(e){
    if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
    const items=[...(listRef.current?.querySelectorAll(".modelOption")||[])];if(!items.length)return;
    e.preventDefault();const i=items.indexOf(document.activeElement);
    const next=e.key==="ArrowDown"?items[Math.min(items.length-1,i+1)]:items[Math.max(0,i-1)];next?.focus();
  }
  return <div className="modelSelectCluster" ref={ref}>
    <div className="modelPicker">
      <button className={cx("modelPickerButton",open&&"open")} onClick={()=>setOpen(v=>!v)} aria-haspopup="listbox" aria-expanded={open} aria-label={tr("AI model: {model}",{model:model||tr("none")})}>
        <span className="modelPickerDot"/>
        <span className="modelPickerText"><b>{model||tr("Choose an AI")}</b><small>{list.length?tr(list.length===1?"{n} model available":"{n} models available",{n:list.length}):tr("No model available")}{lockedMap.size?" · "+tr("{n} not allowed",{n:lockedMap.size}):policyEnforced?" · "+tr("set by the Owner"):""}</small></span>
        <ChevronDown size={15}/>
      </button>
    {open&&<div className="modelPickerMenu" onKeyDown={onListKey}>
      <div className="modelPickerHead"><div><b>{tr("Choose the AI")}</b><span>{tr("The change applies to this chat.")}</span></div><button className="modelRefresh" onClick={async e=>{e.stopPropagation();await onRefresh?.()}} disabled={refreshing} title={tr("Refresh the list of models")} aria-label={tr("Refresh the list of models")}><RotateCcw size={14} className={refreshing?"spin":""}/></button></div>
      {all.length>7&&<div className="modelSearch"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("Search models")} aria-label={tr("Search models")}/></div>}
      <div className="modelPickerList" role="listbox" ref={listRef}>
        {groupModels(filtered).map(g=><div className="modelGroup" key={g.name} role="group" aria-label={tr(g.name)}>
          <div className="modelGroupName">{tr(g.name)}</div>
          {g.items.map(x=>lockedMap.has(x)?<button key={x} className="modelOption locked" onClick={()=>notAllowed(x)} role="option" aria-selected={false} aria-disabled="true" title={lockedMap.get(x)||tr("Not allowed by the Owner")}>
            <span className="modelOptionIcon"><Lock size={15}/></span>
            <span className="modelOptionCopy"><b>{g.short(x)}</b><small>{tr("Not allowed by the Owner")}</small></span>
          </button>:<button key={x} className={cx("modelOption",x===model&&"active")} onClick={()=>{onSelect(x);setOpen(false)}} role="option" aria-selected={x===model}>
            <span className="modelOptionIcon"><Sparkles size={15}/></span>
            <span className="modelOptionCopy"><b>{g.short(x)}</b><small>{x===model?tr("Selected"):g.combo?tr("Combination"):tr("Use this AI")}</small></span>
            {x===model&&<Check size={16}/>}
          </button>)}
        </div>)}
        {!all.length&&<div className="modelEmpty">{tr("No models available.")} {policyEnforced?tr("Ask the Owner for access to at least one model."):IS_WEB?tr("The server's Owner has to add an AI key."):tr("Start OmniRoute or add an API key in Settings.")}</div>}
        {all.length>0&&!filtered.length&&<div className="modelEmpty">{tr("No model matches.")}</div>}
      </div>
      <div className="modelPickerFoot">{refreshing?tr("Refreshing the list…"):policyEnforced||lockedMap.size?tr("The Owner decides which models your account can use.")+(lockedMap.size?" "+tr("The locked ones are not allowed for you."):deniedCount>0?" "+tr("{n} models are hidden by the Owner.",{n:deniedCount}):""):(IS_WEB?tr("The models come from OmniRoute and the APIs set up on the server."):tr("The models come from OmniRoute and the APIs set up on this PC."))}</div>
    </div>}
    </div>
  </div>;
}

// Dark / light (0.7.26), stored on this device.
function ThemeSwitch() {
  useTheme();useLanguage();
  const now=resolvedTheme();
  return <div className="themeSwitch" role="group" aria-label={tr("Theme")}>
    <button aria-pressed={now==="dark"} className={cx(now==="dark"&&"on")} onClick={()=>setTheme("dark")} title={tr("Dark")}><Moon size={15}/><span>{tr("Dark")}</span></button>
    <button aria-pressed={now==="light"} className={cx(now==="light"&&"on")} onClick={()=>setTheme("light")} title={tr("Light")}><Sun size={15}/><span>{tr("Light")}</span></button>
  </div>;
}
// The interface language (0.7.26): English by default, 24 languages, stored on this device.
function LanguageMenu() {
  const lang=useLanguage();
  const [open,setOpen]=useState(false),[q,setQ]=useState("");
  const ref=useRef(null);
  useDismiss(open,()=>setOpen(false),ref);
  useEffect(()=>{if(!open)setQ("")},[open]);
  const name=(LANGUAGES.find(([c])=>c===lang)||LANGUAGES[0])[1];
  const shown=LANGUAGES.filter(([c,n])=>!q||n.toLowerCase().includes(q.toLowerCase())||c.includes(q.toLowerCase()));
  // 0.7.35: while the server translates the whole app into the chosen language, the button shows how far it is.
  const p=languageProgress(lang),pct=p&&p.total?Math.min(100,Math.floor(p.have*100/p.total)):100,translating=lang!=="en"&&p&&pct<100;
  return <div className="langWrap" ref={ref}>
    <button className={cx("langButton",open&&"open")} onClick={()=>setOpen(v=>!v)} aria-haspopup="menu" aria-expanded={open} aria-label={tr("Language: {name}",{name})} title={tr("Language")}><Globe2 size={16}/><span>{name}</span>{translating&&<small className="langProgress" title={tr("Translating the app into {name}… {pct}%",{name,pct})}>{pct}%</small>}<ChevronDown size={14}/></button>
    {open&&<div className="langMenu" role="menu" aria-label={tr("Language")}>
      <label className="langSearch"><Search size={14}/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder={tr("Search {n} languages",{n:LANGUAGES.length})} aria-label={tr("Search languages")}/></label>
      {translating&&<p className="langNote" role="status">{tr("Translating the app into {name}… {pct}%. The texts change on their own as they are ready.",{name,pct})}</p>}
      <div className="langGrid">{shown.map(([c,n])=><button key={c} role="menuitemradio" aria-checked={c===lang} lang={c} className={cx(c===lang&&"on")} onClick={()=>{setLanguage(c);setOpen(false)}}><span>{n}</span>{c===lang&&<Check size={14}/>}</button>)}</div>
    </div>}
  </div>;
}
function Header({deniedCount,lockedModels=[],onMenu,model,onSelectModel,models,onRefreshModels,refreshingModels,policyEnforced,omni,showOmni,onShare,current,projects,onDetach,onMoveProject,onFiles,onGitHub,onGitHubRollback,hasGitHubBackup,onArchive,onUnarchive,onDelete}) {
  const {isOwner}=useAccess();
  const [more,setMore]=useState(false),[moveOpen,setMoveOpen]=useState(false);
  const moreRef=useRef(null);
  useDismiss(more,()=>{setMore(false);setMoveOpen(false)},moreRef);
  const close=()=>{setMore(false);setMoveOpen(false)};
  useLanguage();
  return <header className="topbar">
    <button className="iconOnly menuBtn" onClick={onMenu} aria-label={tr("Show or hide the menu")} title={tr("Menu")}><Menu size={20}/></button>
    <ModelPicker model={model} onSelect={onSelectModel} models={models} onRefresh={onRefreshModels} refreshing={refreshingModels} policyEnforced={policyEnforced} deniedCount={deniedCount} locked={lockedModels}/>
    <div className="topSpacer"/>
    {showOmni&&(()=>{
      // 0.7.29: only a dot, green when the AI service answers and red when not.
      const label=omni===true?tr("OmniRoute connected"):omni==="key"?tr("OmniRoute needs an API key"):omni==="offline"?tr("Can't reach the server, reconnecting…"):tr("OmniRoute stopped");
      // 0.7.30: no text on screen, not even on hover (the Owner's choice); screen readers still hear it.
      return <span className={cx("statusDot",omni===true?"ok":"bad")} role="status" aria-label={label}/>;
    })()}
    <ThemeSwitch/>
    <LanguageMenu/>
    <button className="topAction" onClick={onShare} disabled={!current} title={tr("Copy the chat to the clipboard")}><Share2 size={16}/> <span>{tr("Copy chat")}</span></button>
    <div className="moreWrap" ref={moreRef}>
      <button className="iconOnly" onClick={()=>{setMore(v=>!v);setMoveOpen(false)}} aria-label={tr("Chat options")} title={tr("Chat options")} aria-haspopup="menu" aria-expanded={more}><MoreHorizontal size={20}/></button>
      {more&&<div className="conversationMenu" role="menu">
        <button role="menuitem" disabled={!current?.projectId} onClick={()=>{onDetach();close()}}><PanelTopOpen size={18}/> {tr("Remove from project")}</button>
        <div className="menuSubWrap">
          <button role="menuitem" disabled={!current} onClick={()=>setMoveOpen(v=>!v)} aria-expanded={moveOpen}><Folder size={18}/> {tr("Move to project")} <span className="menuChevron">›</span></button>
          {moveOpen&&<div className="projectSubmenu">
            <button onClick={()=>{onMoveProject(null);close()}}>{tr("No project")}</button>
            {projects.map(p=><button key={p.id} onClick={()=>{onMoveProject(p.id);close()}}>{p.name}</button>)}
            {!projects.length&&<span className="menuNote">{tr("No projects yet. Create one from the side menu.")}</span>}
          </div>}
        </div>
        <div className="menuDivider"/>
        <button role="menuitem" disabled={!current} onClick={()=>{onFiles();close()}}><Library size={18}/> {tr("Files in this chat")}</button>
        {isOwner&&<button role="menuitem" onClick={()=>{onGitHub();close()}}><Globe2 size={18}/> GitHub Solve</button>}
        {isOwner&&hasGitHubBackup&&<button role="menuitem" onClick={()=>{onGitHubRollback();close()}}><RotateCcw size={18}/> {tr("Undo the last GitHub change")}</button>}
        <div className="menuDivider"/>
        {current?.archived
          ?<button role="menuitem" onClick={()=>{onUnarchive();close()}}><ArchiveRestore size={18}/> {tr("Restore from archive")}</button>
          :<button role="menuitem" disabled={!current} onClick={()=>{onArchive();close()}}><Archive size={18}/> {tr("Archive")}</button>}
        <button role="menuitem" className="dangerMenuItem" disabled={!current} onClick={()=>{onDelete();close()}}><Trash2 size={18}/> {tr("Delete")}</button>
      </div>}
    </div>
  </header>;
}

function CopyMessageButton({message,className=""}) {
  const [copied,setCopied]=useState(false),timer=useRef(null);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  async function copy(){
    const ok=await writeClipboardText(messageText(message));
    if(!ok){toast(tr("The text could not be copied to the clipboard."));return;}
    setCopied(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),1200);
  }
  return <button className={className} onClick={copy} title={copied?tr("Copied"):tr("Copy the message")} aria-label={tr("Copy the message")}>{copied?<Check size={15}/>:<Copy size={15}/>}</button>;
}

// 0.7.33: the Download (PDF / Word / PowerPoint) button under each answer was removed at the Owner's request;
// files are asked for in the chat ("make it a Word file") and come as a real file card.
function MessageActions({message,title,disabled,onRegenerate,onRate}) {
  const [speaking,setSpeaking]=useState(false);
  const speakingRef=useRef(false);
  useEffect(()=>()=>{if(speakingRef.current){try{window.speechSynthesis.cancel()}catch{}}},[]);
  function stopSpeaking(){speakingRef.current=false;setSpeaking(false);}
  function speak(){
    const text=messageText(message);if(!text)return;
    try{
      window.speechSynthesis.cancel();
      if(speaking){stopSpeaking();return;}
      // 0.7.33: read in the answer's own language, with an installed voice for it when there is one.
      const spoken=speakableText(text)||text,lang=detectSpeechLang(spoken,speechLocale());
      const u=new SpeechSynthesisUtterance(spoken);u.lang=lang;u.rate=1;u.onend=stopSpeaking;u.onerror=stopSpeaking;
      const voice=voiceFor(lang,window.speechSynthesis.getVoices?.()||[]);if(voice)u.voice=voice;
      speakingRef.current=true;setSpeaking(true);window.speechSynthesis.speak(u);
    }catch{stopSpeaking();toast(tr("Reading aloud is not available on this computer."))}
  }
  return <div className="messageActions">
    <CopyMessageButton message={message}/>
    <button onClick={speak} title={speaking?tr("Stop reading"):tr("Read aloud")} aria-label={speaking?tr("Stop reading"):tr("Read aloud")} aria-pressed={speaking}><Volume2 size={15}/></button>
    <button className={message.rating===1?"selected":""} onClick={()=>onRate(1)} disabled={disabled} title={tr("Useful answer")} aria-label={tr("Useful answer")} aria-pressed={message.rating===1}><ThumbsUp size={15}/></button>
    <button className={message.rating===-1?"selected":""} onClick={()=>onRate(-1)} disabled={disabled} title={tr("Weak answer")} aria-label={tr("Weak answer")} aria-pressed={message.rating===-1}><ThumbsDown size={15}/></button>
    <button onClick={onRegenerate} disabled={disabled} title={tr("Regenerate the answer")} aria-label={tr("Regenerate the answer")}><RotateCcw size={15}/></button>
  </div>;
}

function GeneratedAttachment({attachment}) {
  const kind=attachment?.kind||attachment?.type||(String(attachment?.mimeType||"").startsWith("image/")?"image":String(attachment?.mimeType||"").startsWith("video/")?"video":String(attachment?.mimeType||"").startsWith("audio/")?"audio":"file");
  const media=["image","video","audio"].includes(kind);
  const {src,failed}=useAuthedBlobUrl(media&&attachment?.id?`/api/files/${attachment.id}`:"");
  const [downloading,setDownloading]=useState(false),[viewing,setViewing]=useState(false);
  async function download(){
    if(downloading)return;setDownloading(true);
    try{await downloadGeneratedFile(attachment)}catch(e){toast(e.message)}finally{setDownloading(false)}
  }
  const viewer=viewing&&<FileViewer file={{...attachment,libraryId:attachment.id}} onClose={()=>setViewing(false)}/>;
  if(media){
    return <div className={cx("generatedMedia",kind)}>
      {viewer}
      {src?(kind==="image"?<img src={src} alt={attachment.name||tr("Picture made by {brand}",{brand:BRAND_NAME})} className="zoomable" onClick={()=>setViewing(true)} title={tr("Open full screen")}/>:kind==="video"?<video controls preload="metadata" src={src}/>:<audio controls preload="metadata" src={src}/>)
        :<div className="mediaPlaceholder">{failed?tr("The preview is not available. The file was probably deleted from the Library."):tr("Loading the preview…")}</div>}
      <div className="generatedMediaBar"><span><b>{attachment.name}</b><small>{(attachment.mimeType||kind).replace(/^.*\//,"").toUpperCase()} · {formatBytes(attachment.size)}{attachment.provider?` · ${attachment.provider}`:""}</small></span><button onClick={()=>setViewing(true)} title={tr("Open")} aria-label={tr("Open {name}",{name:attachment.name||tr("the file")})}><Maximize2 size={15}/></button><button onClick={download} disabled={downloading}><Download size={17}/> {downloading?tr("Downloading…"):tr("Download")}</button></div>
    </div>;
  }
  const openable=canView(attachment);
  // 0.7.34: a generated document (PDF, Word, Excel, PowerPoint…) opens inside the app when the card is clicked, so it can
  // be looked at before downloading; the download is the button on the right.
  const kindLabel=(attachment?.format||attachment?.name?.split(".").pop()||"FILE").toUpperCase();
  return <div className="generatedFile">{viewer}<button className="generatedDownload" onClick={openable?()=>setViewing(true):download} disabled={!openable&&downloading} title={openable?tr("Open {name}",{name:attachment?.name||tr("the file")}):tr("Download {name}",{name:attachment?.name||tr("the file")})}><span className="generatedFileIcon"><FileText size={20}/></span><span className="generatedFileMeta"><b>{attachment?.name}</b><small>{kindLabel} · {formatBytes(attachment?.size)}</small></span><span className="generatedDownloadAction">{openable?<><Eye size={18}/><em>{tr("Open")}</em></>:<><Download size={18}/><em>{downloading?tr("Downloading…"):tr("Download")}</em></>}</span></button>{openable&&<button className="generatedOpen" onClick={download} disabled={downloading} title={tr("Download {name}",{name:attachment?.name||tr("the file")})} aria-label={tr("Download {name}",{name:attachment?.name||tr("the file")})}>{downloading?<LoaderCircle size={18} className="spin"/>:<Download size={18}/>}</button>}</div>;
}

function MediaAttachment({attachment}) {
  const kind=attachment?.type;
  const isMedia=["image","audio","video"].includes(kind)&&!!attachment?.libraryId;
  const {src,failed}=useAuthedBlobUrl(isMedia?`/api/library/${attachment.libraryId}/content`:"");
  const [viewing,setViewing]=useState(false);
  async function download(){try{await downloadLibraryFile(attachment)}catch(e){toast(e.message)}}
  const viewer=viewing&&<FileViewer file={attachment} onClose={()=>setViewing(false)}/>;
  if(!isMedia)return <span className="fileChip">{viewer}<Paperclip size={12}/>{attachment?.name}{attachment?.libraryId&&canView(attachment)&&<button onClick={()=>setViewing(true)} title={tr("Open")} aria-label={tr("Open {name}",{name:attachment?.name||tr("the file")})}><Eye size={12}/></button>}{attachment?.libraryId&&<button onClick={download} title={tr("Download")} aria-label={tr("Download {name}",{name:attachment?.name||tr("the file")})}><Download size={12}/></button>}</span>;
  const Icon=kind==="audio"?Volume2:kind==="video"?Play:ImageIcon;
  return <div className={cx("messageMedia",kind)}>
    {viewer}
    <div className="messageMediaHead"><span><Icon size={15}/><b>{attachment.name}</b></span><button title={tr("Open")} aria-label={tr("Open {name}",{name:attachment.name})} onClick={()=>setViewing(true)}><Maximize2 size={15}/></button><button title={tr("Download")} aria-label={tr("Download {name}",{name:attachment.name})} onClick={download}><Download size={15}/></button></div>
    {src?(kind==="image"?<img src={src} alt={attachment.name} className="zoomable" onClick={()=>setViewing(true)}/>:kind==="audio"?<audio controls preload="metadata" src={src}/>:<video controls preload="metadata" src={src}/>)
      :<div className="mediaPlaceholder small">{failed?tr("The file is no longer in the Library."):tr("Loading…")}</div>}
    {attachment.transcript&&<small>{tr("The audio track was transcribed for {brand}.",{brand:BRAND_NAME})}</small>}
  </div>;
}

function ThinkingActivity({stage,steps=[]}) {
  const [open,setOpen]=useState(false);
  const visible=(steps.length?steps:[stage]).filter(Boolean);
  const current=stage||visible.at(-1)||tr("Preparing the answer…");
  function iconFor(text){
    const t=String(text||"").toLowerCase();
    if(/memorie|memory|context/.test(t))return <Brain size={16}/>;
    if(/fișier|file|document|pdf|docx|pptx|xlsx/.test(t))return <FileText size={16}/>;
    if(/imagine|picture|image|video|media/.test(t))return <ImageIcon size={16}/>;
    if(/web|internet|verific|check/.test(t))return <Globe2 size={16}/>;
    return <Sparkles size={16}/>;
  }
  return <div className={cx("thinkingActivity",open&&"open")} aria-live="polite">
    <button className="thinkingActivityHead" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
      <span className="thinkingActivityIcon">{iconFor(current)}</span>
      <span className="thinkingActivityTitle">{current}</span>
      <span className="thinkingActivityPulse"><i/><i/><i/></span>
      <ChevronDown size={17} className="thinkingActivityChevron"/>
    </button>
    {open&&<div className="thinkingActivitySteps">
      {visible.map((x,i)=><div key={i} className={cx("thinkingActivityStep",i===visible.length-1&&"active")}>
        <span>{iconFor(x)}</span><b>{x}</b>
      </div>)}
      <small>{tr("Only the work steps are shown, not the model's internal reasoning.")}</small>
    </div>}
  </div>;
}

function guessCodeLanguage(code,className){
  const cls=String(className||"").match(/language-([\w+#-]+)/)?.[1]?.toLowerCase();
  if(cls)return cls;
  return /^\s*(def |import \w|from \S+ import |print\(|class \w+:|if __name__)/m.test(String(code||""))?"python":"javascript";
}
// The empty chat (0.7.26): a greeting with the account's own first name and four general starting points, no names,
// places or addresses in them.
// 0.7.30, asked by the Owner: no suggestion buttons on a new chat, only a greeting and one line that changes from time
// to time with the moment (night, morning, the start or end of the week…) and with what the person was working on.
const WELCOME_LINES={
  night:["Working late? I'm here when you need me.","A quiet night is good for focused work. What's on your mind?","Still up? Let's get it done together."],
  morning:["Let's start the day well. What's first?","Fresh morning. What should we tackle?","Coffee and a clear plan? Tell me where to start."],
  afternoon:["How is the day going? What can I take off your plate?","Afternoon push: what are we finishing today?","Need a hand with the rest of the day?"],
  evening:["Wrapping up the day? I can help with what's left.","Evening. Something to finish, or a plan for tomorrow?","A calm evening is good for thinking. What's next?"],
  weekend:["It's the weekend. Something for work, or just for you?","Weekend mode. What would you like to do?"],
  monday:["New week. Want to plan it together?","Monday again. Let's set the week up."],
  friday:["Almost the weekend. What should we close before it?","Friday. Let's finish the week well."]
};
function welcomeLine(now,recentTitle){
  const h=now.getHours(),d=now.getDay(),slot=Math.floor(now.getTime()/(20*60*1000));
  const part=h<5?"night":h<12?"morning":h<18?"afternoon":h<23?"evening":"night";
  let pool=WELCOME_LINES[part];
  if(d===0||d===6)pool=[...pool,...WELCOME_LINES.weekend];
  else if(d===1&&h<12)pool=[...WELCOME_LINES.monday,...pool];
  else if(d===5&&h>=12)pool=[...WELCOME_LINES.friday,...pool];
  const title=String(recentTitle||"").trim();
  // Now and then, what the person was working on last.
  if(title&&title.length<=60&&slot%3===0)return tr("Shall we continue with «{title}»?",{title});
  return tr(pool[slot%pool.length]);
}
function Welcome({user,recentTitle}) {
  useLanguage();
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(t)},[]);
  const h=now.getHours(),part=h<5||h>=18?"Good evening":h<12?"Good morning":"Good afternoon";
  const first=String(user?.name||"").trim().split(/\s+/)[0];
  return <div className="welcome">
    <BrandMark/>
    <h1>{first?tr(part+", {name}",{name:first}):tr(part)}</h1>
    <p>{welcomeLine(now,recentTitle)}</p>
  </div>;
}
function ConversationView({conversation,busy,busyStage,busySteps,onRegenerate,onRate,onCodeResult,canRunCode,onAnswer,onOpenSettings,user,onPick,recentTitle}) {
  const {isOwner}=useAccess();
  const [contextMenu,setContextMenu]=useState(null),[running,setRunning]=useState(false);
  useEffect(()=>{
    const close=()=>setContextMenu(null);
    const key=e=>{if(e.key==="Escape")close()};
    window.addEventListener("click",close);
    window.addEventListener("blur",close);
    window.addEventListener("scroll",close,true);
    window.addEventListener("keydown",key);
    return()=>{window.removeEventListener("click",close);window.removeEventListener("blur",close);window.removeEventListener("scroll",close,true);window.removeEventListener("keydown",key)};
  },[]);
  function openCopyMenu(e,message){
    e.preventDefault();e.stopPropagation();
    const pre=e.target?.closest?.("pre");
    const code=e.target?.closest?.("code")||pre?.querySelector?.("code");
    const selection=String(window.getSelection?.()?.toString?.()||"").trim();
    const codeText=String(pre?.innerText||(code?code.innerText:"")||"").trim();
    setContextMenu({
      x:Math.max(8,Math.min(e.clientX,window.innerWidth-235)),
      y:Math.max(8,Math.min(e.clientY,window.innerHeight-170)),
      messageText:messageText(message),
      codeText,
      language:guessCodeLanguage(codeText,code?.className),
      selection
    });
  }
  async function copyValue(value){if(!value)return;const ok=await writeClipboardText(value);if(!ok)toast(tr("The text could not be copied to the clipboard."));setContextMenu(null)}
  async function runCodeValue(){
    if(!contextMenu?.codeText||running)return;
    setRunning(true);
    try{
      const d=await api("/api/tools/code/run",{method:"POST",body:JSON.stringify({language:contextMenu.language||"javascript",code:contextMenu.codeText})});
      const r=d.data||{};
      const empty=tr("(empty)");const report=[tr("Real {brand} run result:",{brand:BRAND_NAME}),tr("Language: {lang}",{lang:r.language||contextMenu.language}),tr("Exit code: {code}",{code:r.code}),tr("Timed out: {answer}",{answer:r.timedOut?tr("YES"):tr("NO")}),r.stdout?`STDOUT:\n${r.stdout}`:`STDOUT: ${empty}`,r.stderr?`STDERR:\n${r.stderr}`:`STDERR: ${empty}`].join("\n");
      onCodeResult?.(report);setContextMenu(null);toast(tr("The code ran. The result was put in the message box."),"ok");
    }catch(e){toast(tr("Run code: {error}",{error:e.message}))}
    finally{setRunning(false)}
  }
  if(!conversation||!conversation.messages?.length)return <Welcome user={user} recentTitle={recentTitle}/>;
  const lastIndex=conversation.messages.length-1;
  return <div className="messagesColumn">
    {conversation.messages.map((m,i)=>{
      if(m.role==="user")return <div key={m.id||i} className="userRow"><div className="userMessageWrap"><div className="userBubble copyByRightClick" onContextMenu={e=>openCopyMenu(e,m)}><div className="userText">{messageText(m)}</div>{m.attachments?.length>0&&<div className="inlineAttachments mediaAttachments">{m.attachments.map((a,j)=><MediaAttachment key={a.libraryId||j} attachment={a}/>)}</div>}</div><div className="userMessageActions"><CopyMessageButton message={m}/></div></div></div>;
      if(m.role!=="assistant")return null;
      const text=String(m.content||(m.attachmentOnly?m.artifactSource||"":"")).trim();
      const questions=!m.error&&!m.mediaKind?splitQuestions(text,m.streaming):null;
      const nextUser=questions&&!questions.pending?conversation.messages.slice(i+1).find(x=>x.role==="user"):null;
      return <div key={m.id||i} className={cx("assistantBlock",(m.error||m.mediaGenerationError)&&"errorMessage")}><div className={cx("assistantMark logoMark",m.streaming&&"spinning")} aria-hidden="true"><img src="./serasmart-s.webp" alt="" draggable="false"/></div><div className="assistantBody copyByRightClick" onContextMenu={e=>openCopyMenu(e,m)}>
        {m.routeInfo&&<RouteBadge info={m.routeInfo}/>}
        {m.toolRuns?.length>0&&<div className="toolRuns">{m.toolRuns.map(r=><ToolRunCard key={r.id} run={r}/>)}</div>}
        {questions?<>
          {questions.before.trim()&&<Markdown text={questions.before}/>}
          {questions.pending?<QuestionsPending/>:<QuestionCard key={m.id||i} questions={questions.questions} answeredWith={nextUser?messageText(nextUser):null} disabled={busy} onSubmit={onAnswer}/>}
          {questions.after?.trim()&&<Markdown text={questions.after}/>}
        </>:text&&<Markdown text={text}/>}
        {(m.needsVideoSetup||(m.mediaGenerationError&&m.mediaKind==="video"&&/Setări\s*→\s*Video/.test(text)))&&<button className="secondary videoSetupButton" onClick={()=>onOpenSettings?.("video")}><Settings size={15}/> {tr("Open Settings → Video")}</button>}
        {m.stopped&&<div className="stoppedNote">{text?tr("The answer was stopped before the end."):tr("The answer was stopped.")}</div>}
        {m.attachments?.length>0&&<div className="generatedFiles">{m.attachments.map((a,j)=><GeneratedAttachment key={a.id||j} attachment={a}/>)}</div>}
        {!m.streaming&&text&&<MessageActions message={m} title={conversation.title} disabled={busy} onRegenerate={()=>onRegenerate(i,i<lastIndex)} onRate={v=>onRate(i,v)}/>}
        {!m.streaming&&!text&&(m.mediaKind||m.stopped)&&<div className="messageActions"><button onClick={()=>onRegenerate(i,i<lastIndex)} disabled={busy} title={m.attachments?.length?tr("Generate again"):tr("Try again")} aria-label={m.attachments?.length?tr("Generate again"):tr("Try again")}><RotateCcw size={15}/></button></div>}
      </div></div>;
    })}
    {busy&&<ThinkingActivity stage={busyStage} steps={busySteps}/>}
    {contextMenu&&<div className="copyContextMenu" role="menu" style={{left:contextMenu.x,top:contextMenu.y}} onClick={e=>e.stopPropagation()}>
      {contextMenu.codeText&&<button role="menuitem" onClick={()=>copyValue(contextMenu.codeText)}><Copy size={15}/><span><b>{tr("Copy the code")}</b><small>{tr("Only the selected code block")}</small></span></button>}
      {canRunCode&&contextMenu.codeText&&<button role="menuitem" onClick={runCodeValue} disabled={running}><Play size={15}/><span><b>{running?tr("Running…"):tr("Run / test the code")}</b><small>Owner · {contextMenu.language==="python"?"Python":"Node.js"} · {tr("real result")}</small></span></button>}
      {contextMenu.selection&&<button role="menuitem" onClick={()=>copyValue(contextMenu.selection)}><Copy size={15}/><span><b>{tr("Copy the selection")}</b><small>{tr("The text you selected")}</small></span></button>}
      <button role="menuitem" onClick={()=>copyValue(contextMenu.messageText)}><Copy size={15}/><span><b>{tr("Copy the message")}</b><small>{tr("The whole message")}</small></span></button>
    </div>}
  </div>;
}

function TrayChip({attachment,onRemove}) {
  const image=attachment.type==="image"&&attachment.libraryId;
  const {src}=useAuthedBlobUrl(image?`/api/library/${attachment.libraryId}/content`:"");
  const Icon=attachment.type==="audio"?Volume2:attachment.type==="video"?Play:attachment.type==="image"?ImageIcon:Paperclip;
  return <span className={cx(attachment.type==="stored"&&"unsupported")} title={attachment.type==="stored"?attachment.part?.text:attachment.name}>
    {src?<img className="trayThumb" src={src} alt=""/>:<Icon size={13}/>} {attachment.name}
    <button onClick={onRemove} aria-label={tr("Remove {name}",{name:attachment.name})} title={tr("Remove")}><X size={13}/></button>
  </span>;
}

const VIDEO_PROVIDERS_TEXT="Pick who makes the video under the message box, or Automatic: the free ones first, then Gemini Veo, Grok Imagine and the other keys (paid, if you allow them in Settings).";
function imageProvidersText(){return "Pick who makes the picture under the message box, or Automatic: the best one available.";}
// Who makes the picture / video (0.7.24): picked under the message box in the Poză / Video mode and remembered on this
// device for each kind; "" = Automat (the best one available, as in Settings → «Făcute de»).
const makerKey=(kind)=>`serasmart-media-maker-${kind}`;
function savedMaker(kind){try{return localStorage.getItem(makerKey(kind))||""}catch{return ""}}
function saveMaker(kind,value){try{if(value)localStorage.setItem(makerKey(kind),value);else localStorage.removeItem(makerKey(kind))}catch{}}
// Video length (0.7.27): one generation, up to the plan's seconds (free tier 6, Owner / no credits 30). The number
// written in the message ("a 10 second video") wins over the menu.
const VIDEO_LENGTHS=[4,6,8,10,15,20,30],VIDEO_LEN_KEY="serasmart-video-seconds";
let videoMaxCache=null;
function videoMaxSeconds(){
  if(videoMaxCache)return videoMaxCache;
  videoMaxCache=api("/api/credits?peek=1").then(d=>!d?.enabled||d.unlimited?30:d.plan&&d.features?.videoSeconds>0?d.features.videoSeconds:6).catch(()=>6);
  return videoMaxCache;
}
function savedVideoSeconds(){try{return Number(localStorage.getItem(VIDEO_LEN_KEY))||0}catch{return 0}}
function videoSecondsFor(prompt,max){
  const m=String(prompt||"").match(/(\d{1,2})\s*(?:-\s*)?(?:s\b|sec\b|secs\b|second|seconds|secunde|secundă|secunda|segundos|secondes|sekunden)/i);
  const asked=m?Number(m[1]):savedVideoSeconds()||6;
  return Math.max(1,Math.min(max||30,asked));
}
function VideoLengthPick() {
  useLanguage();
  const [max,setMax]=useState(null),[value,setValue]=useState(()=>savedVideoSeconds()||6);
  useEffect(()=>{let live=true;videoMaxSeconds().then(m=>{if(live)setMax(m)});return()=>{live=false}},[]);
  const options=VIDEO_LENGTHS.filter(n=>n<=(max||6));
  const shown=options.includes(value)?value:options[options.length-1]||6;
  return <label className="makerPick lengthPick"><span>{tr("Length")}</span>
    <select value={shown} disabled={max===null} onChange={e=>{const n=Number(e.target.value);setValue(n);try{localStorage.setItem(VIDEO_LEN_KEY,String(n))}catch{}}}>
      {options.map(n=><option key={n} value={n}>{tr("{n} seconds",{n})}</option>)}
    </select>
  </label>;
}
function MediaMakerPick({kind}) {
  const [options,setOptions]=useState(null),[value,setValue]=useState(()=>savedMaker(kind));
  useEffect(()=>{
    let live=true;setValue(savedMaker(kind));setOptions(null);
    api(`/api/media/options?kind=${kind}`).then(d=>{if(live)setOptions(Array.isArray(d?.data)?d.data:[])}).catch(()=>{if(live)setOptions([])});
    return ()=>{live=false};
  },[kind]);
  const list=options||[],groups=[...new Set(list.map(o=>o.group))];
  const shown=!value||list.some(o=>o.value===value&&!o.blocked)?value:"";
  useLanguage();
  return <label className="makerPick"><span>{kind==="image"?tr("Picture made by"):tr("Video made by")}</span>
    <select value={shown} disabled={options===null} onChange={e=>{setValue(e.target.value);saveMaker(kind,e.target.value)}}>
      <option value="">{options===null?tr("Loading…"):tr("Automatic · the best available")}</option>
      {groups.map(g=><optgroup key={g} label={g}>{list.filter(o=>o.group===g).map(o=><option key={o.value} value={o.value} disabled={!!o.blocked}>{o.label}{o.blocked?` (${o.blocked})`:""}</option>)}</optgroup>)}
    </select>
  </label>;
}
// 0.7.36: the text being typed lives here, not in App: a key press re-renders only the message box, not the whole
// conversation, the sidebar and the header (that made typing lag in long chats).
const draftStore=(()=>{let value="";const subs=new Set();return{
  get:()=>value,
  set:(next)=>{const v=typeof next==="function"?next(value):next;if(v===value)return;value=String(v??"");subs.forEach(fn=>fn())},
  subscribe:(fn)=>{subs.add(fn);return()=>subs.delete(fn)}
}})();
function useDraft(){return [useSyncExternalStore(draftStore.subscribe,draftStore.get,draftStore.get),draftStore.set]}
function Composer({centered,onSend,onStop,busy,attachments,setAttachments,onOpenLibrary,responseMode,setResponseMode,mediaMode,setMediaMode,mentionsVersion,mediaPolicy}) {
  const {can,deny}=useAccess();
  const [draft,setDraft]=useDraft();
  const ta=useRef(null),fileInput=useRef(null),imageInput=useRef(null),videoInput=useRef(null),audioInput=useRef(null),recorderRef=useRef(null),streamRef=useRef(null),chunksRef=useRef([]),attachRef=useRef(null),mountedRef=useRef(true),autoSendRef=useRef(false),speechRef=useRef(null),stoppedRef=useRef(false),startingRef=useRef(false),draftRef=useRef(draft);
  const [menu,setMenu]=useState(false),[voiceTick,setVoiceTick]=useState(0),[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false),[uploading,setUploading]=useState(0),[mentions,setMentions]=useState([]),[mentionIndex,setMentionIndex]=useState(0),[mentionClosedFor,setMentionClosedFor]=useState(null),[dragOver,setDragOver]=useState(false);
  const pluginsOk=can("plugins"),automationsOk=can("automations");
  useDismiss(menu,()=>setMenu(false),attachRef);
  useEffect(()=>{if(ta.current){ta.current.style.height="0px";ta.current.style.height=Math.min(ta.current.scrollHeight,190)+"px"}},[draft]);
  useEffect(()=>{
    mountedRef.current=true;
    return()=>{
      mountedRef.current=false;
      try{speechRef.current?.abort()}catch{}
      try{if(recorderRef.current&&recorderRef.current.state!=="inactive")recorderRef.current.stop()}catch{}
      try{streamRef.current?.getTracks().forEach(t=>t.stop())}catch{}
    };
  },[]);
  useEffect(()=>{
    function focusComposerFromKeyboard(e){
      if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
      if(modalStack.length)return;
      const target=e.target;
      if(target?.closest?.('input,textarea,select,button,a,summary,[contenteditable="true"],[role="menu"],[role="listbox"]'))return;
      if(typeof e.key!=="string"||e.key.length!==1)return;
      e.preventDefault();
      setDraft(v=>v+e.key);
      requestAnimationFrame(()=>{
        ta.current?.focus();
        if(ta.current){
          const end=ta.current.value.length;
          try{ta.current.selectionStart=ta.current.selectionEnd=end}catch{}
        }
      });
    }
    window.addEventListener("keydown",focusComposerFromKeyboard);
    return()=>window.removeEventListener("keydown",focusComposerFromKeyboard);
  },[setDraft]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      const [p,a]=await Promise.all([pluginsOk?api("/api/plugins").catch(()=>({data:[]})):{data:[]},automationsOk?api("/api/automations").catch(()=>({data:[]})):{data:[]}]);
      if(!active)return;
      setMentions([
        ...(p.data||[]).filter(x=>x.enabled!==false&&x.name).map(x=>({type:"plugin",name:x.name,trigger:x.trigger||("@"+x.name.toLowerCase().replace(/\s+/g,"-"))})),
        ...(a.data||[]).filter(x=>x.enabled!==false&&x.title).map(x=>({type:"automation",name:x.title,trigger:x.trigger||("@"+x.title.toLowerCase().replace(/\s+/g,"-"))}))
      ]);
    })();
    return()=>{active=false};
  },[mentionsVersion,pluginsOk,automationsOk]);
  const mentionMatch=draft.match(/(^|\s)@([^\s@]*)$/);
  const mentionQuery=(mentionMatch?.[2]||"").toLowerCase();
  const mentionOptions=mentionMatch&&mentionClosedFor!==draft?mentions.filter(x=>x.name.toLowerCase().includes(mentionQuery)||x.trigger.toLowerCase().includes("@"+mentionQuery)).slice(0,8):[];
  useEffect(()=>{setMentionIndex(0)},[mentionQuery,mentionOptions.length]);
  function insertMention(x){setDraft(v=>v.replace(/(^|\s)@([^\s@]*)$/,(_m,pre)=>`${pre}${x.trigger||"@"+x.name} `));setTimeout(()=>ta.current?.focus(),0)}
  function toolPrompt(text){setMenu(false);setDraft(text);setTimeout(()=>{ta.current?.focus();try{ta.current.selectionStart=ta.current.selectionEnd=text.length}catch{}},0)}
  async function addComposerFiles(files){
    if(!files?.length)return;
    if(!can("file_upload")){deny("file_upload");return;}
    setUploading(n=>n+1);
    const added=[],failed=[];
    for(const f of files){
      try{const item=await uploadFileToLibrary(f);added.push(await libraryItemToAttachment(item))}
      catch(err){failed.push(`${f.name}: ${err.message}`)}
    }
    if(added.length)setAttachments(v=>[...v,...added]);
    if(failed.length)toast(tr("Could not attach: ")+failed.join(" · "));
    if(mountedRef.current)setUploading(n=>Math.max(0,n-1));
  }
  async function filesChosen(e){
    const input=e.target,files=[...(input.files||[])];
    input.value="";setMenu(false);
    await addComposerFiles(files);
  }
  async function pasteIntoComposer(e){
    const files=[...(e.clipboardData?.files||[])];
    if(files.length){e.preventDefault();await addComposerFiles(files);return;}
    const text=e.clipboardData?.getData("text/plain");
    if(!text)return;
    e.preventDefault();
    const el=e.currentTarget;
    const start=typeof el.selectionStart==="number"?el.selectionStart:draft.length;
    const end=typeof el.selectionEnd==="number"?el.selectionEnd:draft.length;
    if(typeof document.execCommand==="function"&&document.execCommand("insertText",false,text))return;
    const next=draft.slice(0,start)+text+draft.slice(end);
    setDraft(next);
    requestAnimationFrame(()=>{try{el.focus();el.selectionStart=el.selectionEnd=start+text.length}catch{}});
  }
  function onDragOver(e){if(![...(e.dataTransfer?.types||[])].includes("Files"))return;e.preventDefault();e.dataTransfer.dropEffect=can("file_upload")?"copy":"none";setDragOver(true)}
  function onDragLeave(e){if(!e.currentTarget.contains(e.relatedTarget))setDragOver(false)}
  async function onDrop(e){if(![...(e.dataTransfer?.types||[])].includes("Files"))return;e.preventDefault();setDragOver(false);await addComposerFiles([...(e.dataTransfer.files||[])])}
  // Microphone: the words appear in the box while you speak (the browser's speech recognition) and the message is sent
  // when you stop. Where the browser has no recognition (the Windows app, Firefox) or it fails, the recording is sent to
  // Serasmart AI, which transcribes it (OmniRoute or Groq) and sends the text. No file permission is needed.
  function finishVoice(text){
    const t=String(text||"").trim();
    if(!t){toast(tr("I heard nothing. Press the microphone and speak again."),"info");return;}
    autoSendRef.current=true;setVoiceTick(n=>n+1);
  }
  function startSpeech(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR||window.Serasmart)return false;
    const r=new SR();r.lang=speechLocale();r.interimResults=true;r.continuous=true;
    const base=draftRef.current?draftRef.current.replace(/\s+$/,"")+" ":"";
    let finals="",heard="",failed="";stoppedRef.current=false;
    r.onresult=e=>{
      let interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finals+=t+" ";else interim+=t;}
      heard=(finals+interim).trim();
      setDraft(base+heard);
    };
    r.onerror=e=>{failed=e.error||"error";};
    r.onend=()=>{
      speechRef.current=null;
      if(!mountedRef.current)return;
      if(!(failed&&failed!=="no-speech"&&failed!=="aborted"&&!heard&&!stoppedRef.current&&failed!=="not-allowed"))setRecording(false);
      if(failed&&failed!=="no-speech"&&failed!=="aborted"){
        if(failed==="not-allowed"){toast(tr("The microphone is blocked. Allow microphone access in the browser."));return;}
        // Text already heard is kept for the user to check; it is not sent half-finished.
        if(heard){toast(tr("Voice recognition stopped; check the text and send it."),"info");return;}
        // The browser cannot recognise speech here (no connection to its service…): record instead, unless the user already stopped.
        if(stoppedRef.current){toast(tr("Voice recognition did not work. Press the microphone and try again."));return;}
        startRecorder();return;
      }
      finishVoice(heard);
    };
    try{r.start();}catch(e){console.warn("Recunoaștere vocală indisponibilă:",e?.message||e);return false;}
    speechRef.current=r;setRecording(true);return true;
  }
  async function startRecorder(){
    startingRef.current=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error(tr("The browser cannot record sound."));
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;chunksRef.current=[];
      const mime=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"].find(x=>window.MediaRecorder?.isTypeSupported?.(x))||"";
      const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorderRef.current=rec;
      const stopTracks=()=>{try{stream.getTracks().forEach(t=>t.stop())}catch{};streamRef.current=null;};
      rec.ondataavailable=e=>{if(e.data?.size)chunksRef.current.push(e.data)};
      rec.onerror=()=>{setRecording(false);stopTracks();toast(tr("The voice recording failed."))};
      rec.onstop=async()=>{
        stopTracks();recorderRef.current=null;
        if(!mountedRef.current)return;
        setRecording(false);setTranscribing(true);
        let text="",failedTranscript=true;
        try{
          const blob=new Blob(chunksRef.current,{type:rec.mimeType||"audio/webm"});
          if(!blob.size)throw new Error(tr("The recording is empty."));
          const audio=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result).split(",")[1]||"");fr.onerror=()=>no(new Error(tr("Cannot read the recording.")));fr.readAsDataURL(blob)});
          const d=await api("/api/transcribe",{method:"POST",body:JSON.stringify({audio,mime:blob.type,language:speechLocale().slice(0,2)})});
          text=String(d?.text||"").trim();
          if(text&&mountedRef.current)setDraft(v=>(v?v.replace(/\s+$/,"")+" ":"")+text);
          failedTranscript=false;
        }catch(e){toast("Vocalul nu a putut fi transcris: "+friendlyError(e.message))}
        finally{if(mountedRef.current){setTranscribing(false);if(!failedTranscript)finishVoice(text);}}
      };
      rec.start();setRecording(true);startingRef.current=false;
    }catch(e){
      startingRef.current=false;setRecording(false);
      toast(/denied|permission|NotAllowed/i.test(String(e?.name||e?.message))?tr("Microphone access was refused. Allow the microphone in the browser."):tr("The microphone is not available: {error}",{error:friendlyError(e.message)}));
    }
  }
  async function mic(){
    if(recording){
      if(speechRef.current){stoppedRef.current=true;try{speechRef.current.stop()}catch{}return;}
      if(recorderRef.current){try{recorderRef.current.stop()}catch{}return;}
      return;
    }
    if(startingRef.current)return;
    if(!startSpeech())await startRecorder();
  }
  const hasContent=!!draft.trim()||attachments.some(a=>a.part||a.parts?.length);
  draftRef.current=draft;
  useEffect(()=>{if(autoSendRef.current&&!transcribing&&!recording&&draft.trim()){if(busy){toast(tr("The spoken text is in the box; send it when the AI finishes its answer."),"info");autoSendRef.current=false;return;}autoSendRef.current=false;trySend();}},[draft,transcribing,voiceTick]);
  function trySend(){
    if(busy)return;
    if(uploading){toast(tr("Wait for the file to finish uploading."),"info");return;}
    if(recording){toast(tr("Stop the voice recording first."),"info");return;}
    if(transcribing){toast(tr("Waiting for the voice to be written out."),"info");return;}
    if(!hasContent)return;
    onSend();
  }
  function onKeyDown(e){
    if(mentionOptions.length){
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setMentionIndex(i=>(i+(e.key==="ArrowDown"?1:-1)+mentionOptions.length)%mentionOptions.length);return;}
      if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();insertMention(mentionOptions[Math.min(mentionIndex,mentionOptions.length-1)]);return;}
      if(e.key==="Escape"){e.preventDefault();setMentionClosedFor(draft);return;}
    }
    if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent?.isComposing){e.preventDefault();trySend();}
  }
  function lockedItem(perm,action){return ()=>{if(perm&&!can(perm)){setMenu(false);deny(perm);return;}action();}}
  function toggleMedia(kind){
    const perm=kind==="image"?"image_generation":"video_generation";
    if(!can(perm)){deny(perm);return;}
    setMediaMode(m=>m===kind?null:kind);setMenu(false);setTimeout(()=>ta.current?.focus(),0);
  }
  const uploadLocked=!can("file_upload");
  useLanguage();
  const placeholder=uploading?tr("Uploading the file…"):recording?tr("Listening… press the microphone to stop"):transcribing?tr("Writing out your voice…"):mediaMode==="image"?tr("Describe the picture you want…"):mediaMode==="video"?tr("Describe the video you want…"):tr("Message {brand}",{brand:BRAND_NAME});
  const hint=uploading?tr("The file is saved in your Library (up to 2 GB a file)…"):recording?tr("Microphone on — speak now"):transcribing?tr("{brand} is writing out the recording…",{brand:BRAND_NAME}):mediaMode==="image"?tr("Picture mode: the next message makes a picture. Press Picture again to leave."):mediaMode==="video"?tr("Video mode: the next message makes a video. Press Video again to leave."):tr("{brand} can make mistakes. Check important information.",{brand:BRAND_NAME});
  return <div className={cx("composerDock",centered&&"centered")} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
    {mentionOptions.length>0&&<div className="mentionMenu" role="listbox" aria-label={tr("Apps and automations")}>{mentionOptions.map((x,i)=><button key={x.type+x.trigger+i} role="option" aria-selected={i===mentionIndex} className={cx(i===mentionIndex&&"active")} onMouseDown={e=>e.preventDefault()} onClick={()=>insertMention(x)}><span className={cx("mentionType",x.type)}>{x.type==="plugin"?<Plug size={14}/>:<CalendarClock size={14}/>}</span><span><b>{x.name}</b><small>{x.type==="plugin"?tr("App"):tr("Automation")} · {x.trigger}</small></span></button>)}</div>}
    <div className={cx("composerCard",dragOver&&"dragOver")}>
      {(recording||transcribing)&&<Suspense fallback={null}><VoiceOrb phase={transcribing?"thinking":"listening"} stream={streamRef.current}/></Suspense>}
      {dragOver&&<div className="dropHint">{uploadLocked?deniedMessage("file_upload"):tr("Drop to attach the files")}</div>}
      {attachments.length>0&&<div className="attachmentTray">{attachments.map((a,i)=><TrayChip key={(a.libraryId||a.name)+i} attachment={a} onRemove={()=>setAttachments(v=>v.filter((_,j)=>j!==i))}/>)}</div>}
      <input ref={fileInput} type="file" hidden multiple onChange={filesChosen}/>
      <input ref={imageInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={filesChosen}/>
      <input ref={videoInput} type="file" hidden multiple accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.m4v,.avi,.mkv,.mpeg,.mpg" onChange={filesChosen}/>
      <input ref={audioInput} type="file" hidden multiple accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/flac,audio/opus,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus" onChange={filesChosen}/>
      <div className="composerLine">
        <textarea ref={ta} value={draft} onChange={e=>{setDraft(e.target.value);setMentionClosedFor(null)}} onPaste={pasteIntoComposer} spellCheck={true} aria-label={tr("Message {brand}",{brand:BRAND_NAME})} placeholder={placeholder} onKeyDown={onKeyDown}/>
      </div>
      {mediaMode&&<div className="makerRow"><MediaMakerPick kind={mediaMode}/>{mediaMode==="video"&&<VideoLengthPick/>}</div>}
      {/* One toolbar under the text, as in the big chat apps: attach and modes on the left, voice and send on the right. */}
      <div className="composerTools">
        <div className="attachWrap" ref={attachRef}><button className="composerIcon" onClick={()=>setMenu(v=>!v)} title={tr("Files and tools")} aria-label={tr("Files and tools")} aria-haspopup="menu" aria-expanded={menu}><Plus size={20}/></button>{menu&&<div className="attachMenu" role="menu">
          <button role="menuitem" className={cx(uploadLocked&&"locked")} onClick={lockedItem("file_upload",()=>{setMenu(false);imageInput.current?.click()})}><ImageIcon size={16}/> {tr("Upload pictures")}{uploadLocked&&<Lock size={12} className="lockIcon"/>}</button>
          <button role="menuitem" className={cx(uploadLocked&&"locked")} onClick={lockedItem("file_upload",()=>{setMenu(false);videoInput.current?.click()})}><Play size={16}/> {tr("Upload video")}{uploadLocked&&<Lock size={12} className="lockIcon"/>}</button>
          <button role="menuitem" className={cx(uploadLocked&&"locked")} onClick={lockedItem("file_upload",()=>{setMenu(false);audioInput.current?.click()})}><Volume2 size={16}/> {tr("Upload audio")}{uploadLocked&&<Lock size={12} className="lockIcon"/>}</button>
          <button role="menuitem" className={cx(uploadLocked&&"locked")} onClick={lockedItem("file_upload",()=>{setMenu(false);fileInput.current?.click()})}><Upload size={16}/> {tr("Upload any file")}{uploadLocked&&<Lock size={12} className="lockIcon"/>}</button>
          <button role="menuitem" onClick={()=>{setMenu(false);onOpenLibrary()}}><Library size={16}/> {tr("Choose from Library")}</button>
          <div className="menuDivider"/>
          <button role="menuitem" className={cx(!can("web_search")&&"locked")} onClick={lockedItem("web_search",()=>toolPrompt(tr("Search the web for the latest on ")))}><Globe2 size={16}/> {tr("Web search")}{!can("web_search")&&<Lock size={12} className="lockIcon"/>}</button>
          <button role="menuitem" className={cx(!can("deep_research")&&"locked")} onClick={lockedItem("deep_research",()=>toolPrompt(tr("Do deep research, check several sources and explain fully: ")))}><Search size={16}/> Deep Research{!can("deep_research")&&<Lock size={12} className="lockIcon"/>}</button>
        </div>}</div>
        <button className={cx("mediaMake",mediaMode==="image"&&"active",!can("image_generation")&&"locked")} aria-pressed={mediaMode==="image"} aria-label={tr("Picture")} title={can("image_generation")?tr("Picture: the next message makes a picture.")+" "+tr(imageProvidersText()):deniedMessage("image_generation")} onClick={()=>toggleMedia("image")}><ImageIcon size={16}/><span>{tr("Picture")}</span></button>
        <button className={cx("mediaMake",mediaMode==="video"&&"active",!can("video_generation")&&"locked")} aria-pressed={mediaMode==="video"} aria-label={tr("Video")} title={can("video_generation")?tr("Video: the next message makes a video.")+" "+tr(VIDEO_PROVIDERS_TEXT):deniedMessage("video_generation")} onClick={()=>toggleMedia("video")}><Clapperboard size={16}/><span>{tr("Video")}</span></button>
        <button className={cx("mediaMake thinkToggle",responseMode==="thinking"&&"active")} aria-pressed={responseMode==="thinking"} aria-label={tr("Think")} title={responseMode==="thinking"?tr("Think is on: more careful answers, a little slower. Press for Fast."):tr("Fast mode. Press for Think: more careful answers, a little slower.")} onClick={()=>setResponseMode(responseMode==="thinking"?"rapid":"thinking")}><Brain size={16}/><span>{tr("Think")}</span></button>
        <span className="composerSpacer"/>
        <button className={cx("composerIcon",recording&&"recording")} onClick={mic} title={recording?tr("Stop and send"):tr("Speak: the text appears in the box and is sent by itself")} aria-label={recording?tr("Stop the voice recording"):tr("Record your voice")} aria-pressed={recording} disabled={transcribing}><Mic size={19}/></button>
        {busy
          ? <button className="sendButton stopButton" onClick={onStop} title={tr("Stop the answer")} aria-label={tr("Stop the answer")}><Square size={15} fill="currentColor"/></button>
          : <button className="sendButton" disabled={!!uploading||recording||transcribing||!hasContent} onClick={trySend} title={tr("Send")} aria-label={tr("Send the message")}><ArrowUp size={20}/></button>}
      </div>
    </div>
    <div className="composerHint" aria-live="polite">{hint}</div>
  </div>;
}

const ADMIN_STATUS_LABELS={pending:"Pending",active:"Active",rejected:"Rejected",suspended:"Suspended",blocked:"Blocked"};
const statusLabel=s=>ADMIN_STATUS_LABELS[s]?tr(ADMIN_STATUS_LABELS[s]):s;
const AUDIT_LABELS={"admin.user_status":"Account status changed","admin.permissions":"Permissions changed","admin.model_override":"Model allowed / blocked","admin.sessions_revoke":"Sessions closed","admin.paid_ai":"Paid AI changed","auth.register":"New account","auth.login":"Sign-in","auth.logout":"Sign-out"};
function AdminPanel({onClose}) {
  // 0.7.34: the whole app translated into every language ahead of time (the server does it in the background).
  async function translateAll(){
    try{const d=await api("/api/i18n/prefill",{method:"POST",body:"{}"});toast(tr("Translating {n} texts into {count} languages in the background. You can close this window.",{n:d.data?.total||0,count:(d.data?.queue||[]).length}),"ok")}
    catch(e){toast(e.message)}
  }
  const permissionLabels={
    chat:"Chat AI",cerebras:"Cerebras",gemini:"Gemini",groq:"Groq",cloudflare:"Cloudflare AI",
    openrouter:"OpenRouter (may cost money)",image_generation:"Picture making",video_generation:"Video making",document_generation:"Files: PDF / Word / PowerPoint / Excel / CSV / ZIP / code",
    file_upload:"File uploads",web_search:"Web search",deep_research:"Deep Research",
    automations:"Scheduled (scheduled tasks)",plugins:"Plugins",github_access:"GitHub",openai:"OpenAI (paid)",anthropic:"Claude / Anthropic (paid)",
    code:"Code {brand} (through the OpenAI / Claude APIs, not your subscriptions)"
  };
  const [users,setUsers]=useState([]),[selectedId,setSelectedId]=useState(null),[filter,setFilter]=useState("all");
  const [paidAi,setPaidAi]=useState(false),[auditRows,setAuditRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState({}),[actionBusy,setActionBusy]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function load(){
    setBusy(true);setError("");
    try{
      const [u,a,l]=await Promise.all([api("/api/admin/users"),api("/api/admin/ai"),api("/api/admin/audit?limit=50")]);
      if(!mounted.current)return;
      const rows=u.data||[];setUsers(rows);setPaidAi(!!a.paidAiEnabled);setAuditRows(l.data||[]);
      setSelectedId(v=>v&&rows.some(x=>x.id===v)?v:(rows.find(x=>x.status==="pending"&&x.role!=="owner")?.id||rows.find(x=>x.role!=="owner")?.id||null));
    }catch(e){if(mounted.current)setError(e.message)}finally{if(mounted.current)setBusy(false)}
  }
  useEffect(()=>{load()},[]);
  const selected=users.find(x=>x.id===selectedId)||null;
  const pendingCount=users.filter(x=>x.status==="pending").length;
  const activeCount=users.filter(x=>x.status==="active").length;
  const visible=users.filter(x=>filter==="all"||x.status===filter);
  async function setStatus(user,status){
    if(!user||user.role==="owner"||actionBusy)return;
    if(["blocked","rejected","suspended"].includes(status)&&!confirm(tr("Set the status «{status}» for {email}? The account's active sessions will be closed.",{status:statusLabel(status),email:user.email})))return;
    setActionBusy(true);
    try{await api(`/api/admin/users/${user.id}/status`,{method:"PATCH",body:JSON.stringify({status})});await load();toast(tr("The status of {email} is now «{status}».",{email:user.email,status:statusLabel(status)}),"ok")}
    catch(e){toast(tr("Admin: {error}",{error:e.message}))}
    finally{if(mounted.current)setActionBusy(false)}
  }
  async function togglePermission(user,key,value){
    if(!user||user.role==="owner"||pending[`${user.id}:${key}`])return;
    setPending(p=>({...p,[`${user.id}:${key}`]:true}));
    try{
      const d=await api(`/api/admin/users/${user.id}/permissions`,{method:"PATCH",body:JSON.stringify({permissions:{[key]:value}})});
      if(mounted.current)setUsers(rows=>rows.map(x=>x.id===user.id?{...x,permissions:d.permissions||{...x.permissions,[key]:value}}:x));
    }catch(e){toast(tr("Permissions: {error}",{error:e.message}))}
    finally{if(mounted.current)setPending(p=>{const n={...p};delete n[`${user.id}:${key}`];return n})}
  }
  const [modelIds,setModelIds]=useState(null),[modelQuery,setModelQuery]=useState(""),[modelsError,setModelsError]=useState(""),[modelsTry,setModelsTry]=useState(0),[personalIds,setPersonalIds]=useState(()=>new Set());
  useEffect(()=>{let live=true;api("/api/models").then(ms=>{if(!live)return;setPersonalIds(new Set((ms?.personalModels||[]).map(x=>String(x).toLowerCase())));setModelIds([...new Set((ms?.data||[]).map(x=>String(typeof x==="string"?x:x?.id||"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b)))}).catch(e=>{if(live){setModelIds([]);setModelsError(e?.message||tr("unknown error"))}});return()=>{live=false}},[modelsTry]);
  async function setModelMode(user,model,mode){
    if(!user||user.role==="owner")return;
    const k=`${user.id}:model:${model}`;
    if(pending[k])return;
    setPending(p=>({...p,[k]:true}));
    try{
      const d=await api(`/api/admin/users/${user.id}/models`,{method:"PATCH",body:JSON.stringify({model,mode})});
      if(mounted.current)setUsers(rows=>rows.map(x=>x.id===user.id?{...x,permissions:d.permissions||x.permissions}:x));
      toast(tr("{model}: {mode} for {email}.",{model,mode:tr({allow:"Allowed",deny:"Blocked",default:"Default"}[mode]),email:user.email}),"ok");
    }catch(e){toast("Model: "+e.message)}
    finally{if(mounted.current)setPending(p=>{const n={...p};delete n[k];return n})}
  }
  async function revokeSessions(user){
    if(!user||user.role==="owner"||actionBusy)return;
    if(!confirm(tr("Close all active sessions for {email}?",{email:user.email})))return;
    setActionBusy(true);
    try{await api(`/api/admin/users/${user.id}/sessions/revoke`,{method:"POST",body:"{}"});await load();toast(tr("The sessions were closed."),"ok")}
    catch(e){toast(tr("Sessions: {error}",{error:e.message}))}
    finally{if(mounted.current)setActionBusy(false)}
  }
  async function togglePaid(){
    if(actionBusy)return;
    const next=!paidAi;
    const message=next
      ?tr("Allow paid AI for the other eligible accounts? Each user still needs their own OpenAI / Claude / OpenRouter permission.")
      :tr("Turn off paid AI for normal accounts? The Owner keeps access to the paid models.");
    if(!confirm(message))return;
    setActionBusy(true);
    try{const d=await api("/api/admin/ai",{method:"PATCH",body:JSON.stringify({paidAiEnabled:next})});setPaidAi(!!d.paidAiEnabled)}
    catch(e){toast(tr("Paid AI: {error}",{error:e.message}))}
    finally{if(mounted.current)setActionBusy(false)}
  }
  return <ToolShell title={`${BRAND_SHORT} Control Center`} subtitle={tr("Owner: users, approvals, permissions, sessions and AI services.")} onClose={onClose}>
    <div className="adminPanel">
      {error&&<div className="authError" role="alert">{error}</div>}
      <div className="adminSummary">
        <div><span>Utilizatori</span><b>{users.length}</b></div>
        <div className={pendingCount?"warn":""}><span>{tr("Pending")}</span><b>{pendingCount}</b></div>
        <div><span>{tr("Active users")}</span><b>{activeCount}</b></div>
        <button className={cx("adminPaidAi",paidAi&&"on")} onClick={togglePaid} disabled={actionBusy} aria-pressed={paidAi} title={tr("Controls paid AI for normal accounts. The Owner stays allowed.")}><span>{tr("Paid AI · users")}</span><b>{paidAi?tr("ON"):tr("OFF")}</b></button>
      </div>
      <div className="adminToolbar">
        <div className="adminFilters" role="tablist">
          {[["all","All"],["pending","Pending"],["active","Active users"],["suspended","Suspended users"],["blocked","Blocked users"],["rejected","Rejected users"]].map(([k,label])=><button key={k} role="tab" aria-selected={filter===k} className={filter===k?"active":""} onClick={()=>setFilter(k)}>{tr(label)}</button>)}
        </div>
        <button className="secondary" onClick={translateAll} title={tr("Translate the whole app into every language")}><Globe2 size={15}/> {tr("Translate the app")}</button>
        <button className="secondary" onClick={load} disabled={busy}><RotateCcw size={15}/> {busy?tr("Updating…"):tr("Refresh")}</button>
      </div>
      <div className="adminLayout">
        <div className="adminUsers">
          {visible.map(u=><button key={u.id} className={cx("adminUserRow",selectedId===u.id&&"active")} onClick={()=>setSelectedId(u.id)}>
            <span className="accountAvatar">{(u.name||u.email||"U")[0].toUpperCase()}</span>
            <span className="adminUserCopy"><b>{u.name||u.email}</b><small>{u.email}</small></span>
            <span className={cx("adminStatus","s-"+u.status)}>{u.role==="owner"?"Owner":statusLabel(u.status)}</span>
          </button>)}
          {!visible.length&&<div className="seraPluginEmpty">{busy?tr("Loading users…"):tr("There are no users in this group.")}</div>}
        </div>
        <div className="adminDetail">
          {!selected?<div className="seraPluginEmpty">{tr("Select a user.")}</div>:<>
            <div className="adminIdentity">
              <div className="accountAvatar big">{(selected.name||selected.email||"U")[0].toUpperCase()}</div>
              <div><h3>{selected.name||tr("User")}</h3><p>{selected.email}</p><small>{selected.role==="owner"?"Owner":tr("User")} · {statusLabel(selected.status)} · {Number(selected.active_sessions||0)===1?tr("1 active session"):tr("{n} active sessions",{n:Number(selected.active_sessions||0)})}</small></div>
            </div>
            {selected.role!=="owner"&&<div className="adminApprovalActions">
              {selected.status!=="active"&&<button className="primary" onClick={()=>setStatus(selected,"active")} disabled={actionBusy}><Check size={15}/> {tr("Approve / Reactivate")}</button>}
              {selected.status!=="suspended"&&<button className="secondary" onClick={()=>setStatus(selected,"suspended")} disabled={actionBusy}>{tr("Suspend")}</button>}
              {selected.status!=="blocked"&&<button className="dangerButton" onClick={()=>setStatus(selected,"blocked")} disabled={actionBusy}>{tr("Block")}</button>}
              {selected.status==="pending"&&<button className="secondary" onClick={()=>setStatus(selected,"rejected")} disabled={actionBusy}><X size={15}/> Respinge</button>}
              <button className="secondary" onClick={()=>revokeSessions(selected)} disabled={actionBusy}>{tr("Close sessions")}</button>
            </div>}
            <div className="adminPermissionHead"><div><h4>{tr("Permissions")}</h4><p>{tr("Applied on the server for this account.")}</p></div></div>
            <div className="adminPermissions">
              {Object.entries(permissionLabels).map(([key,label])=>{
                const checked=selected.role==="owner"?true:selected.permissions?.[key]===true;
                const busyKey=!!pending[`${selected.id}:${key}`];
                return <label key={key} className={cx("adminPermission",selected.role==="owner"&&"locked")}>
                  <span><b>{tr(label,{brand:BRAND_NAME})}</b><small>{key}</small></span>
                  <input type="checkbox" checked={checked} disabled={selected.role==="owner"||busyKey} onChange={e=>togglePermission(selected,key,e.target.checked)}/>
                </label>;
              })}
            </div>
            {selected.role!=="owner"&&<>
              <div className="adminPermissionHead"><div><h4>{tr("AI models for this account")}</h4><p>{tr("«Default» follows the permissions above; «Allowed» opens the model even if the permissions keep it closed; «Blocked» closes it. The Owner's personal subscriptions stay the Owner's only.")}</p></div></div>
              {selected.permissions?.chat!==true&&<div className="adminModelHint" role="note">{tr("«Allowed» has no effect while «Chat AI» is off for this account: turn on the Chat permission above first.")}</div>}
              <input className="adminModelSearch" type="search" placeholder={tr("Search for a model…")} value={modelQuery} onChange={e=>setModelQuery(e.target.value)} aria-label={tr("Search for a model")}/>
              <div className="adminModels">
                {modelIds===null&&<div className="seraPluginEmpty">{tr("Loading the models…")}</div>}
                {modelIds!==null&&!modelIds.length&&<div className="seraPluginEmpty">{modelsError?tr("The model list could not be loaded: {error}",{error:modelsError}):tr("The model list is empty.")} <button type="button" className="secondary" onClick={()=>{setModelIds(null);setModelsError("");setModelsTry(n=>n+1)}}>{tr("Retry")}</button></div>}
                {[...new Set([...(modelIds||[]),...Object.keys(selected.permissions?.model_overrides||{})])].sort((a,b)=>a.localeCompare(b)).filter(m=>m.toLowerCase().includes(modelQuery.trim().toLowerCase())).slice(0,200).map(m=>{
                  const ov=Object.entries(selected.permissions?.model_overrides||{}).find(([k])=>k.toLowerCase()===m.toLowerCase())?.[1];
                  const mode=ov==="allow"||ov==="deny"?ov:"default",busyKey=!!pending[`${selected.id}:model:${m}`],personal=personalIds.has(m.toLowerCase());
                  return <div key={m} className={cx("adminModelRow",mode)}>
                    <span title={personal?`${m}: `+tr("your personal subscription stays yours only (the provider's terms do not allow sharing the account). Give the person the model through the API (openai/…, anthropic/…)."):m}>{m}{personal&&<small className="adminModelNote"> · {tr("Owner only")}</small>}</span>
                    <div className="adminModelModes" role="group" aria-label={`Acces la ${m}`}>
                      {[["default","Default"],["allow","Allowed"],["deny","Blocked"]].map(([v,label])=><button key={v} type="button" className={cx(mode===v&&"on")} aria-pressed={mode===v} disabled={busyKey||(personal&&v==="allow"&&mode!=="allow")} title={personal&&v==="allow"?tr("The Owner's personal subscriptions cannot be given to other accounts."):undefined} onClick={()=>mode!==v&&setModelMode(selected,m,v)}>{tr(label)}</button>)}
                    </div>
                  </div>;
                })}
              </div>
            </>}
          </>}
        </div>
      </div>
      <details className="adminAudit">
        <summary>{tr("Admin log ({n})",{n:auditRows.length})}</summary>
        <div className="adminAuditList">
          {auditRows.map((x,i)=><div key={x.id||i}><b>{AUDIT_LABELS[x.action]?tr(AUDIT_LABELS[x.action]):x.action}{x.details?.status?` · ${statusLabel(x.details.status)}`:""}</b><span>{x.actor_email||tr("system")} → {x.target_email||"—"}</span><small>{fmtTime(x.created_at)}</small></div>)}
          {!auditRows.length&&<div><span>{tr("No entries.")}</span></div>}
        </div>
      </details>
    </div>
  </ToolShell>;
}

function ExplorePanel({onClose,assistants,onUseAssistant,onImageMode,onOpenLibrary}) {
  const {can}=useAccess();
  const [mapQuery,setMapQuery]=useState(""),[site,setSite]=useState("");
  function openMap(provider){
    const q=mapQuery.trim();if(!q)return;
    openLink(provider==="osm"?`https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
  }
  function openSite(e){
    e?.preventDefault?.();
    let u=site.trim();if(!u)return;if(!/^https?:\/\//i.test(u))u=`https://${u}`;
    if(!isHttpUrl(u)){toast(tr("The address is not valid."));return;}
    openLink(u);
  }
  const imageOk=can("image_generation");
  return <ToolShell title={tr("Explore")} subtitle={tr("One place for maps, pictures, assistants and websites.")} onClose={onClose}>
    <div className="exploreGrid">
      <form className="exploreCard" onSubmit={e=>{e.preventDefault();openMap("google")}}><div className="exploreIcon"><MapIcon size={22}/></div><h3>{tr("Maps")}</h3><p>{tr("Look up an address, a town or a landmark.")}</p><input value={mapQuery} onChange={e=>setMapQuery(e.target.value)} placeholder={tr("An address or a town")} aria-label={tr("Place to look up")}/><div className="exploreActions"><button className="primary" disabled={!mapQuery.trim()}>Google Maps</button><button type="button" className="secondary" disabled={!mapQuery.trim()} onClick={()=>openMap("osm")}>OpenStreetMap</button></div></form>
      <section className="exploreCard"><div className="exploreIcon"><ImageIcon size={22}/></div><h3>{tr("Pictures")}</h3><p>{imageOk?tr("Start a conversation that makes a picture."):deniedMessage("image_generation")}</p><button className={cx("primary",!imageOk&&"locked")} onClick={onImageMode}>{tr("Make a picture")}</button><button className="secondary" onClick={()=>onOpenLibrary("image")}>{tr("Pictures in the Library")}</button></section>
      <section className="exploreCard wide"><div className="exploreIcon"><Bot size={22}/></div><h3>{tr("Assistants")}</h3><p>{tr("Pick an assistant for a new conversation.")}</p><div className="gptGrid">{assistants.map(a=><button key={a.id} className="gptCard" onClick={()=>onUseAssistant(a.id)}><span className="gptAvatar">{a.icon||a.name?.[0]||"A"}</span><span><b>{a.name}</b><small>{a.builtIn?tr("Main assistant"):tr("Custom assistant")}</small></span></button>)}{!assistants.length&&<div className="emptyState small">{tr("You have no assistants. Make one from the sidebar.")}</div>}</div></section>
      <form className="exploreCard" onSubmit={openSite}><div className="exploreIcon"><Globe2 size={22}/></div><h3>{tr("Websites")}</h3><p>{tr("Open a website in the browser.")}</p><div className="quickSites"><button type="button" onClick={()=>openLink("https://www.google.com")}>Google</button><button type="button" onClick={()=>openLink("https://www.wikipedia.org")}>Wikipedia</button><button type="button" onClick={()=>openLink("https://www.youtube.com")}>YouTube</button><button type="button" onClick={()=>openLink("https://github.com")}>GitHub</button></div><div className="siteOpen"><input value={site} onChange={e=>setSite(e.target.value)} placeholder="example.com" aria-label={tr("Website address")}/><button className="smallBtn" disabled={!site.trim()}><ExternalLink size={14}/> {tr("Open")}</button></div></form>
    </div>
  </ToolShell>;
}

function ConversationFilesPanel({conversation,onClose}) {
  const files=(conversation?.messages||[]).flatMap(m=>(m.attachments||[]).map(a=>({...a,fromAssistant:m.role==="assistant",createdAt:m.createdAt})));
  const [busy,setBusy]=useState(null);
  async function download(x,i){
    if(busy!==null)return;setBusy(i);
    try{if(x.fromAssistant&&x.id)await downloadGeneratedFile(x);else await downloadLibraryFile(x)}catch(e){toast(e.message)}finally{setBusy(null)}
  }
  return <ToolShell title={tr("Files in this conversation")} subtitle={tr("Every file attached or made in this conversation.")} onClose={onClose}>
    <div className="conversationFiles">{files.length===0?<div className="emptyState"><Paperclip size={28}/>{tr("There are no files in this conversation.")}</div>:files.map((x,i)=><div className="conversationFile" key={i}><FileText size={20}/><div><b>{x.name}</b><span>{x.fromAssistant?tr("Made by {brand}",{brand:BRAND_NAME}):tr("Attached by you")} · {kindLabel(x.kind||x.type||mediaKind(x.mime||x.mimeType,x.name),x.mime||x.mimeType,x.name)} · {fmtTime(x.createdAt)}</span></div>{(x.libraryId||x.id)&&<button className="smallBtn" onClick={()=>download(x,i)} disabled={busy!==null}><Download size={14}/> {busy===i?tr("Downloading…"):tr("Download")}</button>}</div>)}</div>
  </ToolShell>;
}
// Windows only: Settings shows saved keys masked, so this copies them for the server's setup script (aistoica.ro).
function ServerKeysBox() {
  const [state,setState]=useState({busy:false,text:"",bad:false});
  if(!window.Serasmart?.copyServerKeys)return null;
  async function run(){
    setState({busy:true,text:"",bad:false});
    try{
      const r=await window.Serasmart.copyServerKeys();
      const skipped=r?.skipped?.length?" "+tr("I did not copy {names}: they have characters the server does not accept.",{names:r.skipped.join(", ")}):"";
      setState({busy:false,bad:!r?.ok,text:r?.ok?tr(r.count===1?"I copied 1 key for the server. Paste it when the script on the server asks (right click). It is cleared from the clipboard in 2 minutes.":"I copied {n} keys for the server. Paste them when the script on the server asks (right click). They are cleared from the clipboard in 2 minutes.",{n:r.count})+skipped:(r?.error||tr("The keys could not be copied."))});
    }catch(e){setState({busy:false,bad:true,text:e.message})}
  }
  return <div className="providerTest">
    <div className="providerTestHead"><div><b>{tr("Keys for the server")}</b><span>{tr("Copies the keys saved on this PC, so the {domain} site has the same models.",{domain:BRAND_DOMAIN})}</span></div>
      <button className="secondary" onClick={run} disabled={state.busy}>{state.busy?tr("Copying…"):tr("Copy the keys for the server")}</button></div>
    {state.text&&<div className={cx("providerRow",state.bad?"bad":"good")}>{state.bad?<X size={15}/>:<Check size={15}/>}<span>{state.text}</span></div>}
  </div>;
}

// OmniRoute's connection names, as people know them.
const OMNI_CONNECTIONS={codex:"Codex (ChatGPT)","grok-cli":"Grok CLI",github:"GitHub Copilot","claude-code":"Claude Code",claude:"Claude Code","gemini-cli":"Gemini CLI",antigravity:"Antigravity","gemini-web":"Gemini Web","chatgpt-web":"ChatGPT Web"};
function ProviderTestBox() {
  const [state,setState]=useState({busy:false,data:null,media:[],omni:null,error:""});
  async function run(){
    setState({busy:true,data:null,media:[],omni:null,error:""});
    try{const d=await api("/api/providers/test",{method:"POST",body:"{}"});setState({busy:false,data:d.data||[],media:d.media||[],omni:d.omni||null,error:""})}
    catch(e){setState({busy:false,data:null,media:[],omni:null,error:e.message})}
  }
  return <div className="providerTest">
    <div className="providerTestHead"><div><b>{tr("Test the keys")}</b><span>{tr("Checks OmniRoute (the key and one Gemini, Grok, OpenAI and Claude model) and every saved API. Save the settings before testing.")}</span></div>
      <button className="secondary" onClick={run} disabled={state.busy}>{state.busy?tr("Testing…"):tr("Test now")}</button></div>
    {state.error&&<div className="providerRow bad"><X size={15}/><span>{state.error}</span></div>}
    {state.omni&&<div className={cx("providerRow",state.omni.ok?"good":"bad")}>{state.omni.ok?<Check size={15}/>:<X size={15}/>}<b>OmniRoute</b><span>{state.omni.ok?tr("the key works · {models} models, {combos} combinations · {s} s",{models:state.omni.models,combos:state.omni.combos,s:(state.omni.ms/1000).toFixed(1)}):state.omni.error}</span></div>}
    {state.omni?.expired?.length>0&&<div className="providerRow bad omniExpired"><X size={15}/><b>{tr("Reconnect in OmniRoute")}</b><span>{tr("The login expired for: {names}. OmniRoute panel on the server → Providers → each account → Reconnect (or add an API key).",{names:state.omni.expired.map(x=>OMNI_CONNECTIONS[x]||x).join(", ")})}</span></div>}
    {(state.omni?.checks||[]).map(c=><div key={c.model} className={cx("providerRow omniCheck",c.ok?"good":"bad")}>{c.ok?<Check size={15}/>:<X size={15}/>}<b>{c.model}</b><span>{c.ok?tr("answers · {s} s",{s:(c.ms/1000).toFixed(1)}):c.error||("HTTP "+c.status)}</span></div>)}
    {state.data&&!state.data.length&&!state.omni?.ok&&<div className="providerRow bad"><X size={15}/><span>{tr("No chat key is saved. Add, for example, a Gemini or Groq key and save.")}</span></div>}
    {(state.data||[]).map(x=><div key={x.provider} className={cx("providerRow",x.ok?"good":"bad")}>{x.ok?<Check size={15}/>:<X size={15}/>}<b>{x.label}</b><span>{x.model}{x.ok?` · ${(x.ms/1000).toFixed(1)} s`:` · ${x.error||("HTTP "+x.status)}`}{x.paid?" · "+tr("paid"):""}</span></div>)}
    {state.data&&state.media.length>0&&<div className="providerMedia">{tr("Pictures and video (not generated in the test, so no credit is used):")} {state.media.map(m=>`${m.label} ${m.configured?"✓":"—"}`).join(" · ")}</div>}
  </div>;
}
function FirstRunGuide({onDone,onOpenSettings}) {
  const [key,setKey]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  function openKeys(){openLink("https://aistudio.google.com/apikey")}
  async function saveAndTest(e){
    e?.preventDefault?.();
    const clean=key.trim();if(!clean){setStatus(tr("Paste the key first."));return}
    if(busy)return;
    setBusy(true);setStatus(tr("Saving the key and testing it…"));
    try{
      const saved=await window.Serasmart?.setConfig?.({geminiApiKey:clean});
      if(!saved)throw new Error(tr("Settings can only be saved from the {brand} app.",{brand:BRAND_NAME}));
      const d=await api("/api/providers/test",{method:"POST",body:"{}"});
      const gem=(d.data||[]).find(x=>x.provider==="gemini");
      if(!mounted.current)return;
      if(gem?.ok){setStatus(tr("Done! The key works."));setTimeout(()=>onDone(true),700)}
      else setStatus(tr("The key did not work: {error}",{error:gem?.error||tr("check that you copied all of it.")}));
    }catch(err){if(mounted.current)setStatus(err.message)}finally{if(mounted.current)setBusy(false)}
  }
  return <Modal title={tr("Welcome to {brand}",{brand:BRAND_NAME})} subtitle={tr("3 steps, free, no card. It takes a minute.")} className="modal firstRun" onClose={()=>onDone(false)}>
    <form onSubmit={saveAndTest}>
      <ol className="firstRunSteps">
        <li><b>{tr("Make a free Gemini key")}</b><span>{tr("The Google page opens. Press «Create API key» and copy it.")}</span><button type="button" className="secondary" onClick={openKeys}>{tr("Open the Google page")}</button></li>
        <li><b>{tr("Paste the key here")}</b><input value={key} onChange={e=>setKey(e.target.value)} placeholder="AIza…" aria-label={tr("Gemini key")} autoComplete="off"/></li>
        <li><b>{tr("Save and test")}</b><button className="primary" disabled={busy}>{busy?tr("Checking…"):tr("Save and test")}</button></li>
      </ol>
    </form>
    {status&&<div className="toolStatus" role="status">{status}</div>}
    <p className="settingsHelp">{tr("You can add other free APIs any time (Groq, Cerebras, Cloudflare for pictures) in Settings → AI APIs.")} <button type="button" className="linkBtn" onClick={onOpenSettings}>{tr("Open Settings")}</button></p>
  </Modal>;
}

function ProviderHead({name,id,cfg,children}) {
  const url=cfg?.providerKeyPages?.[id];
  return <div className="providerGroup"><div className="providerGroupTop"><b>{name}</b>{url&&<button type="button" className="providerKeyLink" onClick={()=>openLink(url)}>{tr("Get the free key")} <ExternalLink size={12}/></button>}</div><small>{children}</small></div>;
}
// Settings → API-uri AI: which companies' models the chat uses. Unticked = their models leave the list and never answer
// (not even as a fallback). Cerebras starts unticked.
const CHAT_FAMILIES=[["openai","OpenAI (ChatGPT, Codex)"],["anthropic","Claude (Anthropic, Claude Code)"],["gemini","Google Gemini"],["xai","Grok (xAI)"],["groq","Groq"],["cerebras","Cerebras"],["mistral","Mistral"],["openrouter","OpenRouter"],["nvidia","NVIDIA"],["github","GitHub Models"],["cloudflare","Cloudflare"],["cohere","Cohere"],["huggingface","Hugging Face"]];
function ProviderUseList({cfg,set}) {
  const blocked=new Set(String(cfg.blockedProviders??"cerebras").split(",").map(x=>x.trim()).filter(Boolean));
  const toggle=(id,on)=>{const next=new Set(blocked);if(on)next.delete(id);else next.add(id);set({blockedProviders:[...next].join(",")})};
  return <fieldset className="providerUse"><legend>{tr("Providers used in chat")}</legend>
    <p className="settingsHelp">{tr("Unticked: its models leave the list and never answer, not even as a fallback. OmniRoute combinations stay; you choose what they contain in the OmniRoute panel.")}</p>
    <div className="providerUseGrid">{CHAT_FAMILIES.map(([id,label])=><label key={id} className="providerUseItem"><input type="checkbox" checked={!blocked.has(id)} onChange={e=>toggle(id,e.target.checked)}/><span>{label}</span></label>)}</div>
  </fieldset>;
}
// Site accounts other than the Owner: every free model works for them; an OmniRoute combination only when shared here,
// since it may run on the Owner's subscriptions (Codex, Claude Code…), which their terms forbid sharing.
function SharedCombos({cfg,set}) {
  const [combos,setCombos]=useState(null);
  useEffect(()=>{let live=true;api("/api/models").then(ms=>{if(live)setCombos(Array.isArray(ms?.combos)?ms.combos.map(String):[])}).catch(()=>{if(live)setCombos([])});return()=>{live=false}},[]);
  const chosen=String(cfg.sharedCombos||"").split(",").map(x=>x.trim()).filter(Boolean);
  const has=name=>chosen.some(x=>x.toLowerCase()===name.toLowerCase());
  const toggle=(name,on)=>set({sharedCombos:(on?[...chosen.filter(x=>x.toLowerCase()!==name.toLowerCase()),name]:chosen.filter(x=>x.toLowerCase()!==name.toLowerCase())).join(",")});
  const names=[...new Set([...(combos||[]),...chosen])];
  return <fieldset className="providerUse"><legend>{tr("Combinations for every account")}</legend>
    <p className="settingsHelp">{tr("Other accounts use every free model (Gemini, Groq, Mistral, OpenRouter :free…). Your subscriptions (Codex, Claude Code, Copilot, Kiro, the web accounts) stay yours alone: their terms do not allow sharing the account. They use an OmniRoute combination only if you tick it here; tick only combinations made of free models.")}</p>
    {combos===null?<p className="settingsHelp">{tr("Loading the combinations…")}</p>:names.length?<div className="providerUseGrid">{names.map(name=><label key={name} className="providerUseItem"><input type="checkbox" checked={has(name)} onChange={e=>toggle(name,e.target.checked)}/><span>{name}</span></label>)}</div>:<p className="settingsHelp">{tr("OmniRoute has no combinations yet.")}</p>}
  </fieldset>;
}
// Poze / Video → «Făcute de» (0.7.24): every maker by default, best first; a list keeps only those. OpenAI makes no video
// any more (Sora closed on 24 September 2026).
const MEDIA_MAKERS={
  image:[["","All, the best first (ChatGPT, Gemini, Grok, free ones)"],["openai","ChatGPT only · GPT Image"],["gemini","Gemini only · Nano Banana"],["gemini,openai,xai","ChatGPT, Gemini and Grok"]],
  video:[["","All, the best first (free ones, Gemini Veo, Grok)"],["gemini","Gemini only · Veo"],["gemini,xai","Gemini and Grok"]]
};
const GEMINI_MEDIA_MODELS={
  image:[["gemini-3.1-flash-image","Nano Banana 2 · gemini-3.1-flash-image"],["gemini-3-pro-image-preview","Nano Banana Pro · gemini-3-pro-image-preview"],["gemini-2.5-flash-image","Nano Banana · gemini-2.5-flash-image"]],
  video:[["veo-3.1-fast-generate-preview","Veo 3.1 Fast · veo-3.1-fast-generate-preview"],["veo-3.1-generate-preview","Veo 3.1 · veo-3.1-generate-preview"],["veo-3.0-fast-generate-001","Veo 3 Fast · veo-3.0-fast-generate-001"]]
};
function MediaMakers({kind,cfg,set,paidOff}) {
  const field=kind==="image"?"imageProviders":"videoProviders",modelField=kind==="image"?"geminiImageModel":"geminiVideoModel";
  const value=String(cfg[field]??"").split(",").map(x=>x.trim().toLowerCase()).filter(x=>x&&!(kind==="video"&&x==="openai")).join(",");
  const options=MEDIA_MAKERS[kind].some(([v])=>v===value)?MEDIA_MAKERS[kind]:[...MEDIA_MAKERS[kind],[value,tr("Your choice: {value}",{value})]];
  const model=String(cfg[modelField]||GEMINI_MEDIA_MODELS[kind][0][0]);
  const models=GEMINI_MEDIA_MODELS[kind].some(([v])=>v===model)?GEMINI_MEDIA_MODELS[kind]:[...GEMINI_MEDIA_MODELS[kind],[model,model]];
  const geminiOnly=value==="gemini";
  return <fieldset className="providerUse"><legend>{kind==="image"?tr("Pictures made by"):tr("Videos made by")}</legend>
    <label>{tr("Providers")}<select value={value} onChange={e=>set({[field]:e.target.value})}>{options.map(([v,l])=><option key={v||"all"} value={v}>{tr(l)}</option>)}</select></label>
    <label>{kind==="image"?tr("Gemini model (Nano Banana)"):tr("Gemini model (Veo)")}<select value={model} onChange={e=>set({[modelField]:e.target.value})}>{models.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <p className="settingsHelp">{geminiOnly
      ?tr("Gemini only: through Gemini connected in OmniRoute (subscription, no API) or through the Gemini key under AI APIs. The other providers below are not used.")+(paidOff?" "+tr("Gemini through the API is paid: to use it with the key, choose «Allow paid providers» below."):"")
      :tr("If the chosen Gemini model does not exist for your key, {brand} tries the other Gemini names on its own, then the providers allowed here.",{brand:BRAND_NAME})}
      {" "}{kind==="image"?tr("Under the message box, in Picture mode, you can choose each time who makes it. On «Automatic», when you picked a Gemini, ChatGPT or Grok model in the chat, that model's company makes the picture (first the subscription in OmniRoute, then its API); otherwise this setting is used."):tr("Under the message box, in Video mode, you can choose each time who makes it. On «Automatic», when you picked a Gemini or Grok model in the chat, that model's company makes the video (first the subscription in OmniRoute, then its API); otherwise this setting is used.")}</p>
  </fieldset>;
}
function KeyField({label,name,cfg,keys,setKeys,placeholder,token=false}) {
  const pending=keys[name]||"",clearing=pending==="__CLEAR__",saved=!!cfg?.[name];
  const savedText=token?tr("Token saved — leave empty to keep it"):tr("Key saved — leave empty to keep it");
  return <label>{label}<span className="keyRow">
    <input type="password" value={clearing?"":pending} disabled={clearing} onChange={e=>setKeys(k=>({...k,[name]:e.target.value}))} placeholder={clearing?tr("It will be deleted when you save"):saved?savedText:placeholder} autoComplete="off"/>
    {saved&&(clearing
      ?<button type="button" className="smallBtn" onClick={()=>setKeys(k=>({...k,[name]:""}))}>{tr("Cancel")}</button>
      :<button type="button" className="smallBtn dangerSmall" onClick={()=>setKeys(k=>({...k,[name]:"__CLEAR__"}))} title={token?tr("Delete the saved token"):tr("Delete the saved key")}>{tr("Delete")}</button>)}
  </span></label>;
}

// On the web site the Owner's settings live on the server (/api/server/settings, lib/serversettings.cjs); in Windows,
// in the app (Electron). Both answer the same shape, so the same Settings window serves both.
// 0.7.31: where the Owner registers the OAuth app of the apps that let in only registered ones.
const OWNER_APP_WHERE={
  lovable:"Workspace settings → API keys & OAuth → OAuth clients → New OAuth client, type «Web server», scopes offline, projects and workspaces",
  asana:"app.asana.com/0/my-apps → create an MCP app",
  hubspot:"Development → MCP Connectors → Create MCP connector",
  box:"Admin Console → Integrations → Box MCP server → Configure → Add Integration Credentials"
};
const WEB_SETTINGS={
  getConfig:async()=>(await api("/api/server/settings")).data,
  setConfig:async(payload)=>{const r=await api("/api/server/settings",{method:"PUT",body:JSON.stringify(payload)});return {ok:true,config:r.config};}
};
// The tabs every account has (0.7.23): saved for the account on the server, each with its own buttons.
const ACCOUNT_TABS=["profile","notify","privacy","security","billing","usage"];
function SettingsModal({onOpenTool,onLogoutAll,onClose,onSaved,user,machineSettingsAllowed=true,initialTab="general",preferences,onPreferences,prefBusy,models=[],onAccountDeleted,onDataDeleted}) {
  const {isOwner}=useAccess();
  const bridge=window.Serasmart?.getConfig?window.Serasmart:IS_WEB&&isOwner?WEB_SETTINGS:null;
  const webServer=bridge===WEB_SETTINGS;
  // Without machine settings (an account on the site that is not the Owner) only the account's own tabs are shown.
  const accountOnly=!bridge;
  const account=useAccountSettings();
  const [cfg,setCfg]=useState(null),[keys,setKeys]=useState({}),[tab,setTab]=useState(accountOnly&&!ACCOUNT_TABS.includes(initialTab)?"profile":initialTab),[status,setStatus]=useState(null),[micStatus,setMicStatus]=useState(""),[toolStatus,setToolStatus]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false),[updateStatus,setUpdateStatus]=useState("");
  // 0.7.39 (asked by the Owner: "settings like Claude's"): on a phone the settings are a full-screen list; a section
  // opens on its own screen with a back arrow. On a computer the menu stays on the left and the section on the right.
  const [detail,setDetail]=useState(typeof initialTab==="string"&&initialTab!=="profile"&&initialTab!=="general");
  const {ref,backdropProps}=useModal(onClose);
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  useEffect(()=>{
    if(!bridge)return;
    Promise.all([bridge.getConfig(),bridge.systemStatus?.().catch(()=>null)])
      .then(([c,s])=>{if(mounted.current){setCfg(c||{});setStatus(s)}})
      .catch(e=>{if(mounted.current)setError(tr("Could not read the settings:")+" "+e.message)});
  },[]);
  useEffect(()=>{if(!machineSettingsAllowed&&["ai","chatapis","images","video"].includes(tab))setTab("general")},[machineSettingsAllowed,tab]);
  const set=patch=>setCfg(c=>({...c,...patch}));
  async function save(){
    if(saving||!cfg)return;
    setError("");
    const gw=webServer?GATEWAY:cleanGatewayUrl(cfg.gatewayUrl||DEFAULT_GATEWAY);
    if(machineSettingsAllowed&&!gw){setError(tr("The local service address is not valid. Example: {url}",{url:DEFAULT_GATEWAY}));setTab("ai");return;}
    const ownerEmail=String(cfg.ownerEmail||"").trim().toLowerCase();
    if(machineSettingsAllowed&&!webServer&&ownerEmail&&!/^\S+@\S+\.\S+$/.test(ownerEmail)){setError(tr("The Owner email is not valid."));setTab("account");return;}
    setSaving(true);
    try{
      if(machineSettingsAllowed&&gw!==GATEWAY){
        try{const r=await fetch(`${gw}/health`,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error("HTTP "+r.status)}
        catch{throw new Error(tr("I cannot reach the {brand} service at {url}. Check the address or use {local}.",{brand:BRAND_NAME,url:gw,local:DEFAULT_GATEWAY}))}
      }
      const changedKeys=Object.fromEntries(Object.entries(keys).filter(([,v])=>v));
      const payload={...cfg,...(machineSettingsAllowed&&!webServer?{gatewayUrl:gw,ownerEmail}:{}),...changedKeys};
      const r=await bridge.setConfig(payload);
      if(r&&r.ok===false)throw new Error(r.error||tr("The settings could not be saved."));
      if(machineSettingsAllowed&&!webServer)setGatewayUrl(gw);
      DICTATION_LANG=String(payload.speechLanguage||"ro");
      onSaved?.(r?.config||payload);
      toast(tr("Settings saved."),"ok");
      onClose();
    }catch(e){if(mounted.current)setError(e.message)}
    finally{if(mounted.current)setSaving(false)}
  }
  async function testMic(){setMicStatus(tr("Checking…"));try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());setMicStatus(tr("Microphone available and allowed ✓"))}catch{setMicStatus(tr("Microphone unavailable or not allowed"))}}
  async function testServer(){setToolStatus(tr("Testing the SSH connection…"));try{const d=await api("/api/tools/server/check",{method:"POST",body:JSON.stringify({serverHost:cfg.serverHost,serverPort:cfg.serverPort,serverUser:cfg.serverUser,serverKeyPath:cfg.serverKeyPath})});setToolStatus(d?.output||tr("Server connected ✓"))}catch(e){setToolStatus("Server: "+e.message)}}
  async function checkUpdate(){
    if(!window.Serasmart?.checkUpdate)return;
    setUpdateStatus(tr("Looking for updates…"));
    try{const r=await window.Serasmart.checkUpdate();setUpdateStatus(!r?.ok?tr("Could not check:")+" "+(r?.error||tr("error")):r.available===false||!r.version?tr("You have the latest version."):r.available===true?tr("Version {v} is available. It downloads on its own; you get a notification when it is ready.",{v:r.version}):tr("Latest published version: {v}.",{v:r.version}))}
    catch(e){setUpdateStatus(tr("Could not check:")+" "+e.message)}
  }
  const keyProps={cfg,keys,setKeys};
  // The site's server allows paid pictures when nothing was chosen (no imageCostPolicy in .env); Windows saves "free_only".
  const imageCost=cfg?.imageCostPolicy||(webServer?"allow_paid":"free_only");
  // 0.7.35: the settings in groups, like Claude's: the account first, then this computer / the server (Owner), then
  // Extensions. Billing, Usage, Memory and the Extensions items open their own pages.
  const machineGroup=webServer?"Server":"This computer";
  const tabs=[["profile",UserCircle,"General",true,""],["security",KeyRound,"Account",true,""],["privacy",ShieldCheck,"Privacy",true,""],["notify",Bell,"Notifications",true,""],
    ["billing",CreditCard,"Billing",true,""],["usage",Gauge,"Usage",true,""],["@memory",Brain,"Memory",!!onOpenTool,"",()=>onOpenTool("memory")],
    ["general",SlidersHorizontal,"App",!!bridge,machineGroup],["ai",Bot,"AI & OmniRoute",machineSettingsAllowed&&!!bridge,machineGroup],["chatapis",Plug,"AI APIs",machineSettingsAllowed&&!!bridge,machineGroup],["images",ImageIcon,"Pictures",machineSettingsAllowed&&!!bridge,machineGroup],["video",Play,"Video",machineSettingsAllowed&&!!bridge,machineGroup],["voice",Volume2,"Voice and microphone",!!bridge,machineGroup],["account",HardDrive,"Owner on this PC",machineSettingsAllowed&&!webServer&&!!bridge,machineGroup],
    ["@skills",Sparkles,"Skills",!!onOpenTool,"Extensions",()=>onOpenTool("extensions","skills")],["@connectors",Plug,"Connectors",!!onOpenTool,"Extensions",()=>onOpenTool("extensions","connectors")],["@plugins",Puzzle,"Plugins",!!onOpenTool,"Extensions",()=>onOpenTool("extensions","plugins")]];
  const onAccountTab=accountOnly||ACCOUNT_TABS.includes(tab);
  return <div className="modalBackdrop" {...backdropProps}><div className={detail?"settingsModal showDetail":"settingsModal"} ref={ref} role="dialog" aria-modal="true" aria-label={tr("{brand} settings",{brand:BRAND_NAME})} tabIndex={-1}><div className="modalHead"><div><h2>{tr("{brand} settings",{brand:BRAND_NAME})}</h2><p>{accountOnly?tr("Your profile, how the AI answers you, notifications, privacy and security."):tr("Your account, the app, voice, the AI services and updates.")}</p></div><button className="iconOnly" onClick={onClose} aria-label={tr("Close")} title={tr("Close")}><X size={20}/></button></div>
    {!cfg&&!onAccountTab?<div className="settingsLoading">{error||tr("Loading the settings…")}{error&&<ServerUpdate/>}</div>:<>
    <div className="settingsBody"><div className="settingsNav" role="tablist" aria-orientation="vertical">
      {tabs.filter(t=>t[3]).map(([k,Icon,label,,group,go],i,list)=><React.Fragment key={k}>
        {group&&group!==list[i-1]?.[4]&&<div className="settingsNavGroup">{tr(group)}</div>}
        {go?<button className="navLink" onClick={()=>{onClose();go()}}><Icon size={17}/> <span>{tr(label)}</span><ChevronRight className="navChevron" size={16} aria-hidden="true"/></button>
          :<button role="tab" aria-selected={tab===k} className={tab===k?"active":""} onClick={()=>{setTab(k);setDetail(true)}}><Icon size={17}/> <span>{tr(label)}</span><ChevronRight className="navChevron" size={16} aria-hidden="true"/></button>}
      </React.Fragment>)}
    </div>
    <div className="settingsPane">
      <div className="settingsPaneHead"><button className="iconOnly" onClick={()=>setDetail(false)} aria-label={tr("Back")} title={tr("Back")}><ChevronLeft size={22}/></button><b>{tr((tabs.find(t=>t[0]===tab)||[])[2]||"Settings")}</b><button className="iconOnly" onClick={onClose} aria-label={tr("Close")} title={tr("Close")}><X size={20}/></button></div>
      {tab==="billing"&&<BillingPage embedded onUsage={()=>setTab("usage")}/>}
      {tab==="usage"&&<UsagePage embedded onBilling={()=>setTab("billing")}/>}
      {tab==="profile"&&<ProfileTab account={account} models={models} preferences={preferences} onPreferences={onPreferences} prefBusy={prefBusy}/>}
      {tab==="privacy"&&<PrivacyTab account={account} onDataDeleted={onDataDeleted}/>}
      {tab==="security"&&<SecurityTab account={account} onAccountDeleted={onAccountDeleted} onLogoutAll={onLogoutAll}/>}
      {tab==="general"&&cfg&&<><h3>{tr("App")}</h3>
        {!IS_WEB&&<>
        <label className="toggleRow"><div><b>{tr("Start {brand} with Windows",{brand:BRAND_NAME})}</b><span>{tr("The app starts on its own and can stay in the background.")}</span></div><input type="checkbox" checked={!!cfg.startWithWindows} onChange={e=>set({startWithWindows:e.target.checked})}/></label>
        <label className="toggleRow"><div><b>{tr("Close to the notification area")}</b><span>{tr("The X button hides the app without stopping the services.")}</span></div><input type="checkbox" checked={cfg.closeToTray!==false} onChange={e=>set({closeToTray:e.target.checked})}/></label>
        <label className="toggleRow"><div><b>{tr("Automatic updates (Windows app)")}</b><span>{tr("At start, {brand} downloads the new version from GitHub Releases on its own and tells you when it is ready to install.",{brand:BRAND_NAME})}</span></div><input type="checkbox" checked={cfg.autoUpdate!==false} onChange={e=>set({autoUpdate:e.target.checked})}/></label>
        {window.Serasmart?.checkUpdate&&<div className="settingsButtons"><button type="button" className="secondary" onClick={checkUpdate}><RotateCcw size={15}/> {tr("Check for updates now")}</button></div>}
        {updateStatus&&<div className="micStatus" role="status">{updateStatus}</div>}
        </>}
        <ServerUpdate/>
      </>}
      {tab==="ai"&&cfg&&<><h3>{tr("AI & OmniRoute")}</h3>
        {webServer&&<p className="settingsHelp">{tr("The site's settings: saved on the server and applied at once for every account. The keys stay on the server and are only shown masked. The Owner email and sign-ups stay in the .env file on the server.")}</p>}
        {!webServer&&<>
        <label>{tr("{brand} service address",{brand:BRAND_NAME})}<input value={cfg.gatewayUrl||DEFAULT_GATEWAY} onChange={e=>set({gatewayUrl:e.target.value})} placeholder={DEFAULT_GATEWAY}/></label>
        <p className="settingsHelp">{tr("Leave {url} unless you use a separate {brand} server. The address is checked before saving.",{url:DEFAULT_GATEWAY,brand:BRAND_NAME})}</p>
        <label>{BRAND_SHORT} Cloud API<input value={cfg.controlApiUrl||""} onChange={e=>set({controlApiUrl:e.target.value})} placeholder="https://api.aistoica.ro"/></label>
        <p className="settingsHelp">{tr("With the Cloud API set, the Owner manages accounts, approvals and permissions centrally. Leave it empty to use this PC only.")}</p>
        </>}
        <label>{tr("OmniRoute address")}<input value={cfg.baseUrl||""} onChange={e=>set({baseUrl:e.target.value})}/></label>
        <KeyField label={tr("OmniRoute API key")} name="apiKey" placeholder={tr("OmniRoute key")} {...keyProps}/>
        <p className="settingsHelp">{tr("OmniRoute 3.8 does not answer without a key. Create it in OmniRoute:")} <button type="button" className="linkBtn" onClick={()=>openLink(String(cfg.baseUrl||"http://127.0.0.1:20128/v1").replace(/\/v1\/?$/,"")+"/dashboard/api-manager")}>API Manager → Create API Key</button>{tr(", paste it here and press «Test the keys».")}</p>
        <label><span className="labelLine">{tr("Preferred model")} <span className="optional">{tr("used when you did not pick another in the list at the top")}</span></span><input value={cfg.model||""} onChange={e=>set({model:e.target.value})} placeholder={tr("E.g. gemini/gemini-3.5-flash")}/></label>
        <label><span className="labelLine">{tr("Picture model")} <span className="optional">{tr("optional")}</span></span><input value={cfg.imageModel||""} onChange={e=>set({imageModel:e.target.value})} placeholder={tr("Automatic — the first picture model available")}/></label>
        <details className="mediaProviderSettings"><summary>{isOwner?tr("Live internet, GitHub and server"):tr("Live internet and GitHub")}</summary>
          <p className="settingsHelp">{tr("These tools let {brand} check current information and bring relevant parts of a GitHub repository.",{brand:BRAND_NAME})} {isOwner?tr("Running code and SSH are for the Owner only."):tr("Running code, GitHub Solve and SSH are for the Owner account only (see «Owner email on this PC»).")}</p>
          <label className="toggleRow"><div><b>{tr("Real-time internet")}</b><span>{tr("Searches current sources on its own for questions about recent information, versions and APIs.")}</span></div><input type="checkbox" checked={cfg.webSearchEnabled!==false} onChange={e=>set({webSearchEnabled:e.target.checked})}/></label>
          <label className="toggleRow"><div><b>{tr("Context across the project's chats")}</b><span>{tr("Uses the relevant chats of the same project without copying them by hand.")}</span></div><input type="checkbox" checked={cfg.projectContextEnabled!==false} onChange={e=>set({projectContextEnabled:e.target.checked})}/></label>
          <label className="toggleRow"><div><b>{tr("Search GitHub automatically")}</b><span>{tr("For code questions, looks for relevant files in the repository before answering.")}</span></div><input type="checkbox" checked={cfg.githubAutoContext!==false} onChange={e=>set({githubAutoContext:e.target.checked})}/></label>
          <label>GitHub repository<input value={cfg.githubRepo||""} onChange={e=>set({githubRepo:e.target.value})} placeholder="owner/repository"/></label>
          <label>GitHub branch<input value={cfg.githubBranch||"main"} onChange={e=>set({githubBranch:e.target.value})} placeholder="main"/></label>
          <KeyField label={tr("GitHub token (for a private repository)")} name="githubToken" placeholder={tr("github_pat_... or ghp_...")} token {...keyProps}/>
          {isOwner&&!webServer&&<>
            <label>{tr("SSH server · address")}<input value={cfg.serverHost||""} onChange={e=>set({serverHost:e.target.value})} placeholder={tr("IP or domain")}/></label>
            <div className="claudeFormRow"><label>{tr("SSH user")}<input value={cfg.serverUser||"root"} onChange={e=>set({serverUser:e.target.value})}/></label><label>Port SSH<input type="number" min="1" max="65535" value={cfg.serverPort||22} onChange={e=>set({serverPort:Number(e.target.value)||22})}/></label></div>
            <label>{tr("SSH private key path")}<input value={cfg.serverKeyPath||""} onChange={e=>set({serverKeyPath:e.target.value})} placeholder={tr("C:\\Users\\you\\.ssh\\id_ed25519")}/></label>
            <button type="button" className="secondary testMicBtn" onClick={testServer}>{tr("Test the server")}</button>{toolStatus&&<div className="micStatus" role="status">{toolStatus}</div>}
          </>}
        </details>
        <p className="settingsHelp">{tr("When you ask for a picture or a video, {brand} puts the real file in the chat, with a download button.",{brand:BRAND_NAME})}</p>
        {!webServer&&<>
        <label>{tr("OmniRoute command")}<input value={cfg.omniCommand||"omniroute.cmd"} onChange={e=>set({omniCommand:e.target.value})}/></label>
        <label className="toggleRow"><div><b>{tr("Start OmniRoute automatically")}</b><span>{tr("If the service stops, {brand} tries to restart it.",{brand:BRAND_NAME})}</span></div><input type="checkbox" checked={!!cfg.autoStartOmniRoute} onChange={e=>set({autoStartOmniRoute:e.target.checked})}/></label>
        <div className="statusGrid"><div><span>{tr("{brand} service",{brand:BRAND_NAME})}</span><b>{status?.gatewayRunning?tr("Running"):tr("Unavailable")}</b></div><div><span>OmniRoute</span><b>{status?.omniRunning?tr("Connected"):status?.omniInstalled===false?tr("Not installed — npm install -g omniroute"):tr("Unavailable")}</b></div></div>
        </>}
      </>}
      {tab==="chatapis"&&cfg&&<><div className="settingsSectionTitle"><div className="settingsSectionIcon"><Plug size={22}/></div><div><h3>{tr("AI APIs")}</h3><p>{tr("Their models appear in the list and answer directly, without OmniRoute.")}</p></div></div>
        <ProviderTestBox/>
        <ServerKeysBox/>
        <label className="toggleRow"><div><b>{tr("Use the direct APIs")}</b><span>{tr("Their models appear in the list (Groq, Gemini, Cerebras…). They answer when you pick them or when no model is picked.")}</span></div><input type="checkbox" checked={cfg.directChatEnabled!==false} onChange={e=>set({directChatEnabled:e.target.checked})}/></label>
        <label className="toggleRow"><div><b>{tr("Automatic fallback")}</b><span>{tr("If the chosen model does not answer, it moves to the direct APIs on its own. Off: only the chosen model answers, otherwise you see the error.")}</span></div><input type="checkbox" checked={cfg.chatFallbackOnFailure===true} onChange={e=>set({chatFallbackOnFailure:e.target.checked})}/></label>
        <ProviderUseList cfg={cfg} set={set}/>
        {(webServer||cfg.controlApiUrl)&&<SharedCombos cfg={cfg} set={set}/>}
        <label>{tr("Cost protection")}<select value={cfg.directChatCostPolicy||"free_only"} onChange={e=>set({directChatCostPolicy:e.target.value})}><option value="free_only">{tr("Only providers with no direct cost")}</option><option value="allow_paid">{tr("Also allow the paid APIs (OpenAI, Grok)")}</option></select></label>
        <label>{tr("Order to try")}<input value={cfg.directChatProviderOrder||"cerebras,groq,gemini,mistral,nvidia,github,openrouter,cloudflare,cohere,huggingface,openai,xai"} onChange={e=>set({directChatProviderOrder:e.target.value})}/></label>
        <p className="settingsHelp">{tr("Every model in these lists appears in the model list at the top. If the key is missing, or the provider answers 429/404/503 or not at all, {brand} tries the next model, then the next provider.",{brand:BRAND_NAME})}</p>
        <ProviderHead name="Cerebras" id="cerebras" cfg={cfg}>{tr("OpenAI compatible.")}</ProviderHead>
        <KeyField label={tr("Cerebras API key")} name="cerebrasApiKey" placeholder="csk-..." {...keyProps}/>
        <label>{tr("Cerebras models · separated by commas")}<input value={cfg.cerebrasModel||""} onChange={e=>set({cerebrasModel:e.target.value})}/></label>
        <ProviderHead name="Groq" id="groq" cfg={cfg}>{tr("OpenAI compatible, fast answers.")}</ProviderHead>
        <KeyField label={tr("Groq API key")} name="groqApiKey" placeholder="gsk_..." {...keyProps}/>
        <label>{tr("Groq models · separated by commas")}<input value={cfg.groqModel||""} onChange={e=>set({groqModel:e.target.value})}/></label>
        <ProviderHead name="Gemini" id="gemini" cfg={cfg}>{tr("Tries the models in order until one has quota left.")}</ProviderHead>
        <KeyField label={tr("Gemini API key")} name="geminiApiKey" placeholder="AIza..." {...keyProps}/>
        <label>{tr("Gemini models · separated by commas")}<input value={cfg.geminiModels||""} onChange={e=>set({geminiModels:e.target.value})}/></label>
        <ProviderHead name="Mistral" id="mistral" cfg={cfg}>{tr("OpenAI compatible.")}</ProviderHead>
        <KeyField label={tr("Mistral API key")} name="mistralApiKey" placeholder={tr("API key")} {...keyProps}/>
        <label>{tr("Mistral models · separated by commas")}<input value={cfg.mistralModel||""} onChange={e=>set({mistralModel:e.target.value})}/></label>
        <ProviderHead name="NVIDIA" id="nvidia" cfg={cfg}>{tr("NVIDIA API / NIM, OpenAI compatible.")}</ProviderHead>
        <KeyField label={tr("NVIDIA API key")} name="nvidiaApiKey" placeholder="nvapi-..." {...keyProps}/>
        <label>{tr("NVIDIA models · separated by commas")}<input value={cfg.nvidiaModel||""} onChange={e=>set({nvidiaModel:e.target.value})}/></label>
        <ProviderHead name="GitHub Models" id="github" cfg={cfg}>{tr("A fine-grained token with the Models: Read permission. The same token is used for GitHub.")}</ProviderHead>
        <KeyField label="Token GitHub" name="githubToken" placeholder="github_pat_..." token {...keyProps}/>
        <label>{tr("GitHub models · separated by commas")}<input value={cfg.githubModelsModel||""} onChange={e=>set({githubModelsModel:e.target.value})}/></label>
        <ProviderHead name="OpenRouter" id="openrouter" cfg={cfg}>{tr("AUTO_FREE finds the first free model available on its own.")}</ProviderHead>
        <KeyField label={tr("OpenRouter API key")} name="openRouterApiKey" placeholder="sk-or-..." {...keyProps}/>
        <label>{tr("OpenRouter model")}<input value={cfg.openRouterChatModel||"AUTO_FREE"} onChange={e=>set({openRouterChatModel:e.target.value})}/></label>
        <ProviderHead name="Cloudflare Workers AI" id="cloudflare" cfg={cfg}>{tr("A token with the «Workers AI» template. The Account ID is in dash.cloudflare.com → AI → Workers AI. The same token as for Pictures.")}</ProviderHead>
        <label>Cloudflare Account ID<input value={cfg.cloudflareAccountId||""} onChange={e=>set({cloudflareAccountId:e.target.value})}/></label>
        <KeyField label={tr("Cloudflare API token")} name="cloudflareApiToken" placeholder={tr("API token")} token {...keyProps}/>
        <label>{tr("Cloudflare models · separated by commas")}<input value={cfg.cloudflareChatModel||""} onChange={e=>set({cloudflareChatModel:e.target.value})}/></label>
        <ProviderHead name="Cohere" id="cohere" cfg={cfg}>{tr("Compatibility API.")}</ProviderHead>
        <KeyField label={tr("Cohere API key")} name="cohereApiKey" placeholder={tr("API key")} {...keyProps}/>
        <label>{tr("Cohere models · separated by commas")}<input value={cfg.cohereModel||""} onChange={e=>set({cohereModel:e.target.value})}/></label>
        <ProviderHead name="Hugging Face" id="huggingface" cfg={cfg}>{tr("OpenAI-compatible router; the same token as in Pictures.")}</ProviderHead>
        <KeyField label="Token Hugging Face" name="hfToken" placeholder="hf_..." token {...keyProps}/>
        <label>{tr("Hugging Face models · separated by commas")}<input value={cfg.huggingFaceChatModel||""} onChange={e=>set({huggingFaceChatModel:e.target.value})}/></label>
        <ProviderHead name="OpenAI" id="openai" cfg={cfg}>{tr("Included, but blocked by cost protection by default.")}</ProviderHead>
        <KeyField label={tr("OpenAI API key")} name="openAiApiKey" placeholder="sk-..." {...keyProps}/>
        <label>{tr("OpenAI models · separated by commas")}<input value={cfg.openAiChatModels||""} onChange={e=>set({openAiChatModels:e.target.value})}/></label>
        <ProviderHead name="Grok (xAI)" id="xai" cfg={cfg}>{tr("Paid per use; the same key also makes Grok Imagine pictures and videos. Turn it on with «Also allow the paid APIs».")}</ProviderHead>
        <KeyField label={tr("xAI API key")} name="xaiApiKey" placeholder="xai-..." {...keyProps}/>
        <label>{tr("Grok models · separated by commas")}<input value={cfg.xaiModels||""} onChange={e=>set({xaiModels:e.target.value})} placeholder="grok-4.6,grok-4.3"/></label>
        <ProviderHead name={tr("Google apps (Gmail, Drive, Calendar, Docs, Sheets)")} id="google-apps" cfg={cfg}>{tr("For connecting Google apps in Apps: an OAuth client of type «Web application» from Google Cloud, with this return address: {url}",{url:`${webServer?window.location.origin:"http://127.0.0.1:8787"}/api/connectors/oauth/callback`})}</ProviderHead>
        <label>{tr("Google OAuth client ID")}<input value={cfg.googleClientId||""} onChange={e=>set({googleClientId:e.target.value})} placeholder="….apps.googleusercontent.com"/></label>
        <KeyField label={tr("Google OAuth client secret")} name="googleClientSecret" placeholder="GOCSPX-..." {...keyProps}/>
        <ProviderHead name={tr("GitHub sign-in for everyone")} id="github-apps" cfg={cfg}>{tr("Optional: a GitHub OAuth App (GitHub → Settings → Developer settings) with this callback URL: {url}. Without it, GitHub connects with a personal token.",{url:`${webServer?window.location.origin:"http://127.0.0.1:8787"}/api/connectors/oauth/callback`})}</ProviderHead>
        <label>{tr("GitHub OAuth client ID")}<input value={cfg.githubClientId||""} onChange={e=>set({githubClientId:e.target.value})} placeholder="Ov23li…"/></label>
        <KeyField label={tr("GitHub OAuth client secret")} name="githubClientSecret" placeholder="…" {...keyProps}/>
        <ProviderHead name={tr("Lovable sign-in for everyone")} id="lovable-apps" cfg={cfg}>{tr("Lovable lets in only OAuth apps its owner registered. Make one in Lovable ({where}) with this return address: {url}",{where:tr(OWNER_APP_WHERE.lovable),url:`${webServer?window.location.origin:"http://127.0.0.1:8787"}/api/connectors/oauth/callback`})}</ProviderHead>
        <label>{tr("Lovable OAuth client ID")}<input value={cfg.lovableClientId||""} onChange={e=>set({lovableClientId:e.target.value})}/></label>
        <KeyField label={tr("Lovable OAuth client secret")} name="lovableClientSecret" placeholder="…" {...keyProps}/>
        <ProviderHead name={tr("Asana sign-in for everyone")} id="asana-apps" cfg={cfg}>{tr("Asana lets in only OAuth apps its owner registered. Make one in Asana ({where}) with this return address: {url}",{where:tr(OWNER_APP_WHERE.asana),url:`${webServer?window.location.origin:"http://127.0.0.1:8787"}/api/connectors/oauth/callback`})}</ProviderHead>
        <label>{tr("Asana OAuth client ID")}<input value={cfg.asanaClientId||""} onChange={e=>set({asanaClientId:e.target.value})}/></label>
        <KeyField label={tr("Asana OAuth client secret")} name="asanaClientSecret" placeholder="…" {...keyProps}/>
        <ProviderHead name={tr("HubSpot sign-in for everyone")} id="hubspot-apps" cfg={cfg}>{tr("HubSpot lets in only OAuth apps its owner registered. Make one in HubSpot ({where}) with this return address: {url}",{where:tr(OWNER_APP_WHERE.hubspot),url:`${webServer?window.location.origin:"http://127.0.0.1:8787"}/api/connectors/oauth/callback`})}</ProviderHead>
        <label>{tr("HubSpot OAuth client ID")}<input value={cfg.hubspotClientId||""} onChange={e=>set({hubspotClientId:e.target.value})}/></label>
        <KeyField label={tr("HubSpot OAuth client secret")} name="hubspotClientSecret" placeholder="…" {...keyProps}/>
        <ProviderHead name={tr("Box sign-in for everyone")} id="box-apps" cfg={cfg}>{tr("Box lets in only OAuth apps its owner registered. Make one in Box ({where}) with this return address: {url}",{where:tr(OWNER_APP_WHERE.box),url:`${webServer?window.location.origin:"http://127.0.0.1:8787"}/api/connectors/oauth/callback`})}</ProviderHead>
        <label>{tr("Box OAuth client ID")}<input value={cfg.boxClientId||""} onChange={e=>set({boxClientId:e.target.value})}/></label>
        <KeyField label={tr("Box OAuth client secret")} name="boxClientSecret" placeholder="…" {...keyProps}/>
      </>}
      {tab==="images"&&cfg&&<><div className="settingsSectionTitle"><div className="settingsSectionIcon"><ImageIcon size={22}/></div><div><h3>{tr("Pictures")}</h3><p>{tr("Picture generation, APIs, models and trying another provider on its own.")}</p></div></div>
        <MediaMakers kind="image" cfg={cfg} set={set} paidOff={imageCost!=="allow_paid"||cfg.imageProviderMode==="free"}/>
        <label><span className="labelLine">{tr("Picture model")} <span className="optional">{tr("optional")}</span></span><input value={cfg.imageModel||""} onChange={e=>set({imageModel:e.target.value})} placeholder={tr("Automatic — the first picture model available")}/></label>
        <details className="mediaProviderSettings" open><summary>{tr("Picture providers")}</summary>
          <p className="settingsHelp">{tr("You can connect several services. {brand} tries the providers in order and moves to the next one if one fails.",{brand:BRAND_NAME})} {webServer?tr("The keys stay on the server and are only shown masked."):tr("The keys are encrypted on this PC.")}</p>
          <label>{tr("How to choose")}<select value={cfg.imageProviderMode||"auto"} onChange={e=>set({imageProviderMode:e.target.value})}><option value="auto">{tr("Automatic — my order")}</option><option value="fast">{tr("⚡ Fast")}</option><option value="quality">{tr("✨ Quality")}</option><option value="free">{tr("🛡️ Free only")}</option></select></label>
          <label>{tr("Cost protection")}<select value={imageCost} onChange={e=>set({imageCostPolicy:e.target.value})}><option value="free_only">{tr("Do not allow direct costs")}</option><option value="allow_paid">{tr("Allow paid providers")}</option></select></label>
          <p className="settingsHelp">{imageCost==="free_only"?tr("Protection on: {brand} tries Cloudflare and Pollinations directly. Hugging Face, Together, OpenAI, Stability, fal.ai and Replicate are blocked if they could use paid credit. For OpenRouter the price is checked before the call.",{brand:BRAND_NAME}):tr("Careful: the providers you set up can use credit at their own prices.")}</p>
          <label>{tr("Order to try")}<input value={cfg.imageProviderOrder||"cloudflare,pollinations,huggingface,together,openrouter,fal,replicate,stability,openai,gemini,xai"} onChange={e=>set({imageProviderOrder:e.target.value})}/></label>
          <div className="providerGroup"><b>Cloudflare Workers AI</b><small>{tr("FLUX.1 Schnell · the first provider in free mode.")}</small></div>
          <label>Cloudflare Account ID<input value={cfg.cloudflareAccountId||""} onChange={e=>set({cloudflareAccountId:e.target.value})} placeholder="Account ID"/></label>
          <KeyField label={tr("Cloudflare API token")} name="cloudflareApiToken" placeholder={tr("API token")} token {...keyProps}/>
          <div className="providerGroup"><b>Hugging Face</b><small>{tr("FLUX.1 Schnell through the HF Inference Router, only if cost protection allows it.")}</small></div>
          <KeyField label="Token Hugging Face" name="hfToken" placeholder="hf_..." token {...keyProps}/>
          <div className="providerGroup"><b>Together AI</b><small>{tr("FLUX.1 Schnell. Promotional credits can be limited.")}</small></div>
          <KeyField label={tr("Together API key")} name="togetherApiKey" placeholder={tr("API key")} {...keyProps}/>
          <div className="providerGroup"><b>OpenRouter</b><small>{tr("Several picture models with one key.")}</small></div>
          <KeyField label={tr("OpenRouter API key")} name="openRouterApiKey" placeholder="sk-or-..." {...keyProps}/>
          <label>{tr("OpenRouter picture model")}<input value={cfg.openRouterImageModel||"google/gemini-3.1-flash-image"} onChange={e=>set({openRouterImageModel:e.target.value})}/></label>
          <div className="providerGroup"><b>OpenAI</b><small>{tr("GPT Image through the OpenAI API.")}</small></div>
          <KeyField label={tr("OpenAI API key")} name="openAiApiKey" placeholder="sk-..." {...keyProps}/>
          <label>{tr("OpenAI picture model")}<input value={cfg.openAiImageModel||"gpt-image-1-mini"} onChange={e=>set({openAiImageModel:e.target.value})}/></label>
          <div className="providerGroup"><b>Google Gemini</b><small>{tr("«Nano Banana»; you choose the model above, under «Pictures made by». The same key as for AI APIs and Video.")}</small></div>
          <KeyField label={tr("Gemini API key")} name="geminiApiKey" placeholder="AIza..." {...keyProps}/>
          <div className="providerGroup"><b>Grok Imagine (xAI)</b><small>{tr("With the xAI key from AI APIs.")}</small></div>
          <label>{tr("Grok picture model")}<input value={cfg.xaiImageModel||"grok-imagine-image"} onChange={e=>set({xaiImageModel:e.target.value})}/></label>
          <div className="providerGroup"><b>Stability AI</b><small>Stable Image REST API.</small></div>
          <KeyField label={tr("Stability API key")} name="stabilityApiKey" placeholder="sk-..." {...keyProps}/>
          <label>{tr("Stability engine")}<select value={cfg.stabilityImageEngine||"core"} onChange={e=>set({stabilityImageEngine:e.target.value})}><option value="core">Core</option><option value="ultra">Ultra</option><option value="sd3">SD3</option></select></label>
          <div className="providerGroup"><b>fal.ai</b><small>{tr("Fast generation models through fal.run.")}</small></div>
          <KeyField label={tr("fal API key")} name="falApiKey" placeholder="FAL_KEY" {...keyProps}/>
          <label>{tr("fal.ai model")}<input value={cfg.falImageModel||"fal-ai/z-image/turbo"} onChange={e=>set({falImageModel:e.target.value})}/></label>
          <div className="providerGroup"><b>Replicate</b><small>{tr("Official and community models through the Predictions API.")}</small></div>
          <KeyField label={tr("Replicate API token")} name="replicateApiToken" placeholder="r8_..." token {...keyProps}/>
          <label>{tr("Replicate model")}<input value={cfg.replicateImageModel||"black-forest-labs/flux-schnell"} onChange={e=>set({replicateImageModel:e.target.value})}/></label>
          <div className="providerGroup"><b>Pollinations</b><small>{tr("Fallback media provider.")}</small></div>
          <KeyField label={tr("Pollinations API key")} name="pollinationsApiKey" placeholder="sk_..." {...keyProps}/>
          <label>{tr("Pollinations model")}<input value={cfg.pollinationsImageModel||"black-forest-labs/flux.1-schnell"} onChange={e=>set({pollinationsImageModel:e.target.value})}/></label>
        </details>
        <p className="settingsHelp">{tr("When you ask for a picture, {brand} tries the providers in the order set, puts the real file in the chat and saves it in the Library.",{brand:BRAND_NAME})}</p>
      </>}
      {tab==="video"&&cfg&&<><div className="settingsSectionTitle"><div className="settingsSectionIcon"><Play size={22}/></div><div><h3>{tr("Video")}</h3><p>{tr("Video generation, APIs, models and trying another provider on its own.")}</p></div></div>
        <MediaMakers kind="video" cfg={cfg} set={set} paidOff={cfg.videoCostPolicy!=="allow_paid"||cfg.videoMode==="free"}/>
        <label>{tr("Video mode")}<select value={cfg.videoMode||"fast"} onChange={e=>{const videoMode=e.target.value;const quality=videoMode==="quality";set({videoMode,videoModel:quality?"bytedance/seedance-2.5":"bytedance/seedance-2.0-fast",openRouterVideoModel:quality?"bytedance/seedance-2.5":"bytedance/seedance-2.0-fast",geminiVideoModel:quality?"veo-3.1-generate-preview":"veo-3.1-fast-generate-preview"})}}><option value="fast">{tr("⚡ Fast")}</option><option value="quality">{tr("🎬 Quality")}</option><option value="free">{tr("🛡️ Free only")}</option></select></label>
        <label>{tr("Cost protection")}<select value={cfg.videoCostPolicy||"free_only"} onChange={e=>set({videoCostPolicy:e.target.value})}><option value="free_only">{tr("Do not start paid jobs")}</option><option value="allow_paid">{tr("Allow paid providers")}</option></select></label>
        <p className="settingsHelp">{(cfg.videoCostPolicy||"free_only")==="free_only"?tr("{brand} checks the published price when there is one and does not start if it cannot confirm a zero cost. Gemini Veo, fal.ai and Replicate stay blocked in this mode.",{brand:BRAND_NAME}):tr("Careful: video generation can use credit fast. The cost depends on the model, length and resolution.")}</p>
        <label>{tr("Order to try")}<input value={cfg.videoProviderOrder||"pollinations,openrouter,gemini,fal,replicate,openai,xai"} onChange={e=>set({videoProviderOrder:e.target.value})}/></label>
        <div className="providerGroup"><b>Pollinations Video</b><small>{tr("The key is shared with Pictures.")}</small></div>
        <KeyField label={tr("Pollinations API key")} name="pollinationsApiKey" placeholder="sk_..." {...keyProps}/>
        <label>{tr("Pollinations video model")}<input value={cfg.pollinationsVideoModel||"google/veo-3.1-fast"} onChange={e=>set({pollinationsVideoModel:e.target.value})}/></label>
        <div className="providerGroup"><b>OpenRouter Video</b><small>{tr("Seedance, Veo, Wan and other models through the same API.")}</small></div>
        <KeyField label={tr("OpenRouter API key")} name="openRouterApiKey" placeholder="sk-or-..." {...keyProps}/>
        <label>{tr("OpenRouter video model")}<input value={cfg.openRouterVideoModel||(cfg.videoMode==="quality"?"bytedance/seedance-2.5":"bytedance/seedance-2.0-fast")} onChange={e=>set({openRouterVideoModel:e.target.value})}/></label>
        <div className="providerGroup"><b>Gemini · Veo</b><small>{tr("Veo with the same Gemini key used for chat; you choose the model above, under «Videos made by».")}</small></div>
        <KeyField label={tr("Gemini API key")} name="geminiApiKey" placeholder="AIza..." {...keyProps}/>
        <p className="settingsHelp">{tr("OpenAI (ChatGPT) no longer makes videos: Sora closed on 24 September 2026, both the app and the API. ChatGPT pictures still work.")}</p>
        <div className="providerGroup"><b>Grok Imagine Video (xAI)</b><small>{tr("With the xAI key from AI APIs; 1–15 seconds.")}</small></div>
        <label>{tr("Grok video model")}<input value={cfg.xaiVideoModel||"grok-imagine-video"} onChange={e=>set({xaiVideoModel:e.target.value})}/></label>
        <div className="providerGroup"><b>fal.ai Video</b><small>{tr("LTX Video. Can use the starting credits, then paid credit.")}</small></div>
        <KeyField label={tr("fal API key")} name="falApiKey" placeholder="FAL_KEY" {...keyProps}/>
        <label>{tr("fal video model")}<input value={cfg.falVideoModel||"fal-ai/ltx-video"} onChange={e=>set({falVideoModel:e.target.value})}/></label>
        <div className="providerGroup"><b>Replicate Video</b><small>{tr("Official video models through the Predictions API.")}</small></div>
        <KeyField label={tr("Replicate API token")} name="replicateApiToken" placeholder="r8_..." token {...keyProps}/>
        <label>{tr("Replicate video model")}<input value={cfg.replicateVideoModel||"wan-video/wan-2.2-t2v-fast"} onChange={e=>set({replicateVideoModel:e.target.value})}/></label>
        <p className="settingsHelp">{tr("When you ask for a video, {brand} tries the providers in order, downloads the real MP4 file, puts it in the chat and saves it in the Library.",{brand:BRAND_NAME})}</p>
      </>}
      {tab==="voice"&&cfg&&<><h3>{tr("Voice and microphone")}</h3>
        <label>{tr("Language for dictation, transcription and reading aloud")}<select value={cfg.speechLanguage||"ro"} onChange={e=>set({speechLanguage:e.target.value})}><option value="ro">Română</option><option value="en">English</option><option value="fr">Français</option></select></label>
        {machineSettingsAllowed&&<label>{tr("Transcription model")}<input value={cfg.speechModel||"openai/whisper-1"} onChange={e=>set({speechModel:e.target.value})}/></label>}
        <button type="button" className="secondary testMicBtn" onClick={testMic}><Mic size={16}/> {tr("Test the microphone")}</button>{micStatus&&<div className="micStatus" role="status">{micStatus}</div>}
        <p className="settingsHelp">{tr("Press the microphone once to start recording and again to stop. {brand} writes out what you said and sends it.",{brand:BRAND_NAME})}</p>
      </>}
      {tab==="notify"&&<NotifyTab account={account}>{webServer&&<PhoneNotifications/>}</NotifyTab>}
      {tab==="account"&&cfg&&<><h3>{tr("Owner on this PC")}</h3>
        <div className="accountSettingsCard"><AccountAvatar user={user} className="accountAvatar big"/><div><b>{user?.name||tr("{brand} account",{brand:BRAND_NAME})}</b><span>{user?.email}{user?.role==="owner"?" · Owner":""}</span></div></div>
        <p className="settingsHelp">{IS_WEB?tr("Chats, memory, the library, designs, projects, apps and automations are kept on the {brand} server.",{brand:BRAND_NAME}):tr("Chats, memory, the library, designs, projects, apps and automations are kept on this computer.")}</p>
        {machineSettingsAllowed&&!webServer&&<>
          <label><span className="labelLine">{tr("Owner email on this PC")} <span className="optional">{tr("optional")}</span></span><input type="email" value={cfg.ownerEmail||""} onChange={e=>set({ownerEmail:e.target.value})} placeholder={tr("name@example.com")} autoComplete="off"/></label>
          <p className="settingsHelp">{tr("The local account with this email gets Owner rights: running code, GitHub Solve, checking the server. It applies only when {brand} Cloud is not set up. Sign in again after the change.",{brand:BRAND_SHORT})}</p>
        </>}
      </>}
      {error&&<div className="inlineError" role="alert">{error}</div>}
    </div></div>
    {onAccountTab?<div className="modalActions"><button className="secondary" onClick={onClose}>{tr("Close")}</button></div>
    :<div className="modalActions"><button className="secondary" onClick={onClose}>{tr("Cancel")}</button><button className="primary" onClick={save} disabled={saving}>{saving?tr("Saving…"):tr("Save settings")}</button></div>}
    </>}
  </div></div>;
}

function EntityModal({type,item,onClose,onSave,onDelete}) {
  const isEdit=!!item;
  const [name,setName]=useState(item?.name||""),[prompt,setPrompt]=useState(item?.systemPrompt||""),[instructions,setInstructions]=useState(item?.instructions||""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function submit(e){
    e.preventDefault();
    if(!name.trim()||busy)return;
    setBusy(true);setError("");
    try{await onSave({name:name.trim(),systemPrompt:prompt.trim(),instructions:instructions.trim()})}
    catch(err){if(mounted.current){setError(err.message);setBusy(false)}}
  }
  async function remove(){
    if(busy)return;
    const question=type==="project"?tr("Delete the project «{name}»? Its conversations stay, but will no longer belong to any project.",{name:item.name}):tr("Delete the assistant «{name}»?",{name:item.name});
    if(!confirm(question))return;
    setBusy(true);setError("");
    try{await onDelete()}catch(err){if(mounted.current){setError(err.message);setBusy(false)}}
  }
  const title=type==="project"?(isEdit?tr("Edit the project"):tr("New project")):(isEdit?tr("Edit the assistant"):tr("Custom assistant"));
  return <Modal title={title} className="modal smallModal" onClose={onClose}>
    <form onSubmit={submit}>
      <label>{tr("Name")}<input value={name} onChange={e=>setName(e.target.value)} placeholder={type==="project"?tr("E.g. Spring marketing campaign"):tr("E.g. Maths teacher")} maxLength={200} autoFocus/></label>
      {type==="assistant"&&<label>{tr("Instructions for the assistant")}<textarea className="promptArea" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={tr("How do you want this assistant to work?")}/></label>}
      {type==="project"&&<label><span className="labelLine">{tr("Shared project instructions")} <span className="optional">{tr("optional")}</span></span><textarea className="promptArea" value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder={tr("E.g. Use the project documents, keep a formal tone and remember the important decisions.")}/></label>}
      {error&&<div className="inlineError" role="alert">{error}</div>}
      <div className="modalActions">{isEdit&&onDelete&&<button type="button" className="dangerButton pushLeft" onClick={remove} disabled={busy}><Trash2 size={15}/> {tr("Delete")}</button>}<button type="button" className="secondary" onClick={onClose}>{tr("Cancel")}</button><button className="primary" disabled={!name.trim()||busy}>{busy?tr("Saving…"):isEdit?tr("Save"):tr("Create")}</button></div>
    </form>
  </Modal>;
}

function GithubSolveModal({model,onClose,onBackup}) {
  const [path,setPath]=useState(""),[instruction,setInstruction]=useState(()=>tr("Analyse the file, find the problem and fix it.")),[busy,setBusy]=useState(""),[result,setResult]=useState(null),[error,setError]=useState("");
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function solve(e){
    e.preventDefault();
    if(!path.trim()||busy)return;
    setBusy("solve");setError("");setResult(null);
    try{const d=await api("/api/github/solve",{method:"POST",body:JSON.stringify({path:path.trim(),instruction:instruction.trim(),model})});if(mounted.current)setResult(d.data||{})}
    catch(err){if(mounted.current)setError(err.message)}
    finally{if(mounted.current)setBusy("")}
  }
  async function copy(){const ok=await writeClipboardText(result?.proposal||"");toast(ok?tr("The proposal was copied to the clipboard."):tr("The proposal could not be copied."),ok?"ok":"error")}
  async function apply(){
    if(!result?.proposal||busy)return;
    if(!confirm(tr("Apply the change straight in GitHub for {path} (branch {branch})? A local backup is made so you can go back.",{path:result.path,branch:result.branch||tr("default")})))return;
    setBusy("apply");setError("");
    try{
      const a=await api("/api/github/apply",{method:"POST",body:JSON.stringify({path:result.path,content:result.proposal,sha:result.sha,branch:result.branch,message:`${BRAND_NAME}: rezolvare `+result.path})});
      if(a.data?.backupId)onBackup?.({id:a.data.backupId,path:a.data.path,branch:a.data.branch,commit:a.data.commit,createdAt:Date.now()});
      toast(tr("The change was applied in GitHub. Commit: {commit}",{commit:a.data?.commit||tr("created")}),"ok");
      onClose();
    }catch(err){if(mounted.current){setError(err.message);setBusy("")}}
  }
  const failedCheck=result?.check?.supported&&!result.check.ok;
  return <Modal title="GitHub Solve" subtitle={tr("{brand} reads the file from the configured repository and proposes a fix.",{brand:BRAND_NAME})} className="modal githubModal" onClose={onClose}>
    <form onSubmit={solve}>
      <label>{tr("File path in the repository")}<input value={path} onChange={e=>setPath(e.target.value)} placeholder="apps/mobile/app/index.js" autoFocus/></label>
      <label>{tr("What needs fixing")}<textarea className="promptArea" value={instruction} onChange={e=>setInstruction(e.target.value)}/></label>
      {error&&<div className="inlineError" role="alert">{error}</div>}
      <div className="modalActions"><button type="button" className="secondary" onClick={onClose}>{tr("Close")}</button><button className="primary" disabled={!path.trim()||!!busy}>{busy==="solve"?tr("Analysing…"):tr("Make the fix")}</button></div>
    </form>
    {result&&<div className="githubResult">
      <div className={cx("providerRow",failedCheck?"bad":"good")}>{failedCheck?<X size={15}/>:<Check size={15}/>}<span>{failedCheck?tr("The syntax check found an error. The proposal can NOT be applied."):result.check?.supported?tr("The syntax check passed."):tr("Proposal made (no syntax check for this file type).")} · {result.path}{result.branch?` · ${result.branch}`:""}</span></div>
      {failedCheck&&<pre className="proposalPreview error">{String(result.check.stderr||result.check.stdout||tr("Check failed")).slice(0,2500)}</pre>}
      <pre className="proposalPreview">{String(result.proposal||"").slice(0,20000)}</pre>
      <div className="modalActions"><button type="button" className="secondary" onClick={copy}><Copy size={15}/> {tr("Copy")}</button><button type="button" className="primary" onClick={apply} disabled={failedCheck||!!busy}>{busy==="apply"?tr("Applying…"):tr("Apply in GitHub")}</button></div>
    </div>}
  </Modal>;
}

function App() {
  const [user,setUser]=useState(()=>storage.json(USER_KEY,null));
  const [permissions,setPermissions]=useState(()=>storage.json(PERMISSIONS_KEY,{})||{});
  const [boot,setBoot]=useState(true),[loadError,setLoadError]=useState(""),[authNotice,setAuthNotice]=useState("");
  const [conversations,setConversations]=useState([]),[projects,setProjects]=useState([]),[assistants,setAssistants]=useState([]);
  const [models,setModels]=useState(()=>cachedModels()),[modelPolicyEnforced,setModelPolicyEnforced]=useState(false),[refreshingModels,setRefreshingModels]=useState(false),[deniedModels,setDeniedModels]=useState(0),[lockedModels,setLockedModels]=useState([]),[modelsChecked,setModelsChecked]=useState(false);
  const [currentId,setCurrentId]=useState(null),[model,setModel]=useState(()=>storage.get(MANUAL_MODEL_KEY)||"");
  // The model Serasmart AI picked by itself (first in the list: your OmniRoute combination). Unlike a model you chose, it is
  // replaced as soon as a better one appears, so a direct API picked while OmniRoute was offline does not stay selected.
  const autoPickRef=useRef("");
  const [selectedProject,setSelectedProject]=useState(null),[selectedAssistant,setSelectedAssistant]=useState(null);
  const setDraft=draftStore.set,[attachmentsState,setAttachments]=useState([]),[responseMode,setResponseModeState]=useState(()=>storage.get(RESPONSE_MODE_KEY,"rapid")==="thinking"?"thinking":"rapid"),[mediaModeState,setMediaMode]=useState(null);
  const [generations,setGenerations]=useState({});
  const [search,setSearch]=useState(""),[sidebar,setSidebar]=useState(false),[sidebarCollapsed,setSidebarCollapsed]=useState(()=>storage.get(SIDEBAR_COLLAPSED_KEY)==="1");
  const [omni,setOmni]=useState(false),[cloudConfigured,setCloudConfigured]=useState(null),[showJumpBottom,setShowJumpBottom]=useState(false);
  const [creditsDialog,setCreditsDialog]=useState(null);
  const [preferredModel,setPreferredModel]=useState("");const preferredModelRef=useRef("");
  const [settings,setSettings]=useState(false),[prefBusy,setPrefBusy]=useState(""),[entityModal,setEntityModal]=useState(null),[toolPanel,setToolPanel]=useState(null),[filesPanel,setFilesPanel]=useState(false),[githubModal,setGithubModal]=useState(false);
  useEffect(()=>{if(!user?.id)return;api("/api/me/settings").then(d=>{const m=String(d?.data?.preferredModel||"");preferredModelRef.current=m;setPreferredModel(m)}).catch(()=>{})},[user?.id,settings]);
  const [updateReady,setUpdateReady]=useState(false),[updateDismissed,setUpdateDismissed]=useState(false);
  const [lastGithubBackup,setLastGithubBackup]=useState(()=>storage.json(GITHUB_BACKUP_KEY,null));
  const [firstRunDismissed,setFirstRunDismissed]=useState(()=>storage.get(FIRST_RUN_KEY)==="1");
  const [mentionsVersion,setMentionsVersion]=useState(0);
  const chatRef=useRef(null),stickToBottomRef=useRef(true),controllersRef=useRef(new Map()),generationsRef=useRef({}),machineCfgRef=useRef(null);
  generationsRef.current=generations;
  const current=conversations.find(c=>c.id===currentId)||null;
  const isOwner=user?.role==="owner";
  const access=useMemo(()=>({can:key=>isOwner||permissions?.[key]!==false,deny:key=>toast(deniedMessage(key)),isOwner}),[isOwner,permissions]);
  const {can,deny}=access;
  const currentGen=currentId?generations[currentId]:null;
  const busy=!!currentGen;
  const machineSettingsAllowed=isOwner||cloudConfigured===false;
  const showFirstRun=!IS_WEB&&!!user&&!boot&&modelsChecked&&!firstRunDismissed&&!refreshingModels&&models.length===0&&omni!==true&&(isOwner||cloudConfigured===false);
  function finishFirstRun(){storage.set(FIRST_RUN_KEY,"1");setFirstRunDismissed(true)}
  function setResponseMode(m){setResponseModeState(m);storage.set(RESPONSE_MODE_KEY,m)}

  useEffect(()=>{const busy=Object.keys(generations||{}).length>0;if(busy)document.documentElement.dataset.thinking="1";else delete document.documentElement.dataset.thinking;},[generations]);
  function setGen(id,patch){setGenerations(g=>{if(!g[id])return g;const prev=g[id];const next={...prev,...patch};if(patch.stage&&prev.steps.at(-1)!==patch.stage)next.steps=[...prev.steps,patch.stage].slice(-8);return {...g,[id]:next}})}
  function startGeneration(id){
    const map=controllersRef.current;
    try{map.get(id)?.abort("replaced")}catch{}
    const controller=new AbortController();map.set(id,controller);
    setGenerations(g=>({...g,[id]:{stage:"",steps:[]}}));
    return controller;
  }
  function finishGeneration(id,controller){
    const map=controllersRef.current;
    if(map.get(id)!==controller)return;
    map.delete(id);
    setGenerations(g=>{if(!g[id])return g;const n={...g};delete n[id];return n});
  }
  // Stop tells the server first (the answer otherwise keeps going in the background and is saved), then stops here.
  function stopGeneration(){
    const c=controllersRef.current.get(currentId);if(!c||c.signal.aborted)return;
    if(c.requestId)api("/api/chat/cancel",{method:"POST",body:JSON.stringify({id:c.requestId})}).catch(()=>{});
    c.abort("user-stop");
  }
  function abortAll(reason){for(const c of controllersRef.current.values()){try{c.abort(reason)}catch{}}controllersRef.current.clear();setGenerations({})}
  function showConversation(conv){setConversations(v=>v.map(x=>x.id===conv.id?conv:x))}
  // Credits (0.7.22): after an answer, the warning at 25 / 50 / 75 / 90 / 100% of the week (shown once); at 100%, or when
  // a model is not in the plan, the "buy credits or wait" message.
  const creditsOnRef=useRef(true);
  async function checkCreditNotice(){
    if(!creditsOnRef.current)return;
    try{
      const d=await api("/api/credits");
      if(!d.enabled||d.unlimited){creditsOnRef.current=false;return}
      if(d.notice?.message)toast(d.notice.message,d.notice.level>=90?"error":"info");
    }catch{}
  }
  function creditProblem(e){
    if(!e?.code||!["credits_exhausted","free_limit","plan_required","plan_upgrade"].includes(e.code))return false;
    setCreditsDialog({code:e.code,message:e.message,credits:e.credits||{}});
    return true;
  }
  const upsertMessage=(list,msg)=>{const a=Array.isArray(list)?list:[];const i=a.findIndex(m=>m?.id===msg.id);return i>=0?a.map((m,k)=>k===i?{...m,...msg}:m):[...a,msg]};
  // An answer, picture or video that kept going on the server while the app was closed, minimised or in the background:
  // shown while it grows, then replaced by the conversation the server saved.
  async function followJob(convId,jobId){
    if(!convId||!jobId||controllersRef.current.get(convId))return;
    const controller=startGeneration(convId);controller.requestId=jobId;
    setGen(convId,{stage:tr("The answer continues on the server…")});
    let lastText="";
    try{
      while(!controller.signal.aborted){
        let j=null;
        try{j=(await api(`/api/chat/jobs/${jobId}`,{signal:controller.signal}))?.data||null}
        catch(e){if(controller.signal.aborted)break;if(e.status!==404)throw e}
        if(!j)break;
        if(j.kind==="chat"&&(j.text||j.toolRuns?.length)){
          lastText=j.text||"";
          // 0.7.29: an action in a connected app that waits for the person is shown again, with its buttons.
          const asking=j.toolRuns?.find(r=>r.status==="ask");
          setGen(convId,{stage:asking?tr("Waiting for your approval in {app}…",{app:asking.app}):j.text?tr("Writing the answer…"):tr("Thinking…")});
          setConversations(v=>v.map(c=>c.id!==convId?c:{...c,messages:upsertMessage(c.messages,{id:jobId,role:"assistant",content:j.text||"",routeInfo:j.routeInfo||undefined,...(j.toolRuns?.length?{toolRuns:j.toolRuns}:{}),streaming:j.status==="running",createdAt:j.startedAt})}));
        }
        if(j.status!=="running")break;
        await new Promise(r=>setTimeout(r,1500));
      }
      const cs=await api("/api/conversations");
      const fresh=(cs.data||[]).find(c=>c.id===convId);
      if(!fresh)return;
      if(controller.signal.reason==="user-stop"){
        const conv={...fresh,messages:upsertMessage(fresh.messages,{id:jobId,role:"assistant",content:lastText,streaming:false,stopped:true,createdAt:Date.now()})};
        showConversation(conv);await saveConversation(conv);
      }else showConversation(fresh);
    }catch{}finally{finishGeneration(convId,controller)}
  }
  async function resumeServerJobs(){
    try{const d=await api("/api/chat/jobs");for(const j of d.data||[])if(j.status==="running")followJob(j.conversationId,j.id);}catch{}
  }

  async function refreshModels({silent=false}={}){
    if(!silent)setRefreshingModels(true);
    try{
      const ms=await api("/api/models");
      const live=uniqueModels((ms.manualModels||ms.data||[]).map(x=>typeof x==="string"?x:x?.id));
      if(Array.isArray(ms.combos)){COMBO_IDS=new Set(ms.combos.map(String));storage.set(COMBO_CACHE_KEY,JSON.stringify([...COMBO_IDS]));}
      const enforced=ms.policyEnforced===true;
      // The list is the one just received: a model that left OmniRoute (or never chatted) leaves the picker too. The
      // remembered list fills in only while OmniRoute does not answer.
      const merged=enforced||!ms.omniUnavailable?live:uniqueModels([...live,...cachedModels()]);
      setModelPolicyEnforced(enforced);setDeniedModels(enforced?Number(ms.deniedCount)||0:0);setModels(merged);
      setLockedModels(Array.isArray(ms.locked)?ms.locked.filter(x=>x&&typeof x.id==="string"&&!merged.includes(x.id)).map(x=>({id:x.id,reason:String(x.reason||"")})):[]);storage.set(MODEL_CACHE_KEY,JSON.stringify(merged));
      setModel(prev=>{
        const chosen=[prev&&prev!==autoPickRef.current?prev:"",storage.get(MANUAL_MODEL_KEY),machineCfgRef.current?.model];
        const pick=chosen.find(x=>x&&merged.includes(x))||merged[0]||"";
        autoPickRef.current=chosen.includes(pick)?"":pick;
        if(pick)storage.set(MODEL_SELECTED_KEY,pick);else storage.remove(MODEL_SELECTED_KEY);
        return pick;
      });
      return merged;
    }catch(e){
      if(!silent&&!isAuthLost(e.status,e.message))toast("Nu am putut actualiza lista de modele: "+e.message);
      return models;
    }finally{if(!silent)setRefreshingModels(false);setModelsChecked(true)}
  }
  async function chooseModel(next){
    const value=String(next||"").trim();if(!value)return;
    if(modelPolicyEnforced&&!models.includes(value))return;
    setModel(value);storage.set(MANUAL_MODEL_KEY,value);storage.set(MODEL_SELECTED_KEY,value);
    if(current){
      const id=current.id;
      setConversations(v=>v.map(x=>x.id===id?{...x,model:value}:x));
      patchConversation(id,{model:value}).catch(e=>toast(tr("The model could not be saved for the conversation: {error}",{error:e.message})));
    }
  }
  // A file renamed in the Library or the viewer keeps its new name in the conversations on screen too.
  useEffect(()=>{
    const renamed=e=>{const {id,name}=e.detail||{};if(!id||!name)return;
      const fix=a=>a&&(a.libraryId===id||a.id===id)?{...a,name}:a;
      setConversations(cs=>cs.map(c=>(c.messages||[]).some(m=>m.attachments?.some(a=>a&&(a.libraryId===id||a.id===id)))?{...c,messages:c.messages.map(m=>m.attachments?{...m,attachments:m.attachments.map(fix)}:m)}:c));};
    window.addEventListener("serasmart:file-renamed",renamed);
    return()=>window.removeEventListener("serasmart:file-renamed",renamed);
  },[]);
  async function loadData({initial=false}={}){
    if(!storage.get(TOKEN_KEY)){setBoot(false);return}
    setLoadError("");
    try{
      const [me,cs,ps,as]=await Promise.all([api("/auth/me"),api("/api/conversations"),api("/api/projects"),api("/api/assistants")]);
      if(me.token)storage.set(TOKEN_KEY,me.token);
      if(me.user){setUser(me.user);storage.set(USER_KEY,JSON.stringify(me.user))}
      const perms=me.permissions&&typeof me.permissions==="object"?me.permissions:{};
      setPermissions(perms);storage.set(PERMISSIONS_KEY,JSON.stringify(perms));
      const convs=cs.data||[],projectList=ps.data||[],assistantList=as.data||[];
      const live=new Set(Object.keys(generationsRef.current));
      setConversations(local=>convs.map(c=>live.has(c.id)?(local.find(x=>x.id===c.id)||c):c));
      setProjects(projectList);setAssistants(assistantList);
      setSelectedProject(v=>v&&projectList.some(p=>p.id===v)?v:null);
      setSelectedAssistant(v=>v&&assistantList.some(a=>a.id===v)?v:(assistantList.find(a=>a.builtIn)?.id||assistantList[0]?.id||null));
      setCurrentId(v=>v&&convs.some(c=>c.id===v)?v:(initial?(convs.find(c=>!c.archived)?.id||null):null));
      // Answers still being written on the server (the app was closed or in the background) appear and keep growing.
      resumeServerJobs();
    }catch(e){if(!isAuthLost(e.status,e.message))setLoadError(e.message)}
    finally{setBoot(false)}
    refreshModels({silent:true});
  }
  function logout({notice="",skipServer=false}={}){
    const token=storage.get(TOKEN_KEY);
    if(token&&!skipServer)fetch(`${GATEWAY}/auth/logout`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:"{}"}).catch(()=>{});
    abortAll("logout");
    try{window.speechSynthesis?.cancel()}catch{}
    ACCOUNT_KEYS.forEach(k=>storage.remove(k));
    setUser(null);setPermissions({});setConversations([]);setProjects([]);setAssistants([]);setCurrentId(null);setSelectedProject(null);setSelectedAssistant(null);
    setModels([]);setModel("");setModelPolicyEnforced(false);setModelsChecked(false);
    setDraft("");setAttachments([]);setMediaMode(null);setSearch("");setSidebar(false);
    setSettings(false);setEntityModal(null);setToolPanel(null);setFilesPanel(false);setGithubModal(false);setLastGithubBackup(null);setLoadError("");
    setAuthNotice(notice);
  }
  useEffect(()=>{
    setAuthLostHandler(message=>{
      const text=String(message||"").trim();
      const notice=/așteaptă aprobarea|asteapta aprobarea|nu este activ/i.test(text)?text:/^(Autentificare necesară|Sesiune)/i.test(text)||!text?tr("Your session expired or was closed. Sign in again."):`${text.replace(/[.!]?$/,".")} ${tr("Sign in again.")}`;
      logout({skipServer:true,notice});
    });
    return()=>setAuthLostHandler(null);
  });
  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        const cfg=await window.Serasmart?.getConfig?.();
        if(cfg&&active){
          machineCfgRef.current=cfg;
          if(cleanGatewayUrl(cfg.gatewayUrl))setGatewayUrl(cfg.gatewayUrl);
          DICTATION_LANG=String(cfg.speechLanguage||"ro");
          setCloudConfigured(!!String(cfg.controlApiUrl||"").trim());
        }
      }catch{}
      if(active)await loadData({initial:true});
    })();
    return()=>{active=false};
  },[user?.id]);
  useEffect(()=>{
    const off=window.Serasmart?.onUpdateReady?.(()=>setUpdateReady(true));
    return()=>{if(typeof off==="function")off()};
  },[]);
  // Back from the background (phone unlocked, window restored): pick up the answers the server kept writing.
  useEffect(()=>{
    if(!user?.id)return;
    const onVisible=()=>{if(!document.hidden)resumeServerJobs()};
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("focus",onVisible);
    return()=>{document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",onVisible)};
  },[user?.id]);
  // 0.7.18: the results of the automations (and the other notices of the account) arrive while the app is open; each
  // is shown once and marked as read. Without Serasmart Cloud the list is empty.
  useEffect(()=>{
    if(!user?.id||!cloudConfigured)return;
    let stopped=false;
    async function checkNotices(){
      if(document.hidden)return;
      try{
        const d=await api("/api/notifications");if(stopped)return;
        for(const n of (d?.data||[]).filter(x=>!x.read_at&&x.type==="automation").slice(0,3).reverse()){
          toast(`${n.title}: ${String(n.body||"").slice(0,180)}`,"info");
          api(`/api/notifications/${encodeURIComponent(n.id)}/read`,{method:"PATCH",body:"{}"}).catch(()=>{});
        }
      }catch{}
    }
    checkNotices();
    const id=setInterval(checkNotices,60000);
    return()=>{stopped=true;clearInterval(id)};
  },[user?.id,cloudConfigured]);
  useEffect(()=>{
    let stopped=false;
    async function poll(){
      if(document.hidden)return;
      try{const r=await fetch(`${GATEWAY}/health`,{signal:AbortSignal.timeout(7000)});const h=await r.json();if(stopped)return;setOmni(h.omni?true:h.omniNeedsKey?"key":false);setCloudConfigured(!!h.cloudConfigured)}
      catch{if(!stopped)setOmni("offline")}
    }
    poll();
    const id=setInterval(poll,8000);
    const onVisible=()=>{if(!document.hidden)poll()};
    document.addEventListener("visibilitychange",onVisible);
    return()=>{stopped=true;clearInterval(id);document.removeEventListener("visibilitychange",onVisible)};
  },[]);
  function updateChatScrollState(){
    const el=chatRef.current;if(!el)return;
    const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<120;
    stickToBottomRef.current=nearBottom;
    setShowJumpBottom(!nearBottom);
  }
  function jumpToLatest({smooth=true}={}){
    const el=chatRef.current;if(!el)return;
    stickToBottomRef.current=true;
    setShowJumpBottom(false);
    el.scrollTo({top:el.scrollHeight,behavior:smooth?"smooth":"auto"});
  }
  const lastMessage=current?.messages?.at(-1);
  useEffect(()=>{
    const id=setTimeout(()=>{if(stickToBottomRef.current)jumpToLatest({smooth:false});else updateChatScrollState()},30);
    return()=>clearTimeout(id);
  },[current?.messages?.length,busy,lastMessage?.content,currentGen?.stage]);
  useEffect(()=>{
    stickToBottomRef.current=true;
    setShowJumpBottom(false);
    try{window.speechSynthesis?.cancel()}catch{}
    const id=setTimeout(()=>jumpToLatest({smooth:false}),40);
    return()=>clearTimeout(id);
  },[currentId]);
  useEffect(()=>{
    if(current?.model&&(!modelPolicyEnforced||models.includes(current.model))){setModel(current.model);return;}
    if(!current){
      const manual=storage.get(MANUAL_MODEL_KEY);
      // 0.7.23: without a model picked by hand, new conversations start on the one chosen in Setări → Profil.
      const preferred=preferredModelRef.current;
      if(manual&&(!modelPolicyEnforced||models.includes(manual)))setModel(manual);
      else if(preferred&&models.includes(preferred))setModel(preferred);
    }
  },[currentId,modelPolicyEnforced,models.join("|"),preferredModel]);

  async function saveConversation(conv){
    const body=JSON.stringify({title:conv.title,projectId:conv.projectId??null,assistantId:conv.assistantId??null,model:conv.model??null,messages:conv.messages||[]});
    if(conv.id){
      const d=await api(`/api/conversations/${conv.id}`,{method:"PUT",body});
      const saved=d.data||conv;
      setConversations(v=>v.map(x=>x.id===conv.id?saved:x));
      return saved;
    }
    const d=await api("/api/conversations",{method:"POST",body});
    const saved=d.data;
    setConversations(v=>[saved,...v.filter(x=>x.id!==saved.id)]);
    setCurrentId(v=>v===null?saved.id:v);
    return saved;
  }
  async function patchConversation(id,patch){
    const d=await api(`/api/conversations/${id}`,{method:"PUT",body:JSON.stringify(patch)});
    if(d?.data)setConversations(v=>v.map(x=>x.id===id?{...x,...Object.fromEntries(Object.keys(patch).map(k=>[k,d.data[k]])),updatedAt:d.data.updatedAt||x.updatedAt}:x));
    return d?.data;
  }
  async function streamAssistant(baseConv,messages,{extra={},format=null,edit=false,sourceName=""}={}){
    const convId=baseConv.id;
    const lastUser=[...messages].reverse().find(m=>m.role==="user");
    const desiredModel=String(baseConv.model||model||"").trim();
    // A conversation keeps the model it was made with; when that model has left the list (OmniRoute no longer has it, or it
    // was never a chat model) the one chosen in the picker answers instead of an error.
    const effectiveModel=modelPolicyEnforced||models.length?(models.includes(desiredModel)?desiredModel:(models.includes(model)?model:(models[0]||""))):desiredModel;
    const controller=startGeneration(convId);
    let answer="",routeInfo=null,started=false,streamError="",flushTimer=null,resume=false,toolRuns=[];
    const assistantMessage={id:uid(),role:"assistant",content:"",createdAt:Date.now(),streaming:true};
    controller.requestId=assistantMessage.id;
    let working={...baseConv,model:effectiveModel||baseConv.model||model,messages:[...messages,assistantMessage],updatedAt:Date.now()};
    const flush=()=>{flushTimer=null;showConversation(working)};
    const scheduleFlush=()=>{if(!flushTimer)flushTimer=setTimeout(flush,40)};
    showConversation(working);
    setGen(convId,{stage:tr("Reading the request…")});
    try{
      if(!effectiveModel&&!isOwner&&cloudConfigured)throw new Error(tr("No AI model is allowed for this account. Ask the Owner for access to a model."));
      const payload=toProviderMessages(messages,extra);
      if(!payload.some(m=>m.role==="user"))throw new Error(tr("The message is empty."));
      setGen(convId,{stage:tr("Checking memory, files and relevant context…")});
      const r=await fetch(`${GATEWAY}/api/chat/stream`,{method:"POST",headers:authHeaders({"Content-Type":"application/json"}),body:JSON.stringify({model:effectiveModel,requestId:assistantMessage.id,conversationId:baseConv.id||null,assistantId:baseConv.assistantId||null,projectId:baseConv.projectId||null,responseMode,messages:payload,fileFormat:format||undefined,fileEdit:edit||undefined,timeZone:localZone()}),signal:controller.signal});
      if(!r.ok){const text=await r.text().catch(()=>"");throw apiError(r.status,text,"/api/chat/stream")}
      setGen(convId,{stage:tr("Waiting for the chosen AI to answer…")});
      const handleLine=line=>{
        if(!line.startsWith("data:"))return;
        const raw=line.slice(5).trim();if(!raw||raw==="[DONE]")return;
        let j;try{j=JSON.parse(raw)}catch{return}
        if(j?.error){streamError=String(j.error?.message||j.error);return}
        if(j?.serasmart_route){
          routeInfo=j.serasmart_route;
          setGen(convId,{stage:`A ales ${providerLabel(routeInfo.provider,routeInfo.model)} · ${routeInfo.model}…`});
          working={...working,messages:[...messages,{...assistantMessage,routeInfo,content:answer,streaming:true}]};scheduleFlush();
          return;
        }
        // 0.7.29: an action in a connected app (asking for approval, working, done, denied).
        if(j?.serasmart_tool){
          const run=j.serasmart_tool;
          toolRuns=toolRuns.some(x=>x.id===run.id)?toolRuns.map(x=>x.id===run.id?run:x):[...toolRuns,run];
          setGen(convId,{stage:run.status==="ask"?tr("Waiting for your approval in {app}…",{app:run.app}):run.status==="running"?tr("Working in {app}…",{app:run.app}):tr("Thinking…")});
          working={...working,messages:[...messages,{...assistantMessage,routeInfo,toolRuns,content:answer,streaming:true}]};scheduleFlush();
          return;
        }
        // An OmniRoute combination ("Ai principal") answers with one of its members: show which one really answered.
        if(routeInfo?.model&&!routeInfo.servedBy&&typeof j?.model==="string"&&j.model&&!j.model.includes(String(routeInfo.model).split("/").pop()))routeInfo={...routeInfo,servedBy:j.model};
        const delta=j?.choices?.[0]?.delta?.content||j?.choices?.[0]?.message?.content||"";
        if(delta){
          if(!started){started=true;setGen(convId,{stage:format?tr("Writing your {format} file…",{format:format.toUpperCase()}):tr("Writing the answer…")})}
          answer+=delta;
          // 0.7.30: a file request does not fill the chat with the file's text; the file comes as a card when it is ready.
          const shown=format&&!/```intrebari/.test(answer)?"":answer;
          if(format)setGen(convId,{stage:tr("Writing your {format} file… {n} words",{format:format.toUpperCase(),n:answer.trim().split(/\s+/).length})});
          working={...working,messages:[...messages,{...assistantMessage,routeInfo,...(toolRuns.length?{toolRuns}:{}),content:shown,streaming:true}]};scheduleFlush();
        }
      };
      const reader=r.body.getReader(),dec=new TextDecoder();let buf="";
      while(true){
        const {value,done}=await reader.read();if(done)break;
        buf+=dec.decode(value,{stream:true});
        const events=buf.split(/\r?\n\r?\n/);buf=events.pop()||"";
        for(const ev of events)for(const line of ev.split(/\r?\n/))handleLine(line);
      }
      buf+=dec.decode();
      for(const line of buf.split(/\r?\n/))handleLine(line);
      if(streamError&&!answer)throw new Error(streamError);
      let note=streamError?`\n\n_${tr("The answer was interrupted: {error}",{error:streamError})}_`:"",files=[];
      // 0.7.35: when the person asked for a file, an answer that is one (named «….pptx», «….docx», «….xlsx», «….pdf», or
      // written slide by slide) is sent as that file; otherwise the answer stays text.
      let madeName="";
      if(!format&&!streamError&&asksForFile(messageText(lastUser))){const guess=answerFileFormat(answer);if(guess){format=guess.format;madeName=guess.name}}
      if(format&&!splitQuestions(answer,false)){
        if(!can("document_generation"))note+=`\n\n_${deniedMessage("document_generation")}_`;
        else{
          setGen(convId,{stage:tr("Making the {format} file…",{format:format.toUpperCase()})});
          try{
            const previousAssistant=[...messages].reverse().find(m=>m.role==="assistant"&&!m.error&&!m.mediaKind);
            const previousSource=previousAssistant?(previousAssistant.artifactSource||messageText(previousAssistant)):"";
            const content=standaloneExportRequest(messageText(lastUser))&&previousSource?previousSource:answer;
            if(!String(content||"").trim())throw new Error(tr("there is no content for the file"));
            const exported=await api("/api/export",{method:"POST",body:JSON.stringify({format,title:safeFileTitle(fileTitleFor(messageText(lastUser),content,madeName)||tr("Document")),content,...(sourceName?{fileName:sourceName.replace(/\.[^.]+$/,"")+" (edited)"}:madeName?{fileName:madeName.replace(/\.[^.]+$/,"")}:{})})});
            if(exported?.data){
              files=[exported.data];
              // 0.7.34: no automatic download any more; the card under the answer opens the file inside the app first.
            }
          }catch(err){note+=`\n\n_${tr("The {format} file could not be made: {error}. You can try again with the buttons under the answer.",{format:format.toUpperCase(),error:err.message})}_`}
        }
      }
      clearTimeout(flushTimer);
      const doneRuns=toolRuns.map(({args,...r})=>r);
      // The file's text stays with the message (artifactSource, used when the file is changed later); the chat shows one line.
      const madeFile=files[0];
      const shownText=madeFile?tr("Here is your {format} file: {name}",{format:format.toUpperCase(),name:madeFile.name||""})+note:(answer||tr("No answer came back."))+note;
      working={...working,messages:[...messages,{...assistantMessage,routeInfo,...(doneRuns.length?{toolRuns:doneRuns}:{}),content:shownText,...(madeFile?{artifactSource:answer}:{}),attachments:files,streaming:false}],updatedAt:Date.now()};
      showConversation(working);
      const saved=await saveConversation(working);
      api("/api/memory/capture",{method:"POST",body:JSON.stringify({conversationId:saved.id,userText:messageText(lastUser),assistantText:answer})}).catch(()=>{});
      checkCreditNotice();
    }catch(e){
      clearTimeout(flushTimer);
      const reason=controller.signal.reason;
      if(reason==="deleted"||reason==="logout"||reason==="replaced")return;
      const aborted=controller.signal.aborted||e?.name==="AbortError";
      // The connection broke (phone locked, app in the background, network change) but the server kept working.
      if(controller.signal.reason!=="user-stop"){
        try{const j=(await api(`/api/chat/jobs/${assistantMessage.id}`))?.data;if(j&&j.status!=="error"){resume=true;return}}catch{}
      }
      if(!aborted)creditProblem(e);
      const finalMessage=aborted
        ?{...assistantMessage,routeInfo,...(toolRuns.length?{toolRuns:toolRuns.map(({args,...r})=>r.status==="ask"?{...r,status:"denied"}:r)}:{}),content:answer,streaming:false,stopped:true}
        :{...assistantMessage,routeInfo,...(toolRuns.length?{toolRuns:toolRuns.map(({args,...r})=>r.status==="ask"?{...r,status:"denied"}:r)}:{}),content:`Eroare: ${friendlyError(e.message)}`,streaming:false,error:true};
      working={...working,messages:[...messages,finalMessage],updatedAt:Date.now()};
      showConversation(working);
      if(storage.get(TOKEN_KEY)){try{await saveConversation(working)}catch(saveError){if(!isAuthLost(saveError.status,saveError.message))toast(tr("The conversation could not be saved: {error}",{error:saveError.message}))}}
    }finally{finishGeneration(convId,controller)}
    if(resume)followJob(convId,assistantMessage.id);
  }
  // A picture or video (asked for in the chat or with the Poză / Video button) is made by the company of the chosen
  // model (Gemini, ChatGPT, Grok); with a combination or a model that cannot make pictures, by Setări → Poze / Video.
  async function generateMediaAssistant(baseConv,messages,kind,prompt){
    const convId=baseConv.id;
    const controller=startGeneration(convId);
    setGen(convId,{stage:kind==="video"?tr("Making the video… this can take a few minutes"):tr("Making the picture and preparing the file…")});
    const base={id:uid(),role:"assistant",createdAt:Date.now(),streaming:false,mediaKind:kind,mediaPrompt:prompt};
    controller.requestId=base.id;
    let resume=false;
    try{
      let message;
      try{
        const duration=kind==="video"?videoSecondsFor(prompt,await videoMaxSeconds()):undefined;
        const d=await api(kind==="video"?"/api/generate/video":"/api/generate/image",{method:"POST",body:JSON.stringify({prompt,via:baseConv.model||model||"",maker:savedMaker(kind)||"auto",duration,requestId:base.id,conversationId:convId}),signal:controller.signal});
        const file={...d.data,type:d.data?.kind||kind,kind:d.data?.kind||kind};
        message={...base,content:d.data?.note||"",attachments:[file],routeInfo:{task:kind==="video"?"video_generation":"image_generation",model:file.model||"",provider:inferModelProvider(file.model||"")}};
        checkCreditNotice();
      }catch(e){
        const reason=controller.signal.reason;
        if(reason==="deleted"||reason==="logout"||reason==="replaced")return;
        if(reason!=="user-stop"){try{const j=(await api(`/api/chat/jobs/${base.id}`))?.data;if(j&&j.status!=="error"){resume=true;return}}catch{}}
        if(!controller.signal.aborted)creditProblem(e);
        message=controller.signal.aborted
          ?{...base,content:"",stopped:true}
          :{...base,content:(kind==="video"?tr("The video could not be made: {error}",{error:friendlyError(e.message)}):tr("The picture could not be made: {error}",{error:friendlyError(e.message)})),mediaGenerationError:true,...(kind==="video"&&/Setări\s*→\s*Video|nevoie de o cheie/i.test(e.message)?{needsVideoSetup:true}:{})};
      }
      const conv={...baseConv,messages:[...messages,message],updatedAt:Date.now()};
      showConversation(conv);
      if(!storage.get(TOKEN_KEY))return;
      try{
        const saved=await saveConversation(conv);
        if(!message.mediaGenerationError&&!message.stopped)api("/api/memory/capture",{method:"POST",body:JSON.stringify({conversationId:saved.id,userText:prompt,assistantText:`${kind==="video"?"Videoclip":"Imagine"} generată: ${message.attachments?.[0]?.name||""}`})}).catch(()=>{});
      }catch(err){if(!isAuthLost(err.status,err.message))toast(tr("The conversation could not be saved: {error}",{error:err.message}))}
    }finally{finishGeneration(convId,controller)}
    if(resume)followJob(convId,base.id);
  }
  async function send(answerText){
    const answer=typeof answerText==="string";
    const draft=draftStore.get(),text=answer?answerText.trim():draft.trim();
    const attachments=answer?[]:attachmentsState,mediaMode=answer?null:mediaModeState;
    const usable=attachments.filter(a=>a.part||a.parts?.length);
    if(!text&&!usable.length)return;
    if(currentId&&generations[currentId])return;
    const media=mediaMode||(!answer&&attachments.length===0?requestedMediaGeneration(text):null);
    if(media){
      const perm=media==="video"?"video_generation":"image_generation";
      if(!can(perm)){deny(perm);return}
      if(!text){toast(media==="video"?tr("Describe the video you want me to make."):tr("Describe the picture you want me to make."),"info");return}
    }
    const fileReq=media||answer?null:fileRequestFor(text,attachments.map(a=>a.name),current?.messages||[]);
    const format=media?null:answer?answerFormat(text,current?.messages||[]):fileReq?.format||null;
    const userId=uid();
    const parts=[...(text?[{type:"text",text}]:[]),...usable.flatMap(a=>Array.isArray(a.parts)&&a.parts.length?a.parts:[a.part].filter(Boolean))];
    const content=parts.length===1&&parts[0].type==="text"?parts[0].text:parts;
    const transient=usable.flatMap(a=>a.transientParts||[]);
    const extra=transient.length?{[userId]:transient}:{};
    const userMsg={id:userId,role:"user",content,displayText:text||tr("Attached file: {names}",{names:attachments.map(a=>a.name).join(", ")}),attachments:attachments.map(a=>({name:a.name,type:a.type,mime:a.mime||"",size:a.size||0,libraryId:a.libraryId||null,transcript:a.transcript||""})),createdAt:Date.now()};
    const base=current?{...current}:{title:titleFrom(text||attachments[0]?.name),projectId:selectedProject,assistantId:selectedAssistant,model,messages:[]};
    const conv={...base,title:base.messages?.length?base.title:titleFrom(text||attachments[0]?.name),model,messages:[...(base.messages||[]),userMsg],updatedAt:Date.now()};
    const previous={draft,attachments,mediaMode};
    if(!answer){setDraft("");setAttachments([]);setMediaMode(null);}
    let saved;
    try{saved=await saveConversation(conv)}
    catch(e){if(!answer){setDraft(previous.draft);setAttachments(previous.attachments);setMediaMode(previous.mediaMode)}if(!isAuthLost(e.status,e.message))toast(tr("The message could not be sent: {error}",{error:e.message}));return}
    if(base.archived)patchConversation(saved.id,{archived:false}).catch(()=>{});
    if(media)await generateMediaAssistant(saved,saved.messages||conv.messages,media,text);
    else await streamAssistant(saved,saved.messages||conv.messages,{extra,format,edit:!!fileReq?.edit,sourceName:fileReq?.source||""});
  }
  async function regenerate(index,needsConfirm){
    if(!current||generations[current.id])return;
    if(needsConfirm&&!confirm(tr("Regenerating replaces this answer and deletes the messages after it. Continue?")))return;
    const target=current.messages[index];
    const msgs=current.messages.slice(0,index);
    const lastUser=[...msgs].reverse().find(m=>m.role==="user");
    if(!lastUser){toast(tr("There is no message from you for this answer."));return}
    if(target?.mediaKind){const perm=target.mediaKind==="video"?"video_generation":"image_generation";if(!can(perm)){deny(perm);return}}
    let saved;
    try{saved=await saveConversation({...current,messages:msgs})}catch(e){toast(e.message);return}
    if(target?.mediaKind)await generateMediaAssistant(saved,saved.messages||msgs,target.mediaKind,target.mediaPrompt||messageText(lastUser));
    else{const req=fileRequestFor(messageText(lastUser),(lastUser?.attachments||[]).map(a=>a.name),msgs.slice(0,-1));await streamAssistant(saved,saved.messages||msgs,{format:req?.format||null,edit:!!req?.edit,sourceName:req?.source||""});}
  }
  async function rate(index,value){
    if(!current||generations[current.id])return;
    const msgs=current.messages.map((m,i)=>i===index?{...m,rating:m.rating===value?0:value}:m);
    try{await saveConversation({...current,messages:msgs})}catch(e){toast(e.message)}
  }
  async function saveEntity(data){
    const {type,item}=entityModal||{};
    if(type==="project"){
      if(item){const d=await api(`/api/projects/${item.id}`,{method:"PATCH",body:JSON.stringify({name:data.name,instructions:data.instructions})});setProjects(v=>v.map(p=>p.id===item.id?(d.data||{...p,name:data.name,instructions:data.instructions}):p))}
      else{const d=await api("/api/projects",{method:"POST",body:JSON.stringify({name:data.name,instructions:data.instructions})});setProjects(v=>[d.data,...v]);setSelectedProject(d.data.id)}
    }else{
      if(item){const d=await api(`/api/assistants/${item.id}`,{method:"PATCH",body:JSON.stringify({name:data.name,systemPrompt:data.systemPrompt})});setAssistants(v=>v.map(a=>a.id===item.id?(d.data||{...a,name:data.name,systemPrompt:data.systemPrompt}):a))}
      else{const d=await api("/api/assistants",{method:"POST",body:JSON.stringify({name:data.name,systemPrompt:data.systemPrompt})});setAssistants(v=>[...v,d.data]);startWithAssistant(d.data.id)}
    }
    setEntityModal(null);
  }
  async function deleteEntity(){
    const {type,item}=entityModal||{};if(!item)return;
    if(type==="project"){
      await api(`/api/projects/${item.id}`,{method:"DELETE"});
      setProjects(v=>v.filter(p=>p.id!==item.id));
      setConversations(v=>v.map(c=>c.projectId===item.id?{...c,projectId:null}:c));
      setSelectedProject(v=>v===item.id?null:v);
    }else{
      await api(`/api/assistants/${item.id}`,{method:"DELETE"});
      const fallback=assistants.find(a=>a.builtIn&&a.id!==item.id)?.id||null;
      setAssistants(v=>v.filter(a=>a.id!==item.id));
      setSelectedAssistant(v=>v===item.id?fallback:v);
    }
    setEntityModal(null);
  }
  async function share(){if(!current)return;const ok=await writeClipboardText(current.messages.map(m=>`${m.role==="user"?tr("Me"):BRAND_NAME}:\n${messageText(m)}`).join("\n\n"));toast(ok?tr("The conversation was copied to the clipboard."):tr("The conversation could not be copied to the clipboard."),ok?"ok":"error")}
  function saveGithubBackup(backup){storage.set(GITHUB_BACKUP_KEY,JSON.stringify(backup));setLastGithubBackup(backup)}
  async function githubRollback(){
    const last=lastGithubBackup;
    if(!last?.id){toast(tr("There is no recent GitHub backup."),"info");return;}
    if(!confirm(tr("Go back to the previous version of {path}?",{path:last.path})))return;
    try{
      const d=await api(`/api/github/rollback/${last.id}`,{method:"POST",body:"{}"});
      storage.remove(GITHUB_BACKUP_KEY);setLastGithubBackup(null);
      toast(tr("GitHub rollback done. Commit: {commit}",{commit:d.data?.commit||tr("created")}),"ok");
    }catch(e){toast("Revenire GitHub: "+e.message)}
  }
  function openTool(name,filter){
    if(name==="automations"&&!can("automations")){deny("automations");return}
    if(name==="design"&&!can("document_generation")){deny("document_generation");return}
    if(name==="admin"&&!isOwner)return;
    if(name==="code"&&!can("code")){deny("code");return}
    setSidebar(false);setToolPanel({name,filter});
  }
  function closeTool(){
    if(toolPanel?.name==="extensions"||toolPanel?.name==="automations")setMentionsVersion(v=>v+1);
    setToolPanel(null);
  }
  function attachFromLibrary(a){setAttachments(v=>[...v,a])}
  async function updatePreferences(patch){
    const before=user?.preferences||{};
    const apply=prefs=>setUser(u=>{if(!u)return u;const next={...u,preferences:{...(u.preferences||{}),...prefs}};storage.set(USER_KEY,JSON.stringify(next));return next});
    setPrefBusy(Object.keys(patch)[0]||"");apply(patch);
    try{
      let d;
      try{d=await api("/api/me/preferences",{method:"PATCH",body:JSON.stringify(patch)})}
      catch(e){
        if(e.status!==404||!("memoryEnabled" in patch))throw e;
        const t=await api("/api/memory/toggle",{method:"POST",body:JSON.stringify({enabled:patch.memoryEnabled})});
        d={data:{preferences:{memoryEnabled:t.enabled!==false}}};
      }
      if(d?.data?.preferences)apply(d.data.preferences);
      return true;
    }catch(e){apply(before);toast(tr("The setting could not be saved: {error}",{error:e.message}));return false}
    finally{setPrefBusy("")}
  }
  async function moveCurrent(projectId){if(!current)return;try{await patchConversation(current.id,{projectId});setSelectedProject(projectId)}catch(e){toast(e.message)}}
  async function archiveConversation(id){
    try{await patchConversation(id,{archived:true});if(currentId===id)setCurrentId(null);toast(tr("The conversation was archived. You will find it under «Archived» in the sidebar."),"info")}
    catch(e){toast(e.message)}
  }
  async function unarchiveConversation(id){try{await patchConversation(id,{archived:false});toast(tr("The conversation was restored."),"ok")}catch(e){toast(e.message)}}
  async function deleteConversation(id){
    const conv=conversations.find(x=>x.id===id);if(!conv)return;
    if(!confirm(tr("Delete the conversation «{title}» for good?",{title:conv.title||tr("Conversation")})))return;
    const controller=controllersRef.current.get(id);
    if(controller){try{controller.abort("deleted")}catch{}}
    try{await api(`/api/conversations/${id}`,{method:"DELETE"});setConversations(v=>v.filter(x=>x.id!==id));if(currentId===id)setCurrentId(null)}
    catch(e){toast(tr("Delete: {error}",{error:e.message}))}
  }
  function toggleMenu(){
    if(window.innerWidth<=900){setSidebar(v=>!v);return;}
    setSidebarCollapsed(v=>{storage.set(SIDEBAR_COLLAPSED_KEY,v?"0":"1");return !v});
  }
  function focusComposer(){setTimeout(()=>document.querySelector(".composerLine textarea")?.focus(),0)}
  function newConversation(){setCurrentId(null);setDraft("");setAttachments([]);setMediaMode(null);setSidebar(false);focusComposer()}
  // Code Serasmart AI: the new Code conversation opens with its code model chosen.
  function startCode(conv,assistant){
    if(!conv?.id)return;
    if(assistant)setAssistants(v=>v.some(a=>a.id===assistant.id)?v:[...v,assistant]);
    setConversations(v=>[conv,...v.filter(x=>x.id!==conv.id)]);
    if(conv.model){setModel(conv.model);storage.set(MANUAL_MODEL_KEY,conv.model);storage.set(MODEL_SELECTED_KEY,conv.model);}
    setCurrentId(conv.id);setDraft("");setMediaMode(null);setToolPanel(null);setSidebar(false);focusComposer();
  }
  function startWithAssistant(id){setSelectedAssistant(id);setCurrentId(null);setDraft("");setMediaMode(null);setToolPanel(null);setSidebar(false);focusComposer()}
  function startImageMode(){
    if(!can("image_generation")){deny("image_generation");return}
    setCurrentId(null);setDraft("");setMediaMode("image");setToolPanel(null);focusComposer();
  }
  function onAuth(nextUser,perms){setAuthNotice("");setPermissions(perms||{});setUser(nextUser)}
  function resetGatewayAndReload(){
    setGatewayUrl(DEFAULT_GATEWAY);
    Promise.resolve(window.Serasmart?.setConfig?.({gatewayUrl:DEFAULT_GATEWAY})).catch(()=>{});
    loadData();
  }

  if(boot)return <div className="loadingScreen"><BrandMark/><span>{tr("Starting {brand}…",{brand:BRAND_NAME})}</span></div>;
  if(!user)return <AuthScreen onAuth={onAuth} notice={authNotice}/>;
  const hasMessages=!!current?.messages?.length;
  const activeAssistantId=current?current.assistantId:selectedAssistant;
  return <AccessContext.Provider value={access}><div className={cx("appShell",sidebarCollapsed&&"sidebarCollapsed")}>
    <Sidebar open={sidebar} setOpen={setSidebar} user={user} search={search} setSearch={setSearch} projects={projects} assistants={assistants} conversations={conversations} currentId={currentId} busyIds={Object.keys(generations)} onSelect={id=>{setCurrentId(id);setSidebar(false)}} onDeleteConversation={deleteConversation} onUnarchive={unarchiveConversation} onNew={newConversation} selectedProject={selectedProject} setSelectedProject={setSelectedProject} activeAssistantId={activeAssistantId} onUseAssistant={startWithAssistant} onNewProject={()=>setEntityModal({type:"project",item:null})} onNewAssistant={()=>setEntityModal({type:"assistant",item:null})} onEditProject={p=>setEntityModal({type:"project",item:p})} onEditAssistant={a=>setEntityModal({type:"assistant",item:a})} onTool={name=>openTool(name)} onSettings={()=>setSettings(true)} onLogout={()=>logout()}/>
    {sidebar&&<div className="mobileScrim" onClick={()=>setSidebar(false)}/>}
    <main className="mainArea">
      <Header deniedCount={deniedModels} lockedModels={lockedModels} onMenu={toggleMenu} model={model} onSelectModel={chooseModel} models={models} onRefreshModels={()=>refreshModels()} refreshingModels={refreshingModels} policyEnforced={modelPolicyEnforced} omni={omni} showOmni={machineSettingsAllowed} onShare={share} current={current} projects={projects} onDetach={()=>moveCurrent(null)} onMoveProject={moveCurrent} onFiles={()=>setFilesPanel(true)} onGitHub={()=>setGithubModal(true)} onGitHubRollback={githubRollback} hasGitHubBackup={!!lastGithubBackup} onArchive={()=>current&&archiveConversation(current.id)} onUnarchive={()=>current&&unarchiveConversation(current.id)} onDelete={()=>current&&deleteConversation(current.id)}/>
      <InstallApp banner/>
      {loadError&&<div className="loadErrorBanner" role="alert"><span>{tr("The data could not be loaded: {error}",{error:loadError})}</span><button onClick={()=>loadData()}>{tr("Retry")}</button>{GATEWAY!==DEFAULT_GATEWAY&&<button onClick={resetGatewayAndReload}>{tr("Use the default local service")}</button>}</div>}
      {updateReady&&!updateDismissed&&<div className="updateBanner" role="status"><button className="updateInstall" onClick={()=>window.Serasmart?.installUpdate?.()}>{tr("{brand} update available — install now",{brand:BRAND_NAME})}</button><button className="updateClose" onClick={()=>setUpdateDismissed(true)} aria-label={tr("Hide the notice")} title={tr("Later")}><X size={14}/></button></div>}
      <div className="chatScroll" ref={chatRef} onScroll={updateChatScrollState}><ConversationView user={user} recentTitle={conversations.find(c=>c.id!==currentId&&!c.archived&&(c.messages||[]).length)?.title} onPick={(text,mode)=>{if(mode)setMediaMode(mode);else{setMediaMode(null);setDraft(text)}}} conversation={current} busy={busy} busyStage={currentGen?.stage} busySteps={currentGen?.steps||[]} onRegenerate={regenerate} onRate={rate} canRunCode={isOwner} onCodeResult={text=>setDraft(v=>(v?v+"\n\n":"")+text)} onAnswer={text=>send(text)} onOpenSettings={tab=>setSettings(tab||true)}/></div>
      {showJumpBottom&&hasMessages&&<button className="jumpToLatest" onClick={()=>jumpToLatest({smooth:true})} title={tr("Go to the latest message")} aria-label={tr("Go to the latest message")}><ChevronDown size={19}/><span>{tr("Latest message")}</span></button>}
      <Composer centered={!hasMessages} onSend={send} onStop={stopGeneration} busy={busy} attachments={attachmentsState} setAttachments={setAttachments} onOpenLibrary={()=>openTool("library","all")} responseMode={responseMode} setResponseMode={setResponseMode} mediaMode={mediaModeState} setMediaMode={setMediaMode} mentionsVersion={mentionsVersion} mediaPolicy={{imagePaid:machineCfgRef.current?.imageCostPolicy==="allow_paid"}}/>
    </main>
    {settings&&<SettingsModal onOpenTool={(name,filter)=>{setSettings(false);openTool(name,filter)}} onLogoutAll={()=>{setSettings(false);logout({notice:tr("You were signed out on every device.")})}} user={user} models={models} onDataDeleted={()=>loadData()} onAccountDeleted={()=>{setSettings(false);logout({skipServer:true,notice:tr("The account was deleted.")})}} initialTab={typeof settings==="string"?settings:"profile"} preferences={user?.preferences} onPreferences={updatePreferences} prefBusy={prefBusy} machineSettingsAllowed={machineSettingsAllowed} onClose={()=>setSettings(false)} onSaved={cfg=>{machineCfgRef.current={...(machineCfgRef.current||{}),...cfg};setCloudConfigured(!!String(cfg?.controlApiUrl||"").trim());Promise.resolve(window.Serasmart?.ensureOmni?.()).catch(()=>{});setTimeout(()=>loadData(),800)}}/>}
    {entityModal&&<EntityModal type={entityModal.type} item={entityModal.item} onClose={()=>setEntityModal(null)} onSave={saveEntity} onDelete={entityModal.item&&!entityModal.item.builtIn?deleteEntity:null}/>}
    {toolPanel?.name==="explore"&&<ExplorePanel onClose={closeTool} assistants={assistants} onUseAssistant={startWithAssistant} onImageMode={startImageMode} onOpenLibrary={filter=>openTool("library",filter)}/>}
    {toolPanel?.name==="library"&&<LibraryPage onClose={closeTool} onAttach={attachFromLibrary} toAttachment={libraryItemToAttachment} initialFilter={toolPanel.filter||"all"} onOpenDesign={id=>openTool("design",id)}/>}
    {toolPanel?.name==="design"&&can("document_generation")&&<DesignPage onClose={closeTool} model={model} models={models} initialId={toolPanel.filter||null}/>}
    {toolPanel?.name==="usage"&&<UsagePage onClose={closeTool} onBilling={()=>openTool("billing")}/>}
    {toolPanel?.name==="billing"&&<BillingPage onClose={closeTool} onUsage={()=>openTool("usage")}/>}
    {creditsDialog&&<CreditsDialog info={creditsDialog} onClose={()=>setCreditsDialog(null)} onBuy={()=>{setCreditsDialog(null);openTool("billing")}}/>}
    {toolPanel?.name==="memory"&&<MemoryPage onClose={closeTool} preferences={user?.preferences} onPreferences={updatePreferences} prefBusy={prefBusy}/>}
    {toolPanel?.name==="admin"&&isOwner&&<AdminPanel onClose={closeTool}/>}
    {toolPanel?.name==="extensions"&&<ExtensionsPage onClose={closeTool} initialTab={toolPanel.filter}/>}
    {can("plugins")&&<PendingApprovals currentConversationId={currentId} onOpenConversation={id=>{if(id){setCurrentId(id);closeTool?.()}}}/>}
    {toolPanel?.name==="code"&&can("code")&&<CodePage onClose={closeTool} onStart={startCode}/>}
    {toolPanel?.name==="automations"&&can("automations")&&<ScheduledPage onClose={closeTool} model={model} models={models}/>}
    {filesPanel&&<ConversationFilesPanel conversation={current} onClose={()=>setFilesPanel(false)}/>}
    {githubModal&&isOwner&&<GithubSolveModal model={model} onClose={()=>setGithubModal(false)} onBackup={saveGithubBackup}/>}
    {showFirstRun&&<FirstRunGuide onOpenSettings={()=>{finishFirstRun();setSettings(true)}} onDone={ok=>{finishFirstRun();if(ok)refreshModels()}}/>}
  </div></AccessContext.Provider>;
}
document.title=BRAND_NAME;
createRoot(document.getElementById("root")).render(<ErrorBoundary><App/><AccessRequestDialog/></ErrorBoundary>);
