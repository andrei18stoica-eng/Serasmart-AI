import React, { useEffect, useRef, useState } from "react";
import { Plus, Search, Check, Play, Pencil, Trash2, ExternalLink, Plug, Puzzle, Lock, X } from "lucide-react";
import { api, toast, cx, isHttpUrl, openLink, useAccess, deniedMessage, useModal, ToolShell, Switch, GATEWAY, OAUTH_REDIRECT_PATH } from "../core.jsx";
import { BRAND_NAME } from "../brand.js";
import { brandIcon } from "../brands.js";
import { t as tr, useLanguage } from "../i18n.jsx";
import { SkillPacks } from "./SkillLibrary.jsx";

const PLUGIN_APP_LINKS={
  "Gmail":"https://mail.google.com/","Google Drive":"https://drive.google.com/","GitHub":"https://github.com/login","Outlook Email":"https://outlook.office.com/mail/",
  "Adobe":"https://account.adobe.com/","Figma":"https://www.figma.com/login","Canva":"https://www.canva.com/login/","Shopify":"https://admin.shopify.com/",
  "Atlassian Rovo":"https://id.atlassian.com/login","monday.com":"https://auth.monday.com/","Notion":"https://www.notion.so/login","Google Calendar":"https://calendar.google.com/",
  "Slack":"https://slack.com/signin","Teams":"https://teams.microsoft.com/","Zoom":"https://zoom.us/signin","Hostinger Mail":"https://mail.hostinger.com/",
  "Higgsfield":"https://higgsfield.ai/","Runway":"https://app.runwayml.com/","Supabase":"https://supabase.com/dashboard","Render":"https://dashboard.render.com/",
  "Vercel":"https://vercel.com/login","Railway":"https://railway.com/login","Spotify":"https://open.spotify.com/","HubSpot":"https://app.hubspot.com/login",
  "PostHog":"https://app.posthog.com/","Amplitude":"https://app.amplitude.com/","Typeform":"https://admin.typeform.com/"
};
const PLUGIN_OAUTH={
  "Gmail":{provider:"google",authUrl:"https://accounts.google.com/o/oauth2/v2/auth",tokenUrl:"https://oauth2.googleapis.com/token",scopes:"openid email https://www.googleapis.com/auth/gmail.readonly",apiUrl:"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10",method:"GET"},
  "Google Drive":{provider:"google-drive",authUrl:"https://accounts.google.com/o/oauth2/v2/auth",tokenUrl:"https://oauth2.googleapis.com/token",scopes:"openid email https://www.googleapis.com/auth/drive.readonly",apiUrl:"https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,modifiedTime,webViewLink)",method:"GET"},
  "Google Calendar":{provider:"google-calendar",authUrl:"https://accounts.google.com/o/oauth2/v2/auth",tokenUrl:"https://oauth2.googleapis.com/token",scopes:"openid email https://www.googleapis.com/auth/calendar.readonly",apiUrl:"https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=20&singleEvents=true&orderBy=startTime",method:"GET"},
  "GitHub":{provider:"github",authUrl:"https://github.com/login/oauth/authorize",tokenUrl:"https://github.com/login/oauth/access_token",scopes:"read:user repo",apiUrl:"https://api.github.com/user/repos?sort=updated&per_page=20",method:"GET"},
  "Outlook Email":{provider:"microsoft-mail",authUrl:"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",tokenUrl:"https://login.microsoftonline.com/common/oauth2/v2.0/token",scopes:"openid profile offline_access Mail.Read",apiUrl:"https://graph.microsoft.com/v1.0/me/messages?$top=10",method:"GET"},
  "Teams":{provider:"microsoft-teams",authUrl:"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",tokenUrl:"https://login.microsoftonline.com/common/oauth2/v2.0/token",scopes:"openid profile offline_access User.Read Team.ReadBasic.All",apiUrl:"https://graph.microsoft.com/v1.0/me/joinedTeams",method:"GET"},
  "Slack":{provider:"slack",authUrl:"https://slack.com/oauth/v2/authorize",tokenUrl:"https://slack.com/api/oauth.v2.access",scopes:"channels:read users:read",apiUrl:"https://slack.com/api/conversations.list?limit=100",method:"GET",requiresSecret:true},
  "Notion":{provider:"notion",authUrl:"https://api.notion.com/v1/oauth/authorize",tokenUrl:"https://api.notion.com/v1/oauth/token",scopes:"",apiUrl:"https://api.notion.com/v1/search",method:"POST",requiresSecret:true},
  "Spotify":{provider:"spotify",authUrl:"https://accounts.spotify.com/authorize",tokenUrl:"https://accounts.spotify.com/api/token",scopes:"user-read-private user-read-email",apiUrl:"https://api.spotify.com/v1/me",method:"GET"}
};
const CONNECTOR_APPS=new Set(["Gmail","Google Drive","Google Calendar","GitHub","Canva","Notion","monday.com","Atlassian Rovo","Vercel"]);
const PLUGIN_CATALOG=[
  ["Popular","Gmail","Read and organise your Gmail emails","@gmail","M","gmail"],
  ["Popular","Google Drive","Documents, spreadsheets and presentations in Drive","@drive","△","googledrive"],
  ["Popular","GitHub","Issues, pull requests and code repositories","@github","GH","github"],
  ["Popular","Remote Desktop Commander","Automation and remote control","@remote","DC"],
  ["Popular","Health","Your health data","@health","♥"],
  ["Popular","Outlook Email","Your Outlook emails","@outlook","O","microsoftoutlook"],
  ["New and notable","Adobe","Create, combine and edit documents and graphics","@adobe","A","adobe"],
  ["New and notable","Figma","Interface design and prototypes","@figma","F","figma"],
  ["New and notable","MagicPath","Design on a shared canvas","@magicpath","MP"],
  ["New and notable","Canva","Create and edit designs","@canva","C","canva"],
  ["New and notable","Shopify","Run your online store","@shopify","S","shopify"],
  ["New and notable","Atlassian Rovo","Jira, Confluence, Loom and more","@rovo","A","atlassian"],
  ["Productivity","Firecrawl","Search and extract data from the web","@firecrawl","🔥"],
  ["Productivity","Flaim Fantasy","Fantasy sports analysis","@flaim","FF"],
  ["Productivity","monday.com","Projects, tasks and CRM","@monday","M","mondaydotcom"],
  ["Productivity","Notion","Notion documents and workflows","@notion","N","notion"],
  ["Productivity","Google Calendar","Your Google Calendar events","@calendar","31","googlecalendar"],
  ["Productivity","Metricool","Analyse and schedule posts","@metricool","∞"],
  ["Communication","Slack","Slack channels and messages","@slack","S","slack"],
  ["Communication","Teams","Microsoft Teams teams and chats","@teams","T","microsoftteams"],
  ["Communication","Zoom","Information from Zoom meetings","@zoom","Z","zoom"],
  ["Communication","Superhuman Mail","Email and calendar assistant","@superhuman","✉"],
  ["Communication","Hostinger Mail","Email hosted at Hostinger","@hostinger","H","hostinger"],
  ["Communication","Mailopoly Inbox","Search and send emails and messages","@mailopoly","◇"],
  ["Creativity","Higgsfield","AI models for pictures and video","@higgsfield","HF"],
  ["Creativity","Viewmax","Videos made with AI","@viewmax","▶"],
  ["Creativity","Runway","Video generation with AI models","@runway","R","runway"],
  ["Creativity","invideo","Videos of any length","@invideo","IV"],
  ["Developer tools","Supabase","Manage and query databases","@supabase","S","supabase"],
  ["Developer tools","Render","Your resources on Render","@render","R","render"],
  ["Developer tools","WPVibe","AI tools for WordPress","@wpvibe","WP"],
  ["Developer tools","Exa","Web search for AI agents","@exa","E"],
  ["Developer tools","Vercel","Build and publish web apps","@vercel","▲","vercel"],
  ["Developer tools","Railway","Build and publish apps","@railway","R","railway"],
  ["Health","COROS","Workouts and health data","@coros","C","coros"],
  ["Health","Tredict","Analyse workouts and make plans","@tredict","T"],
  ["Health","freddy","Questions about your health data","@freddy","F"],
  ["Health","Fitness AI Connector","AI coach for your Garmin data","@fitness","AI"],
  ["Health","Calorie Tracker","Track food and calories","@calories","CT"],
  ["Health","LiftTrack","Strength workouts for Garmin","@lifttrack","LT"],
  ["Entertainment","Destiny AI Astrology","Birth charts and horoscope","@destiny","D"],
  ["Entertainment","Smart Chess","Play chess and learn strategy","@chess","♞"],
  ["Entertainment","Spotify","Music and podcasts","@spotify","●","spotify"],
  ["Entertainment","Chessy",`Play chess with ${BRAND_NAME}`,"@chessy","♘"],
  ["Entertainment","SoundBreak","AI music with artists","@soundbreak","◉"],
  ["Entertainment","PocketMind: Texas Hold'em","Texas Hold'em poker with AI","@pocketmind","♠"],
  ["Education","Consensus","Explore scientific research","@consensus","C"],
  ["Education","SciSpace","For science and research","@scispace","S"],
  ["Education","Acumen by Talarion","Keeps the AI up to date with the news","@acumen","T"],
  ["Education","Explain Video Generator","Explainer videos made with AI","@explain","▶"],
  ["Education","Scite","Search the scientific literature","@scite","S"],
  ["Education","Tarteel","Resources for studying the Quran","@tarteel","◇"],
  ["Business and operations","HubSpot","Data and actions in HubSpot","@hubspot","H","hubspot"],
  ["Business and operations","Windsor.ai","Connect over 350 data sources","@windsor","W"],
  ["Business and operations","Adspirer","Create, launch and analyse ads","@adspirer","AD"],
  ["Business and operations","vidIQ","YouTube statistics and keywords","@vidiq","IQ"],
  ["Business and operations","Ubersuggest","SEO research","@ubersuggest","U"],
  ["Data and analytics","PostHog","Analyse your product data","@posthog","PH","posthog"],
  ["Data and analytics","Helium 10","Your Helium 10 data","@helium","H10"],
  ["Data and analytics","Blockscout","Analyse blockchain data","@blockscout","B","blockscout"],
  ["Data and analytics","Data","Answers from your data","@data","▥"],
  ["Data and analytics","Amplitude","Analyse user behaviour","@amplitude","A","amplitude"],
  ["Data and analytics","Typeform","Forms and answer analysis","@typeform","T","typeform"],
  ["Scientific research","Undermind","Find and read scientific papers","@undermind","U"],
  ["Scientific research","Inductive","State-of-the-art ADMET models","@inductive","I"],
  ["Scientific research","Boltz","Structures, molecules and proteins","@boltz","B"],
  ["Scientific research","Tamarind Bio","Protein and molecular design","@tamarind","TB"],
  ["Scientific research","Proto","AI models for biology","@proto","P"],
  ["Scientific research","Rowan","Chemistry and biology simulations","@rowan","R"],
  ["Security","Codex Security","Security scanning for code","@codexsecurity","CS"],
  ["Security","PrivacyHawk","Protects personal data","@privacyhawk","PH"],
  ["Security","Soluvery","Audit Google Drive permissions","@soluvery","S"],
  ["Security","Malwarebytes","Check links, domains and phone numbers","@malwarebytes","M","malwarebytes"],
  ["Security","AJAXX Data Scrubber","Remove exposed personal data","@ajaxx","AX"],
  ["Security","Ansvar Gateway","Laws, security and compliance","@ansvar","AI"],
  ["Other","Tarot","Tarot readings","@tarot","✦"],
  ["Other","Astrologic","Birth charts and horoscope","@astrologic","☾"],
  ["Other","Kleinanzeigen","Classified ads in Germany","@kleinanzeigen","K","kleinanzeigen"],
  ["Other","Steer Astro","Personal AI astrologer","@steerastro","◎"]
].map(([group,name,description,trigger,mark,slug])=>({group,name,description,trigger,mark,slug}))
  // 0.7.30: these are connectors now (Extensions → Connectors, each person signs in with their own account).
  .filter(x=>!CONNECTOR_APPS.has(x.name))
  // 0.7.30 (approved by the Owner): only entries that work; names with nothing behind them («API only») are gone.
  .filter(x=>PLUGIN_APP_LINKS[x.name]||PLUGIN_OAUTH[x.name]);
