// @ts-nocheck
'use client'

import { useEffect } from 'react'

export default function DesignSystemScripts() {
  useEffect(() => {
  // ---- token data ----
  const SURFACES = [
    ["--bg-base","#1a1a22","Page base — dark grey, not black"],
    ["--bg-surface","#212129","Cards, panels"],
    ["--bg-raised","#2a2a33","Raised / featured cards"],
    ["--bg-overlay","#32323d","Overlays, popovers"],
    ["--bg-alt","#16161e","Alternating / deepest"],
  ];
  const ACCENTS = [
    ["--accent-blue","#00BFFF","Primary"],
    ["--accent-cyan","#00E5FF","Secondary accent"],
    ["--accent-green","#00E676","Success / pass"],
    ["--accent-orange","#FFAB40","Warning / highlight"],
    ["--accent-pink","#FF4081","Error / fail"],
  ];
  const TEXTS = [
    ["--text-primary","#F0F0F2"],
    ["--text-secondary","#9498A0"],
    ["--text-tertiary","#8E929C"],
    ["--text-accent","#00BFFF"],
  ];
  const TYPE = [
    ["display","clamp(40,72)px","700","-0.02em","Hero headlines"],
    ["h2","clamp(24,32)px","700","-0.01em","Section titles"],
    ["h3","20px","600","0","Card titles"],
    ["body","16–18px","400","0","Paragraphs"],
    ["small","13–14px","400–500","0","Captions, descriptions"],
    ["mono-label","12px","500","0.14em ↑","Eyebrows, tool names"],
  ];
  const SPACING = [["--space-1",4],["--space-2",8],["--space-3",12],["--space-4",16],["--space-5",20],["--space-6",24],["--space-8",32],["--space-10",40],["--space-12",48],["--space-16",64],["--space-20",80],["--space-24",96],["--space-32",128]];
  const RADIUS = [["--radius-sm","8px"],["--radius-md","12px"],["--radius-lg","16px"],["--radius-xl","20px"],["--radius-2xl","24px"],["--radius-full","9999px"]];
  const MOTION = [["--duration-fast","150ms"],["--duration-normal","300ms"],["--duration-slow","600ms"]];

  // ---- WCAG contrast ----
  function hexToRgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.substr(i,2),16));}
  function lin(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
  function L(rgb){return 0.2126*lin(rgb[0])+0.7152*lin(rgb[1])+0.0722*lin(rgb[2]);}
  function ratio(a,b){const l1=L(hexToRgb(a)),l2=L(hexToRgb(b));return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);}

  // ---- render surfaces / accents ----
  function swatchHTML(tok,hex,role,textOn){
    return `<div class="swatch"><div class="chip" style="background:${hex}"><span class="mono" style="color:${textOn};font-size:12px">${hex}</span></div><div class="body"><div class="name">${tok}</div><div class="hex">${hex}</div><div class="role">${role}</div></div></div>`;
  }
  document.getElementById('surfaces').innerHTML = SURFACES.map(([t,h,r])=>swatchHTML(t,h,r,'#F0F0F2')).join('');
  document.getElementById('accents').innerHTML = ACCENTS.map(([t,h,r])=>swatchHTML(t,h,r,'#0a0a12')).join('');

  // ---- AA matrix: each text token on each surface ----
  let aaRows='', total=0, passes=0;
  const SURF_FOR_AA = SURFACES.slice(0,4); // base, surface, raised, overlay
  for(const [tt,th] of TEXTS){
    for(const [st,sh] of SURF_FOR_AA){
      const r = ratio(th,sh);
      const pass = r>=4.5, aaa = r>=7;
      total++; if(pass) passes++;
      const badge = aaa? '<span class="badge aaa">AAA</span>' : pass? '<span class="badge pass">AA</span>' : '<span class="badge fail">FAIL</span>';
      aaRows += `<tr><td class="mono">${tt}</td><td class="mono" style="color:var(--text-tertiary)">${st}</td><td class="sample" style="color:${th};background:${sh};border-radius:6px">The quick brown fox</td><td class="ratio">${r.toFixed(2)}:1</td><td>${badge}</td></tr>`;
    }
  }
  document.getElementById('aa-body').innerHTML = aaRows;
  const sum = document.getElementById('aa-summary');
  sum.textContent = `AA: ${passes}/${total} pass`;
  sum.style.borderColor = passes===total ? 'rgba(0,230,118,0.5)' : 'rgba(255,64,129,0.5)';

  // ---- type scale ----
  document.getElementById('type-scale').innerHTML = TYPE.map(([tok,size,wt,ls,role])=>{
    const px = tok==='display'?40 : tok==='h2'?30 : tok==='h3'?20 : tok==='body'?17 : tok==='small'?14 : 12;
    const mono = tok==='mono-label';
    const upper = mono?'text-transform:uppercase;letter-spacing:0.14em;':'';
    return `<div class="type-row"><span class="tok">${tok}</span><span style="font-family:${mono?'var(--font-mono)':'var(--font-body)'};font-size:${px}px;font-weight:${wt.split('–')[0]};${upper}color:var(--text-primary)">${mono?'get_principles':'Design intelligence'}</span><span class="spec">${size} · ${wt}${ls!=='0'?' · '+ls:''}</span></div>`;
  }).join('');

  // ---- spacing ----
  document.getElementById('spacing').innerHTML = SPACING.map(([tok,px])=>
    `<div class="space-row"><span class="tok">${tok}</span><span class="bar" style="width:${px}px"></span><span class="val">${px}px</span></div>`).join('');

  // ---- radius ----
  document.getElementById('radius').innerHTML = RADIUS.map(([tok,val])=>
    `<div class="radius-card"><div class="box" style="border-radius:${val==='9999px'?'9999px':val}"></div><div class="tok">${tok.replace('--radius-','')}</div><div class="val">${val}</div></div>`).join('');

  // ---- motion ----
  const mEl = document.getElementById('motion');
  mEl.innerHTML = MOTION.map(([tok,val])=>
    `<div class="motion-card" data-dur="${val}"><div class="tok">${tok.replace('--duration-','duration-')}</div><div class="val">${val} · ease-out spring</div><div class="track"><div class="dot"></div></div></div>`).join('');
  function play(card){
    const dot = card.querySelector('.dot'); const dur = card.dataset.dur;
    dot.style.transition='none'; dot.style.left='0';
    void dot.offsetWidth;
    dot.style.transition=`left ${dur} cubic-bezier(0.16,1,0.3,1)`;
    dot.style.left='calc(100% - 10px)';
  }
  [...mEl.children].forEach(c=>{ c.addEventListener('click',()=>play(c)); setTimeout(()=>play(c), 300); });

  }, [])

  return null
}
