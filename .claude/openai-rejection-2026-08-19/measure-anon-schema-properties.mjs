const U='https://mcp.ravenmcp.ai/api/mcp';
const H={'content-type':'application/json','accept':'application/json, text/event-stream'};
const r=await fetch(U,{method:'POST',headers:H,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
const t=await r.text();let j=null;for(const l of t.split('\n'))if(l.startsWith('data:')){try{j=JSON.parse(l.slice(5).trim())}catch{}}
if(!j)j=JSON.parse(t);
const names=new Set();
for(const tool of j.result.tools) for(const p of Object.keys(tool.inputSchema?.properties||{})) names.add(p);
const all=[...names].sort();
console.log('distinct input properties across 45 tools:',all.length);
console.log(all.join(' '));
