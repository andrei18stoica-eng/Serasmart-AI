// 0.7.34: writes lib/i18n-keys.json — every interface text (the English keys of the Romanian table in locales.js), so
// the server can translate the whole app into each language ahead of time (POST /api/i18n/prefill, Owner only).
// Run after adding texts: node scripts/build-i18n-keys.cjs   (test-0734-i18n.cjs checks it is up to date)
const fs=require("fs"),path=require("path"),{pathToFileURL}=require("url");
const root=path.join(__dirname,"..");
async function keys(){const {LOCALES}=await import(pathToFileURL(path.join(root,"renderer/src/locales.js")).href);return Object.keys(LOCALES.ro).sort();}
module.exports={keys};
if(require.main===module)keys().then(k=>{fs.writeFileSync(path.join(root,"lib/i18n-keys.json"),JSON.stringify(k,null,0).replace(/","/g,'",\n"')+"\n");console.log(`lib/i18n-keys.json: ${k.length} texts`)});