const PLUGIN_GROUPS=["Popular","New and notable","Productivity","Communication","Creativity","Developer tools","Health","Entertainment","Education","Business and operations","Data and analytics","Scientific research","Security","Other"];
const SKILLS=[
  {name:"Web search",description:"Searches current information and online sources.",mark:"W",perm:"web_search"},
  {name:"Documents",description:"Makes and works with PDF, DOCX and PPTX.",mark:"D",perm:"document_generation"},
  {name:"Code and GitHub",description:"Analyses code and works with GitHub.",mark:"</>",perm:"github_access"},
  {name:"Pictures",description:"Makes pictures with AI.",mark:"I",perm:"image_generation"},
  {name:"Files and data",description:"Analyses uploaded files, tables and documents.",mark:"∑",perm:"file_upload"},
  {name:"Scheduled",description:"Runs scheduled tasks and checks at the time you choose.",mark:"S",perm:"automations"}
];
function pluginHasIntegration(x){return !!(PLUGIN_APP_LINKS[x.name]||PLUGIN_OAUTH[x.name]);}

function SetupOverlay({onClose,children}) {
  const {ref,backdropProps}=useModal(onClose);
  return <div className="claudeSetupBackdrop" {...backdropProps}><div className="claudeSetupPanel" ref={ref} role="dialog" aria-modal="true" aria-label={tr("Plugin setup")} tabIndex={-1}>{children}</div></div>;
}
function ResultNote({result}){return result?<div className={cx("pluginResult claudeResult",result.kind)} role={result.kind==="error"?"alert":"status"}>{result.text}</div>:null;}

