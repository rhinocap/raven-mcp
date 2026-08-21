// Replays every test case in R1-test-cases.md VERBATIM against the hosted anonymous
// endpoint -- the surface OpenAI actually reviews -- and asserts the expectations that
// document states. Run it with `node .claude/openai-rejection-2026-08-19/replay-r1-cases.mjs`;
// no auth, no fixture, no local checkout, exit 0 iff every case reproduces.
//
// WHY THIS FILE EXISTS. OpenAI's R1 rejection was a stored expected value that could not
// be reproduced. A document asserting its own correctness is the same failure one level
// up, so the expectations are executable rather than prose. Written 2026-08-21, and it
// immediately earned its keep -- replaying the eight cases found THREE defects in the
// document written to FIX R1:
//   * N3 expected "a JSON-RPC error -32602". The hosted Streamable-HTTP surface returns
//     HTTP 200 with result.isError=true and the -32602 text INSIDE content[0].text.
//     Transport shapes an error's form; the stdio build is where the old wording is true.
//   * N1 quoted a 95.2 s floor. The shipped decline sentence says `95s` -- 95.2 is the
//     adverse-pass measurement, not the product string. It asserts substrings now.
//   * The closing line claimed "the slowest is 322 ms" while N2 renders a live page and
//     runs 0.7-4 s.
//
// TWO TRAPS, both hit while writing this, both worth carrying:
//   * The harness's own expected values are claims. Two "failures" in the first run were
//     MY key names, not product defects -- audit_contrast nests rows under `rows`, and
//     audit_tap_targets uses `minSize`/`passing`/`failing`, not snake_case. Dump the raw
//     payload before believing a red.
//   * Latencies are CONTEXT, never expectations. Network timing is the archetypal moving
//     input, which is the whole R1 lesson. The only timing assertion here is N1's
//     sub-second bound, which is load-bearing: it proves the tool REFUSES rather than
//     attempting the work and timing out.

const B="https://mcp.ravenmcp.ai/api/mcp";
async function call(n,a){const t=Date.now();
 const r=await fetch(B,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:n,arguments:a}})});
 const b=await r.text();const j=JSON.parse(b.trim().split("\n").filter(Boolean).pop().replace(/^data: /,""));
 return{ms:Date.now()-t,http:r.status,j,txt:j.result?j.result.content[0].text:null,isErr:j.result?j.result.isError:undefined,proto:j.error!==undefined};}
let bad=0;const ok=(c,m)=>{if(!c)bad++;console.log(`${c?"PASS":"FAIL"}  ${m}`);};
const P1=await call("audit_contrast",{dom_snapshot:[{selector:"p.ok",color:"#111111",bgColor:"#ffffff",fontPx:16,bold:false,text:"Passing body copy at 16px on white."},{selector:"p.fail",color:"#bbbbbb",bgColor:"#ffffff",fontPx:16,bold:false,text:"Failing low-contrast copy at 16px on white."}]});
const d1=JSON.parse(P1.txt),r1=d1.rows;
ok(P1.isErr===undefined&&r1.length===2&&r1[0].ratio===18.88&&r1[1].ratio===1.92&&r1[1].delta_to_aa===2.58&&r1[1].required_aa===4.5&&r1[1].large===false&&d1.aa_fail_count===1&&P1.txt.length===1694,`P1 ${P1.ms}ms len=${P1.txt.length} 18.88/1.92 delta=2.58 aa_fail=1`);
const P2=await call("audit_tap_targets",{elements:[{selector:"a.tap-ok",w:48,h:48,x:0,y:0,role:"link",text:"A"},{selector:"a.tap-small",w:20,h:20,x:60,y:0,role:"link",text:"B"}]});
const d2=JSON.parse(P2.txt),f=d2.fix_table[0];
ok(d2.minSize===44&&d2.total===2&&d2.passing===1&&d2.failing===1&&f.selector==="a.tap-small"&&f.deficit_w===24&&f.deficit_h===24&&P2.txt.length===388,`P2 ${P2.ms}ms len=${P2.txt.length} 44/2/1/1 deficit=24,24`);
const P3=await call("get_principles",{context:"landing page"});const d3=JSON.parse(P3.txt);
ok(d3.count===d3.principles.length&&d3.count>=20&&d3.principles.every(p=>p.id&&p.name&&p.category&&p.summary)&&d3.principles.some(p=>p.id==="color-palette-discipline"),`P3 ${P3.ms}ms count=${d3.count} invariants hold`);
const P4a=await call("list_design_systems",{});const d4=JSON.parse(P4a.txt);
ok(d4.count===12&&JSON.stringify(d4).includes("stripe"),`P4a ${P4a.ms}ms count=12 incl stripe`);
const P4b=await call("get_design_system",{id:"stripe"});
ok(P4b.txt.includes("#635BFF")&&P4b.txt.length===8619,`P4b ${P4b.ms}ms len=${P4b.txt.length} #635BFF`);
const P5=await call("get_checklist",{type:"landing-page"});const d5=JSON.parse(P5.txt);
ok(d5.pattern_match==="matched"&&d5.platform==="responsive"&&P5.txt.length===1404,`P5 ${P5.ms}ms matched/responsive len=${P5.txt.length}`);
const N1=await call("audit_url",{url:"https://example.com"});
ok(N1.http===200&&N1.proto===false&&N1.isErr===true
 &&N1.txt.includes("audit_url is disabled on the hosted (remote) endpoint")
 &&N1.txt.includes("MEASURED at 95s in its cheapest single-viewport single-theme configuration and past 120s with defaults")
 &&N1.txt.includes("npx raven-mcp")&&N1.txt.includes("audit_page")&&N1.ms<1000,`N1 ${N1.ms}ms isError=true, all 3 substrings verbatim, sub-second`);
const N2=await call("audit_contrast",{url:"https://example.com"});const d2b=JSON.parse(N2.txt);
ok(N2.isErr===undefined&&d2b.url==="https://example.com"&&typeof d2b.total_text_elements==="number",`N2 ${N2.ms}ms not declined, url+tally present (tally=${d2b.total_text_elements})`);
const N3=await call("get_design_system",{});
ok(N3.http===200&&N3.isErr===true&&N3.proto===false
 &&N3.txt.startsWith("MCP error -32602: Input validation error: Invalid arguments for tool get_design_system:")
 &&N3.txt.includes('"path"')&&N3.txt.includes('"id"')&&N3.txt.includes('"expected": "string"')
 &&N3.txt.includes('"received": "undefined"')&&N3.txt.includes('"message": "Required"'),`N3 ${N3.ms}ms http=200 isError=true error-object absent`);
console.log(`\n8 cases (9 calls), ${bad} failing`);
process.exitCode = bad?1:0;
