import { buildServer } from "../../dist/index.js";
const s = buildServer({ remote: true });
const reg = s._registeredTools;
async function call(n,a){ try{ return await reg[n].handler(a,{signal:new AbortController().signal}); }catch(e){ return {__threw:String(e.message||e)}; } }
function j(r){ const t=r&&r.content&&r.content[0]&&r.content[0].text; return {isError: r&&('isError' in r)?r.isError:'<ABSENT>', text:(t||JSON.stringify(r)).slice(0,150)}; }
console.log("compose_system valid-shape unknown system:");
console.log(JSON.stringify(j(await call("compose_system",{compositions:[{system:"zzz",group:"color"}]}))));
console.log("\ncompose_system valid system, bogus group:");
console.log(JSON.stringify(j(await call("compose_system",{compositions:[{system:"linear",group:"zzz"}]}))));
