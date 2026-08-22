import { spawn } from 'node:child_process';
const p = spawn('node', ['dist/index.js'], {stdio:['pipe','pipe','pipe'], env:{...process.env, RAVEN_NO_USAGE_LOG:'1'}});
let buf='';
const send=o=>p.stdin.write(JSON.stringify(o)+'\n');
p.stdout.on('data',d=>{buf+=d;
  for(const line of buf.split('\n')){
    if(!line.trim())continue;
    try{const j=JSON.parse(line);
      if(j.id===2){
        console.log('top-level error object present:', j.error!==undefined);
        console.log('result.isError:', j.result && j.result.isError);
        console.log('content[0].text first 60:', JSON.stringify((j.result?.content?.[0]?.text||'').slice(0,60)));
        p.kill(); process.exit(0);
      }}catch{}
  }});
send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'t',version:'1'}}});
setTimeout(()=>{send({jsonrpc:'2.0',method:'notifications/initialized'});
  send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_design_system',arguments:{}}});},600);
setTimeout(()=>{console.log('TIMEOUT');p.kill();process.exit(1);},15000);