const BLANK_PLUGIN={name:"",description:"",url:"",method:"POST",auth:"none",headerName:"X-API-Key",apiKey:"",auto:false,trigger:"",oauthClientId:"",oauthClientSecret:""};
function initials(name){return String(name||"P").replace(/[^\p{L}\p{N} ]/gu,"").split(/\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,2).toUpperCase()||"P";}
function hostOf(url){try{return new URL(url).host}catch{return ""}}
export function pluginTriggerHint(name,trigger){
  const n=String(name||"").trim(),t=trigger||("@"+n.toLowerCase().replace(/\s+/g,"-"));
  return n.length>=3?tr("Used when you write «{name}» or {trigger}",{name:n,trigger:t}):tr("Used when you write {trigger}",{trigger:t});
}
// 0.7.30: the app's own logo (carried with the app, no request to another site), otherwise its letters.
function PluginLogo({entry,large=false}){
  const [failed,setFailed]=useState(false);
  const src=failed?"":brandIcon(entry?.slug);
  return <span className={cx("pluginLogo",large&&"large",src&&"brand")}>{src?<img src={src} alt="" draggable="false" onError={()=>setFailed(true)}/>:<span>{entry?.mark||initials(entry?.name)}</span>}</span>;
}

function PluginForm({initial,editing,onSaved,onCancel}){
  const [f,setF]=useState(initial),[note,setNote]=useState(null),[busy,setBusy]=useState("");
  const mounted=useRef(true),urlRef=useRef(null);
  useEffect(()=>()=>{mounted.current=false},[]);
  useEffect(()=>{setF(initial);setNote(null);if(initial.name&&!initial.url)setTimeout(()=>urlRef.current?.focus(),0)},[initial]);
  const set=patch=>setF(v=>({...v,...patch}));
  const direct=editing?.mode==="direct_app",oauth=!!editing?.oauthConnected;
  function problem(){
    if(!f.name.trim())return tr("Write a name for the plugin.");
    if(!isHttpUrl(f.url))return tr("The API address must be a full link, for example https://example.com/webhook.");
    if(f.auth==="header"&&!/^[A-Za-z0-9-]{1,64}$/.test(f.headerName.trim()))return tr("The header name can only contain letters, digits and hyphens.");
    if(f.auth!=="none"&&!f.apiKey.trim()&&!editing?.hasKey)return tr("Add the key or choose «None» for authentication.");
    return "";
  }
  function body(){
    const out={name:f.name.trim(),description:f.description.trim(),url:f.url.trim(),auto:!!f.auto};
    if(!direct){out.method=f.method;}
    if(!direct&&!oauth){
      out.authType=f.auth==="header"?"header":"bearer";
      if(f.auth==="header")out.headerName=f.headerName.trim();
      if(f.auth==="none"&&editing?.hasKey)out.apiKey="__CLEAR__";
      else if(f.auth!=="none"&&f.apiKey.trim())out.apiKey=f.apiKey.trim();
    }
    return out;
  }
  async function persist(){
    const d=editing?await api(`/api/plugins/${editing.id}`,{method:"PATCH",body:JSON.stringify(body())}):await api("/api/plugins",{method:"POST",body:JSON.stringify(body())});
    return d.data;
  }
  async function save(e){
    e?.preventDefault?.();
    if(busy)return;
    const p=problem();if(p){setNote({kind:"error",text:p});return;}
    setBusy("save");setNote(null);
    try{const saved=await persist();onSaved(saved,{kind:"ok",text:tr("{name}: the plugin was saved.",{name:saved?.name||f.name.trim()})},true)}
    catch(err){if(mounted.current)setNote({kind:"error",text:err.message})}
    finally{if(mounted.current)setBusy("")}
  }
  async function test(){
    if(busy)return;
    const p=problem();if(p){setNote({kind:"error",text:p});return;}
    setBusy("test");setNote({kind:"info",text:tr("Saving the plugin and testing it…")});
    try{
      const saved=await persist();
      onSaved(saved,null,false);
      try{const d=await api(`/api/plugins/${saved.id}/test`,{method:"POST",body:JSON.stringify({message:`Connection test ${BRAND_NAME}`})});if(mounted.current)setNote({kind:"ok",text:tr("Test passed: {result}",{result:String(d.result||tr("connection works")).slice(0,600)})})}
      catch(err){if(mounted.current)setNote({kind:"error",text:tr("The plugin was saved, but the test failed: {error}",{error:err.message})})}
    }catch(err){if(mounted.current)setNote({kind:"error",text:err.message})}
    finally{if(mounted.current)setBusy("")}
  }
  return <form className="pluginCreateForm" onSubmit={save} noValidate>
    <div className="pluginCreateIntro"><Puzzle size={20}/><div><b>{editing?tr("Edit «{name}»",{name:editing.name}):tr("Create a plugin")}</b><span>{tr("Connect any API or webhook.")} {pluginTriggerHint(f.name||tr("Name"),f.trigger||undefined)}.</span></div></div>
    <div className="pluginFormGrid">
      <label>{tr("Name")}<input value={f.name} maxLength={80} onChange={e=>set({name:e.target.value})} placeholder={tr("E.g. Weather")}/></label>
      <label>{tr("Description")}<input value={f.description} maxLength={500} onChange={e=>set({description:e.target.value})} placeholder={tr("What the plugin does")}/></label>
    </div>
    <label>{tr("API address")}<input ref={urlRef} value={f.url} onChange={e=>set({url:e.target.value})} inputMode="url" placeholder="https://api.example.com/data"/></label>
    {!direct&&<div className="pluginFormGrid">
      <label>{tr("Method")}<select value={f.method} onChange={e=>set({method:e.target.value})}><option value="GET">GET</option><option value="POST">POST</option>{!["GET","POST"].includes(f.method)&&<option value={f.method}>{f.method}</option>}</select></label>
      {!oauth&&<label>{tr("Authentication")}<select value={f.auth} onChange={e=>set({auth:e.target.value})}><option value="none">{tr("None")}</option><option value="bearer">Bearer token</option><option value="header">{tr("Custom header")}</option></select></label>}
    </div>}
    {!direct&&!oauth&&f.auth!=="none"&&<div className="pluginFormGrid">
      {f.auth==="header"&&<label>{tr("Header name")}<input value={f.headerName} onChange={e=>set({headerName:e.target.value})} placeholder="X-API-Key"/></label>}
      <label>{tr("API key")}<input type="password" value={f.apiKey} onChange={e=>set({apiKey:e.target.value})} placeholder={editing?.hasKey?tr("Key saved — leave empty to keep it"):tr("Key / token")} autoComplete="off"/></label>
    </div>}
    <label className="checkRow"><input type="checkbox" checked={f.auto} onChange={e=>set({auto:e.target.checked})}/><span><b>{tr("Use it on its own when it is relevant")}</b><small>{tr("Otherwise it runs only when you write its name or @trigger in chat.")}</small></span></label>
    {note&&<ResultNote result={note}/>}
    <div className="pluginFormActions">
      {editing&&<button type="button" className="secondary" onClick={onCancel}>{tr("Cancel")}</button>}
      <button type="button" className="secondary" onClick={test} disabled={!!busy}><Play size={14}/> {busy==="test"?tr("Testing…"):tr("Test")}</button>
      <button className="primary" disabled={!!busy}><Check size={15}/> {busy==="save"?tr("Saving…"):tr("Save")}</button>
    </div>
  </form>;
}

