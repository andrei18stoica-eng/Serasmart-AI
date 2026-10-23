// 0.7.34: writes lib/i18n-keys.json — every interface text (the English keys of the Romanian table in locales.js), so
// the server can translate the whole app into each language ahead of time (POST /api/i18n/prefill, Owner only).
// Run after adding texts: node scripts/build-i18n-keys.cjs   (test-0734-i18n.cjs checks it is up to date)
// 0.7.38: the translations in i18n-src/ point at texts by their line in that file («N|text»), and a new text moves the
// lines after it. So this script also renumbers i18n-src/*.txt to the new lines (a text that was removed is dropped);
// the new texts are then added at the end of a language's last part.
const fs=require("fs"),path=require("path"),{pathToFileURL}=require("url");
const root=path.join(__dirname,"..");
async function keys(){const {LOCALES}=await import(pathToFileURL(path.join(root,"renderer/src/locales.js")).href);return Object.keys(LOCALES.ro).sort();}
function renumber(oldKeys,newKeys){
  const dir=path.join(root,"i18n-src");let files=[];try{files=fs.readdirSync(dir).filter(f=>/\.txt$/.test(f))}catch{return 0}
  const at=new Map(newKeys.map((k,i)=>[k,i+1]));let moved=0;
  for(const f of files){
    const file=path.join(dir,f),lines=fs.readFileSync(file,"utf8").split(/\r?\n/),out=[];
    for(const line of lines){
      const m=line.match(/^(\d+)\|(.*)$/);if(!m){if(line.trim())out.push(line);continue;}
      const n=at.get(oldKeys[Number(m[1])-1]);if(!n)continue;
      if(n!==Number(m[1]))moved++;out.push(`${n}|${m[2]}`);
    }
    fs.writeFileSync(file,out.join("\n")+"\n");
  }
  return moved;
}
module.exports={keys,renumber};
if(require.main===module)keys().then(k=>{
  const file=path.join(root,"lib/i18n-keys.json");
  let old=[];try{old=JSON.parse(fs.readFileSync(file,"utf8"))}catch{}
  fs.writeFileSync(file,JSON.stringify(k,null,0).replace(/","/g,'",\n"')+"\n");
  const moved=old.length&&old.join("\n")!==k.join("\n")?renumber(old,k):0;
  console.log(`lib/i18n-keys.json: ${k.length} texts${moved?`; i18n-src renumbered (${moved} lines moved)`:""}`);
});