function CatalogSetup({selected,onClose,onDone,reload}){
  const [form,setForm]=useState({...BLANK_PLUGIN,name:selected.name,description:selected.description,trigger:selected.trigger}),[setupResult,setSetupResult]=useState(null),[saving,setSaving]=useState(""),[redirectUri,setRedirectUri]=useState("");
  const oauthTimer=useRef(null),mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false;clearInterval(oauthTimer.current)},[]);
  async function addApi(e){
    e?.preventDefault?.();
    if(saving)return;
    if(!form.name.trim()){setSetupResult({kind:"error",text:tr("Write a name for the plugin.")});return;}
    if(!isHttpUrl(form.url)){setSetupResult({kind:"error",text:tr("The API address must be a full link, for example https://example.com/webhook.")});return;}
    setSaving("api");setSetupResult(null);
    try{
      await api("/api/plugins",{method:"POST",body:JSON.stringify({name:form.name.trim(),description:form.description,url:form.url.trim(),method:form.method,trigger:form.trigger,auto:form.auto,...(form.apiKey.trim()?{apiKey:form.apiKey.trim()}:{})})});
      onDone({kind:"ok",text:tr("{name}: the plugin was connected.",{name:form.name.trim()})});
    }catch(err){if(mounted.current)setSetupResult({kind:"error",text:err.message})}
    finally{if(mounted.current)setSaving("")}
  }
  async function connectOAuth(){
    if(!selected?.oauth||saving)return;
    if(!form.oauthClientId.trim()){setSetupResult({kind:"error",text:tr("The OAuth Client ID is missing.")});return;}
    if(selected.oauth.requiresSecret&&!form.oauthClientSecret.trim()){setSetupResult({kind:"error",text:tr("This service also needs the OAuth Client Secret.")});return;}
    setSaving("oauth");setSetupResult(null);
    try{
      const d=await api("/api/plugins/oauth/start",{method:"POST",body:JSON.stringify({
        name:form.name||selected.name,description:form.description||selected.description,trigger:form.trigger||selected.trigger,auto:form.auto,
        clientId:form.oauthClientId.trim(),clientSecret:form.oauthClientSecret.trim(),...selected.oauth
      })});
      if(d.redirectUri)setRedirectUri(d.redirectUri);
      const opened=await window.Serasmart?.openExternal?.(d.authorizeUrl);
      if(opened&&!opened.ok)throw new Error(opened.error||tr("The OAuth page could not be opened."));
      setSetupResult({kind:"info",text:tr("The sign-in opened in the browser. Finish it there; {brand} saves the connection on its own.",{brand:BRAND_NAME})});
      const name=String(selected.name).toLowerCase(),started=Date.now();
      clearInterval(oauthTimer.current);
      oauthTimer.current=setInterval(async()=>{
        try{
          const fresh=await reload();
          const connected=fresh.find(x=>String(x.name).toLowerCase()===name&&x.oauthConnected);
          if(connected||Date.now()-started>120000){
            clearInterval(oauthTimer.current);oauthTimer.current=null;
            if(!mounted.current)return;
            if(connected)onDone({kind:"ok",text:tr("{name}: connected.",{name:connected.name})});
            else setSetupResult({kind:"error",text:tr("The sign-in was not finished within 2 minutes. Try again.")});
          }
        }catch{}
      },2000);
    }catch(e){if(mounted.current)setSetupResult({kind:"error",text:tr("OAuth error — {error}",{error:e.message})})}
    finally{if(mounted.current)setSaving("")}
  }
  async function openProviderApp(){
    const url=selected?.appUrl;
    if(!url||saving)return;
    setSaving("direct");
    try{
      await api("/api/plugins/direct",{method:"POST",body:JSON.stringify({name:selected.name,description:selected.description,trigger:selected.trigger,appUrl:url})});
      const r=await window.Serasmart?.openExternal?.(url);
      if(r&&!r.ok)throw new Error(r.error||tr("The app could not be opened."));
      onDone({kind:"ok",text:tr("{name}: saved to open directly, without OAuth. Sign in as usual in the official app.",{name:selected.name})});
    }catch(e){if(mounted.current)setSetupResult({kind:"error",text:e.message})}
    finally{if(mounted.current)setSaving("")}
  }
  const redirectShown=redirectUri||`${String(GATEWAY).replace(/\/+$/,"")}${OAUTH_REDIRECT_PATH}`;
  return <SetupOverlay onClose={onClose}>
    <div className="claudeSetupHead">
      <PluginLogo entry={selected} large/>
      <div><h3>{selected.name}</h3><p>{selected.description}</p></div>
      <button className="iconOnly" onClick={onClose} aria-label={tr("Close")} title={tr("Close")}><X size={18}/></button>
    </div>
    <ResultNote result={setupResult}/>
    <div className="claudeSetupNotice"><Plug size={16}/><span>{tr("You can use the plugin without OAuth to open the app directly. OAuth or an API is needed only when you want {brand} to read or change private data in that service.",{brand:BRAND_NAME})}</span></div>
    {selected.appUrl&&<div className="pluginDirectConnect">
      <button className="primary" onClick={openProviderApp} disabled={!!saving}><ExternalLink size={16}/> {saving==="direct"?tr("Opening…"):tr("Connect without OAuth and open {name}",{name:selected.name})}</button>
      <small>{tr("{brand} saves the plugin as a direct link and opens the official app. You sign in as usual in the browser.",{brand:BRAND_NAME})}</small>
    </div>}
    <form className="claudeSetupForm" onSubmit={addApi}>
      <label>{tr("Name")}<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      {selected.oauth&&<div className="oauthBox">
        <label>OAuth Client ID<input placeholder={tr("Client ID of the app made at the provider")} value={form.oauthClientId} onChange={e=>setForm({...form,oauthClientId:e.target.value})}/></label>
        <label><span className="labelLine">OAuth Client Secret <span className="optional">{selected.oauth.requiresSecret?tr("required"):tr("optional / PKCE")}</span></span><input type="password" placeholder="Client Secret" value={form.oauthClientSecret} onChange={e=>setForm({...form,oauthClientSecret:e.target.value})}/></label>
        <small className="settingsHelp">{tr("The return address to register at the provider:")} <code>{redirectShown}</code></small>
        <button type="button" className="secondary pluginOAuthButton" onClick={connectOAuth} disabled={!!saving}><ExternalLink size={15}/> {saving==="oauth"?tr("Getting ready…"):tr("Connect with OAuth (access to data)")}</button>
      </div>}
      <label>{tr("Endpoint / webhook / custom API")}<input placeholder="https://…" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} inputMode="url"/></label>
      <div className="claudeFormRow"><label>Trigger<input placeholder="@gmail" value={form.trigger} onChange={e=>setForm({...form,trigger:e.target.value})}/></label><label>{tr("Method")}<select value={form.method} onChange={e=>setForm({...form,method:e.target.value})}><option>POST</option><option>GET</option></select></label></div>
      <label><span className="labelLine">{tr("API key")} <span className="optional">{tr("optional")}</span></span><input type="password" placeholder={tr("Key / token")} value={form.apiKey} onChange={e=>setForm({...form,apiKey:e.target.value})} autoComplete="off"/></label>
      <div className="claudeSetupActions"><button type="button" className="secondary" onClick={onClose}>{tr("Cancel")}</button><button className="primary" disabled={!form.name.trim()||!form.url.trim()||!!saving}>{saving==="api"?tr("Connecting…"):tr("Connect custom API")}</button></div>
    </form>
  </SetupOverlay>;
}

// 0.7.30: the API plugins, one of the three tabs of Extensions (pages/Extensions.jsx).
export function PluginsPanel(){
  const {can}=useAccess();
  useLanguage();
  // 0.7.29: the first tab is the connected apps (like Claude's connectors); the API plugins stay in the other tabs.
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[tab,setTab]=useState("packs"),[result,setResult]=useState(null);
  const [query,setQuery]=useState(""),[selected,setSelected]=useState(null),[testing,setTesting]=useState(null),[cardNotes,setCardNotes]=useState({});
  const [formInit,setFormInit]=useState(BLANK_PLUGIN),[editing,setEditing]=useState(null),[builtins,setBuiltins]=useState([]),[adding,setAdding]=useState("");
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);
  async function load(){
    try{const d=await api("/api/plugins");const list=d.data||[];if(mounted.current){setItems(list);setTab(t=>t||(list.length?"installed":"directory"))}return list}
    catch(e){if(mounted.current){setResult({kind:"error",text:tr("The plugins could not be loaded: {error}",{error:e.message})});setTab(t=>t||"directory")}return []}
    finally{if(mounted.current)setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  // Built-in plugins (0.7.18): they work as soon as they are added, with no account, key or OAuth.
  async function loadBuiltins(){try{const d=await api("/api/plugins/builtin");if(mounted.current)setBuiltins(d.data||[])}catch{}}
  useEffect(()=>{loadBuiltins()},[]);
  async function addBuiltin(b){
    if(adding)return;setAdding(b.key);
    try{await api("/api/plugins/builtin",{method:"POST",body:JSON.stringify({key:b.key})});await Promise.all([load(),loadBuiltins()]);setResult({kind:"ok",text:tr("{name} is ready. Write in chat, for example: {trigger}, or just ask.",{name:tr(b.title||b.name),trigger:b.trigger})});setTab("installed")}
    catch(e){toast(e.message)}finally{if(mounted.current)setAdding("")}
  }
  async function patch(x,p){try{await api(`/api/plugins/${x.id}`,{method:"PATCH",body:JSON.stringify(p)});await load()}catch(e){toast(e.message)}}
  async function test(x){
    if(testing)return;
    if(x.mode==="direct_app"&&(x.appUrl||x.url)){
      const r=await window.Serasmart?.openExternal?.(x.appUrl||x.url);
      if(!window.Serasmart?.openExternal)openLink(x.appUrl||x.url);
      setCardNotes(n=>({...n,[x.id]:r&&!r.ok?{kind:"error",text:tr("The app could not be opened — {error}",{error:r.error||tr("error")})}:{kind:"ok",text:tr("The app was opened.")}}));
      return;
    }
    setTesting(x.id);
    try{const d=await api(`/api/plugins/${x.id}/test`,{method:"POST",body:JSON.stringify({message:`Connection test ${BRAND_NAME}`})});if(mounted.current)setCardNotes(n=>({...n,[x.id]:{kind:"ok",text:tr("Works: {result}",{result:String(d.result||tr("connection works")).slice(0,300)})}}))}
    catch(e){if(mounted.current)setCardNotes(n=>({...n,[x.id]:{kind:"error",text:`Eroare — ${e.message}`}}))}
    finally{if(mounted.current)setTesting(null)}
  }
  async function remove(x){
    if(!confirm(tr("Delete the plugin «{name}»?",{name:x.name})))return;
    try{await api(`/api/plugins/${x.id}`,{method:"DELETE"});if(editing?.id===x.id){setEditing(null);setFormInit(BLANK_PLUGIN)}await load()}catch(e){toast(e.message)}
  }
  function edit(x){
    setEditing(x);
    setFormInit({...BLANK_PLUGIN,name:x.name||"",description:x.description||"",url:x.appUrl||x.url||"",method:x.method||"POST",auth:x.hasKey?(x.authType==="header"?"header":"bearer"):"none",headerName:x.headerName||"X-API-Key",auto:!!x.auto,trigger:x.trigger||""});
    setResult(null);setTab("create");
  }
  function addFromCatalog(x){
    setResult(null);
    if(pluginHasIntegration(x)){setSelected({...x,appUrl:PLUGIN_APP_LINKS[x.name]||"",oauth:PLUGIN_OAUTH[x.name]||null});return;}
    setEditing(null);setFormInit({...BLANK_PLUGIN,name:x.name,description:x.description,trigger:x.trigger});setTab("create");
  }
  function onSaved(saved,note,leave){
    load();
    if(leave){setEditing(null);setFormInit(BLANK_PLUGIN);setResult(note);setTab("installed");}
    else if(saved&&!editing)setEditing(saved);
  }
  const installedNames=new Set(items.map(x=>String(x.name||"").toLowerCase()));
  const normalized=query.trim().toLowerCase();
  const filtered=PLUGIN_CATALOG.filter(x=>!normalized||[x.name,x.description,x.group,tr(x.description),tr(x.group)].some(v=>v.toLowerCase().includes(normalized)));
  const groups=PLUGIN_GROUPS.map(group=>({group,items:filtered.filter(x=>x.group===group)})).filter(x=>x.items.length);
  const skills=SKILLS.filter(x=>!normalized||x.name.toLowerCase().includes(normalized)||x.description.toLowerCase().includes(normalized));
  const tabs=[["packs",tr("Skill plugins")],["installed",`${tr("API plugins")}${items.length?` (${items.length})`:""}`],["directory",tr("Plugin directory")],["create",editing?tr("Edit plugin"):tr("Create plugin")]];
  return <div className="pluginsPanel">
    <p className="panelLead">{tr("Write a plugin's name in chat (for example «Calendar») or @name and {brand} uses it for the answer.",{brand:BRAND_NAME})}</p>
    <div className="pageTabs" role="tablist" aria-label={tr("Plugin sections")}>
      {tabs.map(([k,label])=><button key={k} role="tab" aria-selected={tab===k} className={cx("pageTab",tab===k&&"active")} onClick={()=>{setTab(k);if(k==="create"&&editing&&tab!=="create"){setEditing(null);setFormInit(BLANK_PLUGIN)}}}>{label}</button>)}
    </div>
    <div className="pageBody" role="tabpanel">
      <ResultNote result={result}/>
      {tab==="packs"&&<SkillPacks/>}
      {tab==="installed"&&(loading?<div className="emptyState small">{tr("Loading the plugins…")}</div>:!items.length?<div className="taskEmpty">
        <span className="taskIcon big"><Puzzle size={26}/></span><h3>{tr("No API plugins yet")}</h3><p>{tr("Pick one from the directory or make your own from an API. Then write its name in chat and {brand} uses it.",{brand:BRAND_NAME})}</p>
        <div className="taskExamples"><button className="primary" onClick={()=>setTab("directory")}>{tr("Open the directory")}</button><button className="secondary" onClick={()=>setTab("create")}><Plus size={14}/> {tr("Create plugin")}</button></div>
      </div>:<div className="plugCards">
        {items.map(x=><div key={x.id} className={cx("plugCard",!x.enabled&&"off")}>
          <div className="plugCardTop"><PluginLogo entry={PLUGIN_CATALOG.find(c=>c.name.toLowerCase()===String(x.name||"").toLowerCase())||{name:x.name}}/><div className="plugCardText"><b title={x.name}>{x.name}</b><small>{x.description||hostOf(x.appUrl||x.url)}</small></div><Switch checked={x.enabled} label={tr(x.enabled?"Turn off {name}":"Turn on {name}",{name:x.name})} onChange={()=>patch(x,{enabled:!x.enabled})}/></div>
          <p className="pluginTrigger">{pluginTriggerHint(x.name,x.trigger)}</p>
          <small className="pluginMeta">{x.mode==="builtin"?tr("Included in {brand} · no account",{brand:BRAND_NAME}):x.mode==="direct_app"?tr("Opens the app directly"):x.oauthConnected?tr("Connected with OAuth"):`API · ${x.method||"POST"}${x.hasKey?` · ${tr("with key")}`:""}`}{x.auto?` · ${tr("automatic")}`:""}</small>
          {cardNotes[x.id]&&<ResultNote result={cardNotes[x.id]}/>}
          <div className="plugCardActions">
            <button className="smallBtn" onClick={()=>test(x)} disabled={testing===x.id}>{x.mode==="direct_app"?<><ExternalLink size={13}/> {tr("Open")}</>:<><Play size={13}/> {testing===x.id?tr("Testing…"):tr("Test")}</>}</button>
            {x.mode!=="builtin"&&<button className="smallBtn" onClick={()=>edit(x)}><Pencil size={13}/> {tr("Edit")}</button>}
            <button className="smallBtn dangerSmall" onClick={()=>remove(x)} aria-label={tr("Delete {name}",{name:x.name})}><Trash2 size={13}/> {tr("Delete")}</button>
          </div>
        </div>)}
      </div>)}
      {tab==="directory"&&<div className="pluginDirectory">
        <div className="pageSearch"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("Search the directory (name, category)")} aria-label={tr("Search plugins")}/></div>
        {builtins.length>0&&!normalized&&<section className="catalogSection builtinSection"><h3>{tr("Works right away")}</h3><div className="catalogGrid">
          {builtins.map(b=><div className="catalogCard" key={b.key}>
            <span className="pluginLogo"><span>{b.trigger.slice(1,2).toUpperCase()}</span></span>
            <div className="catalogText"><b>{tr(b.title||b.name)}</b><small>{tr(b.about||b.description)} · {tr("no account")}</small></div>
            {b.installed?<button className="smallBtn installed" onClick={()=>setTab("installed")} aria-label={`${b.name} este instalat`}><Check size={13}/> Instalat</button>
              :<button className="smallBtn addBtn" onClick={()=>addBuiltin(b)} disabled={adding===b.key} aria-label={tr("Add {name}",{name:tr(b.title||b.name)})}><Plus size={13}/> {adding===b.key?tr("Adding…"):tr("Add")}</button>}
          </div>)}
        </div></section>}
        {groups.map(({group,items:groupItems})=><section className="catalogSection" key={group}>
          <h3>{tr(group)}</h3>
          <div className="catalogGrid">
            {groupItems.map(x=>{const installed=installedNames.has(x.name.toLowerCase());return <div className="catalogCard" key={x.group+x.name}>
              <PluginLogo entry={x}/>
              <div className="catalogText"><b>{x.name}</b><small>{tr(x.description)}{!pluginHasIntegration(x)&&<em className="apiOnlyTag"> · {tr("API only")}</em>}</small></div>
              {installed?<button className="smallBtn installed" onClick={()=>setTab("installed")} aria-label={tr("{name} is installed",{name:x.name})}><Check size={13}/> {tr("Installed")}</button>
                :<button className="smallBtn addBtn" onClick={()=>addFromCatalog(x)} aria-label={tr("Add {name}",{name:x.name})}><Plus size={13}/> {tr("Add")}</button>}
            </div>})}
          </div>
        </section>)}
        {!groups.length&&<div className="emptyState small">{tr("No plugin found. You can make it in the «Create plugin» tab.")}</div>}
        {skills.length>0&&<section className="catalogSection"><h3>{tr("Included in {brand}",{brand:BRAND_NAME})}</h3><div className="catalogGrid">
          {skills.map(x=>{const ok=can(x.perm);return <div className={cx("catalogCard",!ok&&"locked")} key={x.name} title={ok?tr("Available for your account"):deniedMessage(x.perm)}>
            <span className="pluginLogo"><span>{x.mark}</span></span>
            <div className="catalogText"><b>{tr(x.name)}</b><small>{ok?tr(x.description):tr("Turned off by the Owner for your account.")}</small></div>
            {ok?<Check size={16} className="okIcon" aria-label={tr("Available")}/>:<Lock size={15} aria-label={tr("Turned off")}/>}
          </div>})}
        </div></section>}
      </div>}
      {tab==="create"&&<PluginForm initial={formInit} editing={editing} onSaved={onSaved} onCancel={()=>{setEditing(null);setFormInit(BLANK_PLUGIN);setTab("installed")}}/>}
    </div>
    {selected&&<CatalogSetup selected={selected} reload={load} onClose={()=>setSelected(null)} onDone={note=>{setSelected(null);setResult(note);load();setTab("installed")}}/>}
  </div>;
}
