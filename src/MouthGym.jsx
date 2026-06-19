// MOUTHQUEST prototype v3
// Kids' brushing game: a healthy-lifestyle space hero in four action scenes,
// one per quadrant of the mouth. Real Oral-B brushing drives every scene.
//   0 CYCLE & BLAST (top-left)   pedals, lasers germs that rush in
//   1 RUN & LEAP   (top-right)   germs charge him; a well-timed jump pops them
//   2 DEEP BLAST   (bottom-left) swims forward, lasers germs underwater
//   3 SPIRE CLIMB  (bottom-right)scales the wall, knocks germs off as he climbs
// Giant teeth frame each scene by quadrant so it always reads as a mouth, and
// the teeth whiten + sparkle as that quarter fills. Includes a parent Stats tab.
//
// Real brush (Android): deploy to your own https origin, Chrome with
// chrome://flags experimental-web-platform-features on, tap Connect Oral-B.
// Demoable now via Simulate brushing.

import React, { useEffect, useRef, useState, useCallback } from "react";

/* ===================== ORAL-B ADVERTISEMENT PARSER (faithful oralb-ble port) ===================== */
const ORALB_MANUFACTURER = 0x00dc;
const STATES = { 0:"unknown",1:"initializing",2:"idle",3:"running",4:"charging",5:"setup",6:"flight menu",8:"selection menu",9:"off",113:"final test",114:"pcb test",115:"sleeping",116:"transport" };
const PRESSURE = { 0:"normal",16:"normal",32:"normal",48:"normal",50:"normal",54:"button",56:"power button",58:"power button",80:"normal",82:"normal",86:"button",90:"power button",114:"normal",118:"button",122:"power button",144:"high",146:"high",150:"button",154:"power button",178:"high",182:"button",186:"power button",192:"high",240:"high",242:"high" };
const IO_MODES = { 0:"daily clean",1:"sensitive",2:"gum care",3:"whiten",4:"intense",5:"super sensitive",6:"tongue",8:"settings",9:"off" };
const SMART_MODES = { 0:"off",1:"daily clean",2:"sensitive",3:"massage",4:"whitening",5:"deep clean",6:"tongue",7:"turbo",255:"unknown" };
const IO_MODEL_IDS = new Set([48,49,50,52,53,54]);
function modelName(id){ if(IO_MODEL_IDS.has(id))return"iO Series"; if(id>=32&&id<=34)return"Genius (D701)"; if(id>=39&&id<=41)return"Smart Series (D700)"; if(id>=112&&id<=119)return"Genius X (D706)"; if(id>=64&&id<=70)return"Smart Series (D21)"; if(id>=80&&id<=87)return"Pro (D601)"; if(id<=2)return"Triumph (D36)"; return"model "+id; }
const SECTOR_TO_QUAD = { 1:0,9:0, 2:1,10:1, 3:2,11:2,19:2,27:2, 4:3,7:3,15:3,31:3,39:3, 41:"done",42:"done",43:"done",47:"done",55:"done" };
function parseOralB(bytes){
  const d=Array.from(bytes); if(d.length!==9&&d.length!==11) return null;
  const modelId=d[1], isIO=IO_MODEL_IDS.has(modelId);
  const state=STATES[d[3]]||("state "+d[3]); const pressure=PRESSURE[d[4]]||("unknown "+d[4]);
  const seconds=d[5]*60+d[6]; const mode=(isIO?IO_MODES:SMART_MODES)[d[7]] ?? ("mode "+d[7]);
  let quad=SECTOR_TO_QUAD[d[8]]; if(quad===undefined)quad=null; if(seconds===0&&state!=="running")quad=null;
  return { model:modelName(modelId), state, running:state==="running", seconds, pressure, pressureHigh:pressure==="high", mode, sectorCode:d[8], quad, numSectors:d.length===11?d[10]:null, bytes:d };
}
function buildSimBytes({stateCode,pressureCode,seconds,modeCode,sectorCode}){ const min=Math.floor(seconds/60),sec=seconds%60; return new Uint8Array([0x06,0x32,0x00,stateCode,pressureCode,min,sec,modeCode,sectorCode,0x00,0x04]); }

/* ===================== CONSTANTS ===================== */
const QUADS=[
  {id:0,label:"Top left",scene:"CYCLE & BLAST",tag:"CYCLE",verb:"Blast the germs!",col:0,row:0},
  {id:1,label:"Top right",scene:"RUN & LEAP",tag:"RUN",verb:"Time your jumps!",col:1,row:0},
  {id:2,label:"Bottom left",scene:"DEEP BLAST",tag:"SWIM",verb:"Blast them underwater!",col:0,row:1},
  {id:3,label:"Bottom right",scene:"SPIRE CLIMB",tag:"CLIMB",verb:"Climb! Knock them off!",col:1,row:1},
];
const SESSION_SECONDS=120, FILL_PER_TICK=0.6, TICK_MS=100;
const CW=1000, CH=640, WORLD_W=CW*2, WORLD_H=CH*2, MAXG=5, PAD=26, JUMP_DUR=0.62;
const HEROX=[CW*0.20, CW*0.30, CW*0.26, CW*0.5];
const C={ void:"#06040d", turq:"#2ee6d6", turqDim:"#15b5a8", germ:"#54f06a", germDark:"#1f8f3a", line:"#3a1f66" };

/* ===================== SPRITE LAYER ==========================================
   Drop-in art. Each sheet = ONE png/webp (RGBA, transparent), frames in a left-
   to-right grid, all cells the SAME size. Set `src` (a URL, or a Vite import) +
   the grid info and it replaces the vector fallback automatically.
   DO NOT use gif/animated-webp/video for characters: the browser owns their
   timeline, so frames can't be synced to gameplay, and gif alpha/colour is poor.
   Fields: src, frameW, frameH, frames, cols, fps, h (drawn height in world px),
   anchorY (0=top .. 1=bottom; ~0.86 puts feet on the lane).                    */
const RUN_SHEET="/sprites/spaceman_run_clean.png";
const GERM_SHEET="/sprites/germ_clean.png";
const ORALB_LOGO="/oral-b-logo.png";
const CLIMB_SHEET="/sprites/spaceman_climb_clean.png";
const SWIM_SHEET="/sprites/spaceman_swim_clean.png";
const SPRITES = {
  hero_cycle:{ src:RUN_SHEET, frameW:170, frameH:240, frames:10, cols:5, fps:9, h:150, anchorY:0.95 },
  hero_run:  { src:RUN_SHEET, frameW:170, frameH:240, frames:10, cols:5, fps:10, h:150, anchorY:0.95 },
  hero_swim: { src:SWIM_SHEET, frameW:284, frameH:142, frames:12, cols:3, fps:8, h:120, anchorY:0.5 },
  hero_climb:{ src:CLIMB_SHEET, frameW:187, frameH:259, frames:10, cols:5, fps:8, h:150, anchorY:0.5 },
  germ:      { src:GERM_SHEET, frameW:418, frameH:257, frames:12, cols:4, fps:8, h:64, anchorY:0.50 },
};
const SPRITE_IMG = {}; // key -> HTMLImageElement once loaded
function loadSprites(){ for(const k in SPRITES){ const d=SPRITES[k]; if(!d.src) continue; if(SPRITE_IMG[k]) continue; const img=new Image(); img.onload=()=>{SPRITE_IMG[k]=img;}; img.onerror=()=>{ console.warn("sprite failed to load:",k,d.src); SPRITE_IMG[k]=null; }; img.src=d.src; } }
function drawSprite(ctx,key,x,y,h,opts){
  const d=SPRITES[key], img=SPRITE_IMG[key]; if(!d||!img) return false; opts=opts||{};
  const n=d.frames, cols=d.cols||n;
  let f = (opts.frame!=null) ? Math.max(0,Math.min(n-1,opts.frame|0)) : Math.floor((opts.t||0)*(opts.fps||d.fps))%n;
  if(f<0) f+=n;
  const sx=(f%cols)*d.frameW, sy=Math.floor(f/cols)*d.frameH, sc=h/d.frameH, w=d.frameW*sc, ay=opts.anchorY!=null?opts.anchorY:0.9;
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(opts.flip){ ctx.translate(x,y); ctx.scale(-1,1); ctx.drawImage(img,sx,sy,d.frameW,d.frameH,-w/2,-h*ay,w,h); }
  else { ctx.drawImage(img,sx,sy,d.frameW,d.frameH,x-w/2,y-h*ay,w,h); }
  ctx.restore(); return true;
}
// Hero: sprite if loaded, else the vector astronaut (identical call site).
function drawHero(ctx,pose,x,y,sc,t,intensity,gun,extra){
  const key="hero_"+pose, d=SPRITES[key];
  if(d && d.src && SPRITE_IMG[key]){ drawSprite(ctx,key,x,y, d.h||150, { t, frame:extra&&extra.frame, anchorY:d.anchorY, flip:extra&&extra.flip }); return; }
  drawAstro(ctx,x,y,sc,pose,t,intensity,gun);
}

/* ===================== CANVAS HELPERS ===================== */
function glow(ctx,color,blur,fn){ ctx.save(); ctx.shadowColor=color; ctx.shadowBlur=blur; fn(); ctx.restore(); }
function rrect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function char(i){ return ((i*1103515245+12345)>>8)&0xff; }
function laneY(q){ return q<2 ? CH*0.64 : CH*0.40; }

function drawGerm(ctx,x,y,r,t){ if(SPRITES.germ.src && SPRITE_IMG.germ){ drawSprite(ctx,"germ",x,y, r*2.4, { t:t+x*0.01, anchorY:0.5 }); return; } drawGermVector(ctx,x,y,r,t); }
function drawGermVector(ctx,x,y,r,t){
  if(r<=0.5) return;
  ctx.save(); ctx.translate(x,y); ctx.rotate(Math.sin(t*6+x)*0.08);
  ctx.strokeStyle=C.germDark; ctx.lineWidth=r*0.14; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-r*0.4,-r*0.7); ctx.lineTo(-r*0.6,-r*1.3); ctx.moveTo(r*0.4,-r*0.7); ctx.lineTo(r*0.6,-r*1.3); ctx.stroke();
  glow(ctx,C.germ,14,()=>{ ctx.fillStyle=C.germ; ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fill(); });
  ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.arc(0,r*0.25,r*0.55,0,7); ctx.fill();
  ctx.fillStyle="#06140a"; ctx.beginPath(); ctx.arc(-r*0.32,-r*0.1,r*0.16,0,7); ctx.arc(r*0.32,-r*0.1,r*0.16,0,7); ctx.fill();
  ctx.fillStyle="#bfffce"; ctx.beginPath(); ctx.arc(-r*0.27,-r*0.16,r*0.06,0,7); ctx.arc(r*0.37,-r*0.16,r*0.06,0,7); ctx.fill();
  ctx.restore();
}
function drawGermEnt(ctx,g,t){ const s=g.pop>0?Math.max(0,1-g.pop/0.16):1; drawGerm(ctx,g.x,g.y,g.r*s,t); }

function drawAstro(ctx,x,y,s,pose,t,intensity,gun){
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  const sw=Math.sin(t*(6+intensity*10));
  ctx.fillStyle="#b9c6d6"; rrect(ctx,-26,-30,16,46,5); ctx.fill();
  glow(ctx,C.turq,10,()=>{ ctx.fillStyle=C.turq; rrect(ctx,-24,-22,8,12,3); ctx.fill(); });
  ctx.fillStyle="#eafcff"; rrect(ctx,-18,-32,34,46,12); ctx.fill();
  ctx.fillStyle="rgba(46,230,214,0.18)"; rrect(ctx,-18,-10,34,24,10); ctx.fill();
  ctx.strokeStyle="#eafcff"; ctx.lineWidth=9; ctx.lineCap="round";
  const legA=sw*0.7, legB=-sw*0.7;
  if(pose==="cycle"){ ctx.beginPath(); ctx.moveTo(-4,12); ctx.lineTo(2+sw*10,30+sw*6); ctx.moveTo(6,12); ctx.lineTo(12-sw*10,30-sw*6); ctx.stroke(); }
  else if(pose==="run"){ ctx.beginPath(); ctx.moveTo(-2,12); ctx.lineTo(-2+legA*22,34); ctx.moveTo(6,12); ctx.lineTo(6+legB*22,34); ctx.stroke(); }
  else if(pose==="swim"){ ctx.beginPath(); ctx.moveTo(0,12); ctx.lineTo(legA*20,24+Math.abs(sw)*10); ctx.moveTo(4,12); ctx.lineTo(4+legB*20,24+Math.abs(sw)*10); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-2,12); ctx.lineTo(-10,30+sw*6); ctx.moveTo(6,12); ctx.lineTo(14,30-sw*6); ctx.stroke(); }
  ctx.lineWidth=8;
  if(pose==="climb"){ ctx.beginPath(); ctx.moveTo(-12,-22); ctx.lineTo(-20,-40-sw*6); ctx.moveTo(12,-22); ctx.lineTo(20,-40+sw*6); ctx.stroke(); }
  else if(pose==="swim"){ ctx.beginPath(); ctx.moveTo(-12,-18); ctx.lineTo(-30,-26+sw*10); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-12,-18); ctx.lineTo(-26,-26+sw*8); ctx.stroke(); }
  // forward arm + optional gun
  if(gun){ ctx.beginPath(); ctx.moveTo(12,-16); ctx.lineTo(30,-8); ctx.stroke();
    glow(ctx,C.turq,12,()=>{ ctx.fillStyle="#9fb4c6"; rrect(ctx,28,-14,22,10,3); ctx.fill(); ctx.fillStyle=C.turq; rrect(ctx,48,-12,8,6,2); ctx.fill(); }); }
  else if(pose!=="climb"&&pose!=="swim"){ ctx.beginPath(); ctx.moveTo(12,-18); ctx.lineTo(26,-10); ctx.stroke(); }
  // helmet
  ctx.fillStyle="#eafcff"; ctx.beginPath(); ctx.arc(0,-40,18,0,7); ctx.fill();
  glow(ctx,C.turq,16,()=>{ ctx.fillStyle="#0b2230"; ctx.beginPath(); ctx.arc(2,-40,12,0,7); ctx.fill(); });
  ctx.fillStyle=C.turq; ctx.beginPath(); ctx.arc(-2,-43,4,0,7); ctx.fill();
  ctx.restore();
}

function drawBeam(ctx,b){ glow(ctx,C.turq,16,()=>{ ctx.strokeStyle=C.turq; ctx.lineWidth=6; ctx.lineCap="round"; ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2); ctx.stroke(); }); ctx.fillStyle="#eafcff"; ctx.beginPath(); ctx.arc(b.x2,b.y2,7,0,7); ctx.fill(); }
function sparkle(ctx,x,y,s){ ctx.save(); ctx.strokeStyle="#eafcff"; ctx.lineWidth=3; ctx.shadowColor=C.turq; ctx.shadowBlur=14; ctx.beginPath(); ctx.moveTo(x-s,y); ctx.lineTo(x+s,y); ctx.moveTo(x,y-s); ctx.lineTo(x,y+s); ctx.stroke(); ctx.restore(); }

function sceneBG(ctx,q){
  const ly=laneY(q); const g=ctx.createRadialGradient(CW/2,ly,40,CW/2,ly,CW*0.78);
  g.addColorStop(0,q===2?"#13265a":"#3a1860"); g.addColorStop(0.6,"#1a0b3a"); g.addColorStop(1,"#080318");
  ctx.fillStyle=g; ctx.fillRect(0,0,CW,CH);
  const inner=QUADS[q].col===0?CW:0; const tg=ctx.createRadialGradient(inner,ly,20,inner,ly,CW*0.6);
  tg.addColorStop(0,"rgba(0,0,0,0.45)"); tg.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=tg; ctx.fillRect(0,0,CW,CH);
}
function drawTeeth(ctx,q,p,t){
  const top=q<2, count=5, toothW=CW/count, depth=CH*0.34, innerCol=QUADS[q].col;
  const shade = p>0.5 ? "#e6eef8" : "#dde7f3";   // light cool shadow tone (stays white)
  const tip = "#ffffff";
  ctx.fillStyle="#3a0f2e"; if(top) ctx.fillRect(0,0,CW,24); else ctx.fillRect(0,CH-24,CW,24); // gum
  for(let i=0;i<count;i++){
    const cx=i*toothW+toothW/2; const innerness=innerCol===0?cx/CW:1-cx/CW;
    const d=depth*(0.74+0.26*innerness), w=toothW*0.84, x=cx-w/2, y0=top?16:CH-16-d, rad=w*0.34;
    // base white tooth with a drop shadow into the mouth (depth)
    ctx.save(); ctx.shadowColor="rgba(0,0,0,0.4)"; ctx.shadowBlur=18; ctx.shadowOffsetY=top?9:-9;
    rrect(ctx,x,y0,w,d,rad); ctx.fillStyle=tip; ctx.fill(); ctx.restore();
    // form shading, clipped to the tooth
    ctx.save(); rrect(ctx,x,y0,w,d,rad); ctx.clip();
    const hg=ctx.createLinearGradient(x,0,x+w,0); hg.addColorStop(0,shade); hg.addColorStop(0.42,tip); hg.addColorStop(0.58,tip); hg.addColorStop(1,shade);
    ctx.fillStyle=hg; ctx.fillRect(x,y0,w,d); // left/right roundness
    const vg=ctx.createLinearGradient(0,y0,0,y0+d);
    if(top){ vg.addColorStop(0,"rgba(120,140,175,0.4)"); vg.addColorStop(0.28,"rgba(120,140,175,0)"); }
    else { vg.addColorStop(0.72,"rgba(120,140,175,0)"); vg.addColorStop(1,"rgba(120,140,175,0.4)"); }
    ctx.fillStyle=vg; ctx.fillRect(x,y0,w,d); // ambient occlusion near the gum
    const hx=x+w*0.32, hy=top?y0+d*0.30:y0+d*0.40, sp=ctx.createRadialGradient(hx,hy,2,hx,hy,w*0.55);
    sp.addColorStop(0,"rgba(255,255,255,0.95)"); sp.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=sp; ctx.fillRect(x,y0,w,d); // specular gloss
    ctx.restore();
    // crisp separation between teeth
    ctx.save(); rrect(ctx,x,y0,w,d,rad); ctx.strokeStyle="rgba(40,30,70,0.22)"; ctx.lineWidth=3; ctx.stroke(); ctx.restore();
    // turquoise clean-rim + sparkle as the quarter fills
    if(p>0.5){ ctx.save(); rrect(ctx,x,y0,w,d,rad); ctx.strokeStyle="rgba(46,230,214,0.55)"; ctx.lineWidth=2.5; ctx.shadowColor=C.turq; ctx.shadowBlur=12; ctx.stroke(); ctx.restore(); }
    if(p>0.62&&i%2===0){ const tw=0.5+0.5*Math.sin(t*4+i); sparkle(ctx,x+w*0.34, top?y0+d*0.32:y0+d*0.62, 10*tw); }
  }
}

/* ===================== SCENE UPDATE (entities) ===================== */
function climbGerm(i,t){ const cols=[CW*0.34,CW*0.64]; const y=50+((t*70+i*150)%(CH*0.48)); return {x:cols[i%2]+Math.sin(t*1.3+i)*18, y, r:28}; }
function spawnBurst(w,x,y,color,count){ for(let i=0;i<count;i++){ const a=Math.random()*7, sp=2+Math.random()*5; w.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,g:0.12,life:0.5+Math.random()*0.5,max:1,r:3+Math.random()*4,color}); } w.flash=0.5; }

function updateScene(w,q,st,dt,sfx){
  const ox=QUADS[q].col*CW, oy=QUADS[q].row*CH;
  if(q===3){ // climb: wall germs cleared by progress + descending germs the climber lasers
    const n=Math.ceil((1-st.p)*MAXG);
    if(st.active && n<w.prevN3){ const gp=climbGerm(Math.max(0,w.prevN3-1),w.t); spawnBurst(w,ox+gp.x,oy+gp.y,C.germ,16); if(w.focused===3)sfx("hit"); }
    w.prevN3=n;
    const lane3=w.ent[3], heroX=CW*0.5, heroY=CH*0.42;
    w.spawnT[3]-=dt; const iv=0.95+st.p*1.5;
    if(st.p<1 && w.spawnT[3]<=0){ w.spawnT[3]=iv; lane3.push({x:heroX+(Math.random()*380-190),y:-50,r:28,pop:0}); }
    const vsp=150; for(const g of lane3){ if(g.pop>0){ g.pop+=dt; continue; } g.y+=vsp*dt; }
    if(st.active && !st.pressureHigh){
      w.fireT[3]-=dt; const rate3=0.18+(1-st.intensity)*0.24;
      if(w.fireT[3]<=0){
        const FIRELINE=CH*0.24; let near=null,best=-1; for(const g of lane3){ if(g.pop>0) continue; if(g.y>=FIRELINE && g.y<=heroY-40 && g.y>best){ best=g.y; near=g; } }
        if(near){ w.fireT[3]=rate3; near.pop=0.0001; w.beams.push({q:3,x1:heroX,y1:heroY-46,x2:near.x,y2:near.y,life:0.1}); spawnBurst(w,ox+near.x,oy+near.y,C.germ,16); if(w.focused===3)sfx("laser"); }
        else w.fireT[3]=0.05;
      }
    }
    for(let i=lane3.length-1;i>=0;i--){ const g=lane3[i]; if(g.pop>0.16||g.y>CH+70) lane3.splice(i,1); }
    return;
  }
  const lane=w.ent[q];
  w.spawnT[q]-=dt;
  const interval=0.7+st.p*1.8;
  if(st.p<1 && w.spawnT[q]<=0){ w.spawnT[q]=interval; lane.push({x:CW+50,y:laneY(q)+(q===2?(Math.random()*120-60):0),r:30,pop:0,passed:false}); }
  const speed=(q===1?210:175);
  for(const g of lane){ if(g.pop>0){ g.pop+=dt; continue; } g.x-=speed*dt; }
  const active=st.active && !st.pressureHigh;
  if(q===1){ // RUN: germs charge in; a well-timed jump pops them
    if(w.jt[q]>0){ w.jt[q]+=dt; if(w.jt[q]>=JUMP_DUR) w.jt[q]=0; }
    let near=null,nd=1e9; for(const g of lane){ if(g.pop>0||g.passed) continue; const d=g.x-HEROX[q]; if(d>-20&&d<nd){ nd=d; near=g; } }
    if(active && near && nd<95 && w.jt[q]<=0) w.jt[q]=0.0001; // auto-trigger jump as the germ arrives
    const phase=w.jt[q]>0?w.jt[q]/JUMP_DUR:0; const airborne=phase>0.12&&phase<0.88;
    for(const g of lane){ if(g.pop>0||g.passed) continue; if(Math.abs(g.x-HEROX[q])<54){ if(airborne){ g.pop=0.0001; spawnBurst(w,ox+g.x,oy+g.y,C.germ,16); if(w.focused===q)sfx("hit"); } else if(g.x<HEROX[q]+10){ g.passed=true; } } }
  } else { // CYCLE / SWIM: laser nearest germ
    w.fireT[q]-=dt; const rate=0.16+(1-st.intensity)*0.22;
    if(active && w.fireT[q]<=0){
      const FIRELINE=CW*0.5; let near=null,nd=1e9; for(const g of lane){ if(g.pop>0) continue; const d=g.x-HEROX[q]; if(g.x<=FIRELINE&&d>30&&d<nd){ nd=d; near=g; } }
      if(near){ w.fireT[q]=rate; near.pop=0.0001; w.beams.push({q,x1:HEROX[q]+50,y1:laneY(q)-8,x2:near.x,y2:near.y,life:0.1}); spawnBurst(w,ox+near.x,oy+near.y,C.germ,16); if(w.focused===q)sfx("laser"); }
      else w.fireT[q]=0.05;
    }
  }
  for(let i=lane.length-1;i>=0;i--){ const g=lane[i]; if(g.pop>0.16||g.x<-70) lane.splice(i,1); }
}

/* ===================== SCENE DRAW ===================== */
function sceneCycle(ctx,st,lane,beams,t){
  const ly=laneY(0), sc=(t*220*(0.3+st.intensity))%80;
  ctx.fillStyle="#1f0d36"; ctx.fillRect(0,ly+44,CW,70);
  ctx.strokeStyle=C.turqDim; ctx.lineWidth=4; for(let x=-80;x<CW+80;x+=80){ ctx.beginPath(); ctx.moveTo(x-sc,ly+44); ctx.lineTo(x-sc+26,ly+114); ctx.stroke(); }
  for(const g of lane) drawGermEnt(ctx,g,t);
  for(const b of beams) drawBeam(ctx,b);
  drawHero(ctx,"cycle",HEROX[0],ly,1.6,t,st.intensity,true);
}
function sceneRun(ctx,st,lane,jumpPhase,t){
  const ly=laneY(1);
  ctx.fillStyle="#22103f"; ctx.fillRect(0,ly+46,CW,60);
  const sc=(t*240*(0.3+st.intensity))%120; ctx.strokeStyle=C.line; ctx.lineWidth=5; for(let x=-120;x<CW+120;x+=120){ ctx.beginPath(); ctx.moveTo(x-sc,ly+76); ctx.lineTo(x-sc+60,ly+76); ctx.stroke(); }
  for(const g of lane) drawGermEnt(ctx,g,t);
  const jy=Math.sin((jumpPhase||0)*Math.PI)*100;
  drawHero(ctx,"run",HEROX[1],ly-jy,1.6,t,st.intensity,false);
}
function sceneSwim(ctx,st,lane,beams,t){
  const ly=laneY(2);
  for(let i=0;i<12;i++){ const by=(CH-((t*60+i*70)%CH)); ctx.fillStyle="rgba(120,220,255,0.22)"; ctx.beginPath(); ctx.arc((i*113)%CW,by,4+(i%3)*3,0,7); ctx.fill(); }
  for(const g of lane) drawGermEnt(ctx,g,t);
  for(const b of beams) drawBeam(ctx,b);
  drawHero(ctx,"swim",HEROX[2],ly,1.6,t,st.intensity,true);
}
function sceneClimb(ctx,st,lane,beams,t){
  const sc=(t*120*(0.3+st.intensity))%140;
  ctx.strokeStyle=C.line; ctx.lineWidth=3; for(let y=-140;y<CH+140;y+=70){ const yy=((y+sc)%(CH+140)); ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(CW,yy); ctx.stroke(); }
  for(let y=-140;y<CH+140;y+=120){ const yy=((y+sc)%(CH+140)); glow(ctx,C.turq,10,()=>{ ctx.fillStyle=C.turqDim; ctx.beginPath(); ctx.arc(CW*0.5+Math.sin(yy)*120,yy,10,0,7); ctx.fill(); }); }
  const n=Math.ceil((1-st.p)*MAXG); for(let i=0;i<n;i++){ const g=climbGerm(i,t); drawGerm(ctx,g.x,g.y,g.r,t); }
  for(const g of (lane||[])) drawGermEnt(ctx,g,t);
  for(const b of (beams||[])) drawBeam(ctx,b);
  drawHero(ctx,"climb",CW*0.5,CH*0.42,1.5,t,st.intensity,false);
}

/* ===================== STATS (fabricated parent dashboard) ===================== */
const WEEK=[{d:"Mon",am:1,pm:1},{d:"Tue",am:1,pm:1},{d:"Wed",am:1,pm:0},{d:"Thu",am:1,pm:1},{d:"Fri",am:1,pm:1},{d:"Sat",am:0,pm:1},{d:"Sun",am:1,pm:1}];
const MINUTES=[2.1,2.3,1.2,2.4,2.2,1.0,2.5];
const COVERAGE=[{n:"Upper left",v:96},{n:"Upper right",v:92},{n:"Lower left",v:88},{n:"Lower right",v:90}];

/* ===================== MAIN ===================== */
export default function MouthGym(){
  const [tab,setTab]=useState("play");
  const [loading,setLoading]=useState(true);
  const [activeQuad,setActiveQuad]=useState(null);
  const [source,setSource]=useState(null);
  const [tele,setTele]=useState(null);
  const [clean,setClean]=useState([0,0,0,0]);
  const [reps,setReps]=useState(0);
  const [seconds,setSeconds]=useState(0);
  const [phase,setPhase]=useState("idle");
  const [coach,setCoach]=useState("Press start and brush. Each corner is a mission.");
  const [streak,setStreak]=useState(12);
  const [unlocks,setUnlocks]=useState(7);
  const [score,setScore]=useState(0);
  const [error,setError]=useState(null);
  const [engineOpen,setEngineOpen]=useState(false);
  const [stamp,setStamp]=useState(null);
  const [finale,setFinale]=useState(false);
  const [sound,setSound]=useState(true);
  const [simOn,setSimOn]=useState(false);

  const inputRef=useRef({running:false,seconds:0,quad:null,pressureHigh:false});
  const cleanRef=useRef([0,0,0,0]);
  const completedRef=useRef([false,false,false,false]);
  const simRef=useRef(null), deviceRef=useRef(null), teleThrottle=useRef(0), simTimeRef=useRef(0);
  const canvasRef=useRef(null), worldRef=useRef(null), audioRef=useRef(null);
  const soundRef=useRef(true), stampRef=useRef(null);
  useEffect(()=>{ soundRef.current=sound; },[sound]);
  useEffect(()=>{ stampRef.current = stamp?stamp.quad:null; },[stamp]);
  useEffect(()=>{ loadSprites(); },[]);
  useEffect(()=>{ const id=setTimeout(()=>setLoading(false),2300); return ()=>clearTimeout(id); },[]);

  useEffect(()=>{ (async()=>{ try{ if(window.storage){ const r=await window.storage.get("mouthquest:profile"); if(r&&r.value){ const p=JSON.parse(r.value); if(p.streak) setStreak(p.streak); if(p.unlocks) setUnlocks(p.unlocks);} } }catch(_){}})(); },[]);
  const persist=useCallback(async(n)=>{ try{ if(window.storage) await window.storage.set("mouthquest:profile",JSON.stringify(n)); }catch(_){ } },[]);

  const unlockAudio=useCallback(()=>{ try{ if(!audioRef.current){ const A=window.AudioContext||window.webkitAudioContext; if(A) audioRef.current=new A(); } if(audioRef.current&&audioRef.current.state==="suspended") audioRef.current.resume(); }catch(_){ } },[]);
  const sfx=useCallback((type)=>{ if(!soundRef.current) return; const ac=audioRef.current; if(!ac) return; try{
    const n=ac.currentTime;
    if(type==="laser"){ const o=ac.createOscillator(),g=ac.createGain(); o.connect(g); g.connect(ac.destination); o.type="square"; o.frequency.setValueAtTime(880,n); o.frequency.exponentialRampToValueAtTime(180,n+0.12); g.gain.setValueAtTime(0.05,n); g.gain.exponentialRampToValueAtTime(0.0001,n+0.13); o.start(n); o.stop(n+0.14); }
    else if(type==="hit"){ const o=ac.createOscillator(),g=ac.createGain(); o.connect(g); g.connect(ac.destination); o.type="sine"; o.frequency.setValueAtTime(160,n); o.frequency.exponentialRampToValueAtTime(60,n+0.15); g.gain.setValueAtTime(0.06,n); g.gain.exponentialRampToValueAtTime(0.0001,n+0.16); o.start(n); o.stop(n+0.17); }
    else if(type==="clear"){ [523,659,784,1047].forEach((f,i)=>{ const oo=ac.createOscillator(),gg=ac.createGain(); oo.connect(gg); gg.connect(ac.destination); oo.type="triangle"; oo.frequency.value=f; gg.gain.setValueAtTime(0.0001,n+i*0.07); gg.gain.exponentialRampToValueAtTime(0.07,n+i*0.07+0.02); gg.gain.exponentialRampToValueAtTime(0.0001,n+i*0.07+0.3); oo.start(n+i*0.07); oo.stop(n+i*0.07+0.32); }); }
  }catch(_){ } },[]);

  const ingest=useCallback((bytes,src)=>{
    const p=parseOralB(bytes); if(!p) return;
    inputRef.current={ running:p.running||p.seconds>(inputRef.current.seconds??0), seconds:p.seconds, quad:p.quad, pressureHigh:p.pressureHigh };
    const now=Date.now(); if(now-teleThrottle.current>120){ teleThrottle.current=now; setTele(p); }
    if(src) setSource(src);
  },[]);

  const connectReal=useCallback(async()=>{
    setError(null); unlockAudio();
    if(typeof navigator==="undefined"||!navigator.bluetooth){ setError("Web Bluetooth isn't available here. Open this deployed on your own https site, in Chrome on Android, with chrome://flags experimental web platform features enabled."); return; }
    try{
      const device=await navigator.bluetooth.requestDevice({ filters:[{namePrefix:"Oral-B"},{namePrefix:"Oral B"},{services:[0xfe0d]}], optionalManufacturerData:[ORALB_MANUFACTURER] });
      deviceRef.current=device;
      device.addEventListener("advertisementreceived",(e)=>{ const dv=e.manufacturerData&&e.manufacturerData.get(ORALB_MANUFACTURER); if(!dv) return; ingest(new Uint8Array(dv.buffer,dv.byteOffset,dv.byteLength),"real"); });
      await device.watchAdvertisements();
      setSource("real"); setCoach("Brush linked. Start brushing — the camera follows you in.");
    }catch(e){ setError(e&&e.message?e.message:"Could not connect to the brush."); }
  },[ingest,unlockAudio]);

  const startSim=useCallback(()=>{ stopSim(); unlockAudio(); setSimOn(true); setSource("sim"); setError(null);
    simTimeRef.current=0; let pressureUntil=-1;
    simRef.current=setInterval(()=>{ simTimeRef.current+=0.2; const secs=Math.floor(simTimeRef.current);
      if(Math.random()<0.004 && pressureUntil<secs) pressureUntil=secs+2;
      const high=secs>0&&secs<pressureUntil; const block=Math.min(3,Math.floor((secs%SESSION_SECONDS)/30));
      ingest(buildSimBytes({stateCode:3,pressureCode:high?144:114,seconds:secs,modeCode:0,sectorCode:[1,2,3,4][block]}),"sim");
    },200);
  },[ingest,unlockAudio]);
  const stopSim=useCallback(()=>{ if(simRef.current){ clearInterval(simRef.current); simRef.current=null; } setSimOn(false); inputRef.current={...inputRef.current,running:false,pressureHigh:false}; },[]);

  useEffect(()=>{ worldRef.current={ vp:{x:0,y:0,w:WORLD_W,h:WORLD_H}, focused:null, lastFocus:0, intensity:0, particles:[], easeoff:[0,0,0,0], ent:[[],[],[],[]], beams:[], spawnT:[0,0,0,0], fireT:[0,0,0,0], jt:[0,0,0,0], prevN3:MAXG, flash:0, t:0 }; },[]);

  /* logic loop */
  useEffect(()=>{
    const loop=setInterval(()=>{
      const inp=inputRef.current;
      if(inp.seconds!=null) setSeconds(inp.seconds);
      if(!inp.running){ setPhase("idle"); setActiveQuad(null); return; }
      if(inp.pressureHigh){ setPhase("easeoff"); setCoach("Ease off — gentle does it. Hard brushing hurts your gums."); return; }
      setPhase("brushing"); setReps(r=>r+1);
      let q=typeof inp.quad==="number"?inp.quad:null;
      if(q===null && inp.seconds!=null) q=Math.min(3,Math.floor((inp.seconds%SESSION_SECONDS)/30));
      setActiveQuad(q);
      setClean(prev=>{
        const next=[...prev]; if(q!=null) next[q]=Math.min(100,next[q]+FILL_PER_TICK); cleanRef.current=next;
        if(q!=null && next[q]<100) setCoach(QUADS[q].verb);
        setScore(s=>s+1);
        if(q!=null && next[q]>=100 && !completedRef.current[q]){
          completedRef.current[q]=true; const w=worldRef.current; const eo=w?w.easeoff[q]:0; const stars=eo<1.5?3:eo<4?2:1;
          setStamp({quad:q,stars,scene:QUADS[q].scene}); sfx("clear"); setScore(s=>s+250); setTimeout(()=>setStamp(null),1700);
          if(completedRef.current.every(Boolean)){ setPhase("done"); setFinale(true); setStreak(s=>{ const ns=s+1; setUnlocks(u=>{ const nu=u+1; persist({streak:ns,unlocks:nu}); return nu;}); return ns; }); }
          else if(simRef.current){ const sc=inp.seconds||0; simTimeRef.current=(Math.floor(sc/30)+1)*30+0.001; } // demo: skip straight to the next stage
        }
        return next;
      });
    },TICK_MS);
    return ()=>clearInterval(loop);
  },[persist,sfx]);

  /* render loop */
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return; const ctx=canvas.getContext("2d");
    let raf, last=performance.now(), running=true; const dpr=Math.min(2,window.devicePixelRatio||1);
    function resize(){ const r=canvas.getBoundingClientRect(); canvas.width=Math.max(1,Math.round(r.width*dpr)); canvas.height=Math.max(1,Math.round(r.height*dpr)); }
    resize(); window.addEventListener("resize",resize);
    function cellRect(q){ return { x:QUADS[q].col*CW, y:QUADS[q].row*CH, w:CW, h:CH }; }
    function drawScene(q,st){
      const w=worldRef.current; sceneBG(ctx,q);
      if(q===0) sceneCycle(ctx,st,w.ent[0],w.beams.filter(b=>b.q===0),st.t);
      else if(q===1) sceneRun(ctx,st,w.ent[1],(w.jt[1]>0?w.jt[1]/JUMP_DUR:0),st.t);
      else if(q===2) sceneSwim(ctx,st,w.ent[2],w.beams.filter(b=>b.q===2),st.t);
      else sceneClimb(ctx,st,w.ent[3],w.beams.filter(b=>b.q===3),st.t);
      drawTeeth(ctx,q,st.p,st.t);
      if(st.pressureHigh){ ctx.fillStyle="rgba(255,70,90,0.16)"; ctx.fillRect(0,0,CW,CH); ctx.fillStyle="#ff6b7a"; ctx.font="bold 40px system-ui"; ctx.fillText("EASE OFF",CW/2-90,70); }
    }
    function frame(now){
      if(!running) return; const dt=Math.min(0.05,(now-last)/1000); last=now; const w=worldRef.current; if(!w){ raf=requestAnimationFrame(frame); return; }
      w.t+=dt; const inp=inputRef.current; const prog=cleanRef.current;
      let aq=null; if(inp.running){ aq=typeof inp.quad==="number"?inp.quad:Math.min(3,Math.floor(((inp.seconds||0)%SESSION_SECONDS)/30)); }
      const target=(inp.running&&!inp.pressureHigh)?1:0; w.intensity+=(target-w.intensity)*Math.min(1,dt*4);
      if(aq!=null && inp.pressureHigh) w.easeoff[aq]+=dt;
      if(stampRef.current!=null){ w.focused=stampRef.current; w.lastFocus=w.t; } else if(aq!=null){ w.focused=aq; w.lastFocus=w.t; } else if(w.t-w.lastFocus>1.3){ w.focused=null; }
      let tv; if(w.focused==null){ tv={x:0,y:0,w:WORLD_W,h:WORLD_H}; } else { const c=cellRect(w.focused); tv={x:c.x-PAD,y:c.y-PAD,w:c.w+PAD*2,h:c.h+PAD*2}; }
      const k=Math.min(1,dt*5); w.vp.x+=(tv.x-w.vp.x)*k; w.vp.y+=(tv.y-w.vp.y)*k; w.vp.w+=(tv.w-w.vp.w)*k; w.vp.h+=(tv.h-w.vp.h)*k;
      for(let q=0;q<4;q++){ updateScene(w,q,{ p:prog[q]/100, active:aq===q, intensity:aq===q?w.intensity:0, pressureHigh:aq===q&&inp.pressureHigh }, dt, sfx); }
      for(let i=w.beams.length-1;i>=0;i--){ w.beams[i].life-=dt; if(w.beams[i].life<=0) w.beams.splice(i,1); }
      for(let i=w.particles.length-1;i>=0;i--){ const p=w.particles[i]; p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.vy+=p.g*dt*60; p.vx*=0.98; p.life-=dt; if(p.life<=0) w.particles.splice(i,1); }
      w.flash=Math.max(0,w.flash-dt*2.5);
      const CWp=canvas.width, CHp=canvas.height;
      ctx.setTransform(1,0,0,1,0,0);
      const bg=ctx.createRadialGradient(CWp*0.5,CHp*0.2,0,CWp*0.5,CHp*0.5,CWp*0.9); bg.addColorStop(0,"#160a2e"); bg.addColorStop(1,C.void); ctx.fillStyle=bg; ctx.fillRect(0,0,CWp,CHp);
      ctx.fillStyle="rgba(120,200,255,0.5)"; for(let i=0;i<60;i++){ const sx=(i*char(i)*97)%CWp, sy=(i*53+((i*i)%CHp)); const tw=0.4+0.6*Math.abs(Math.sin(w.t*2+i)); ctx.globalAlpha=tw*0.7; ctx.fillRect(sx%CWp,sy%CHp,2,2); } ctx.globalAlpha=1;
      const s=Math.min(CWp/w.vp.w,CHp/w.vp.h); const ox=(CWp-w.vp.w*s)/2-w.vp.x*s, oy=(CHp-w.vp.h*s)/2-w.vp.y*s; ctx.setTransform(s,0,0,s,ox,oy);
      for(let q=0;q<4;q++){
        const c=cellRect(q);
        ctx.save(); ctx.beginPath(); ctx.rect(c.x,c.y,c.w,c.h); ctx.clip(); ctx.translate(c.x,c.y);
        drawScene(q,{ p:prog[q]/100, active:aq===q, intensity:aq===q?w.intensity:0, pressureHigh:aq===q&&inp.pressureHigh, t:w.t });
        ctx.restore();
        const isFocus=w.focused===q||aq===q; ctx.lineWidth=isFocus?6:2; ctx.strokeStyle=isFocus?C.turq:C.line;
        if(isFocus){ ctx.shadowColor=C.turq; ctx.shadowBlur=24; } ctx.strokeRect(c.x+2,c.y+2,c.w-4,c.h-4); ctx.shadowBlur=0;
        const lbl=QUADS[q].tag+(prog[q]>=100?"  ✓":"");
        ctx.font="800 40px system-ui, sans-serif"; const lw=ctx.measureText(lbl).width;
        const bx=c.x+22, by=c.y+20, bw=lw+36, bh=56;
        ctx.fillStyle="rgba(6,4,13,0.66)"; rrect(ctx,bx,by,bw,bh,16); ctx.fill();
        ctx.lineWidth=2; ctx.strokeStyle="rgba(46,230,214,0.45)"; rrect(ctx,bx,by,bw,bh,16); ctx.stroke();
        ctx.fillStyle=prog[q]>=100?C.turq:"#eafcff"; ctx.textBaseline="middle"; ctx.fillText(lbl,bx+18,by+bh/2+1); ctx.textBaseline="alphabetic";
      }
      for(const p of w.particles){ ctx.globalAlpha=Math.max(0,p.life/p.max); ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=10; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill(); }
      ctx.globalAlpha=1; ctx.shadowBlur=0;
      ctx.setTransform(1,0,0,1,0,0);
      if(w.flash>0){ ctx.fillStyle="rgba(46,230,214,"+(w.flash*0.5)+")"; ctx.fillRect(0,0,CWp,CHp); }
      const vg=ctx.createRadialGradient(CWp/2,CHp/2,CHp*0.3,CWp/2,CHp/2,CHp*0.8); vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,0.55)"); ctx.fillStyle=vg; ctx.fillRect(0,0,CWp,CHp);
      raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
    return ()=>{ running=false; cancelAnimationFrame(raf); window.removeEventListener("resize",resize); };
  },[sfx]);

  const reset=useCallback(()=>{ stopSim(); simTimeRef.current=0; completedRef.current=[false,false,false,false]; cleanRef.current=[0,0,0,0]; setClean([0,0,0,0]); setReps(0); setSeconds(0); setScore(0); setPhase("idle"); setFinale(false); setStamp(null); setCoach("Press start and brush. Each corner is a mission."); inputRef.current={running:false,seconds:0,quad:null,pressureHigh:false}; const w=worldRef.current; if(w){ w.ent=[[],[],[],[]]; w.beams=[]; w.spawnT=[0,0,0,0]; w.fireT=[0,0,0,0]; w.jt=[0,0,0,0]; w.prevN3=MAXG; w.particles=[]; w.easeoff=[0,0,0,0]; w.focused=null; } },[stopSim]);
  useEffect(()=>()=>stopSim(),[stopSim]);

  const overall=Math.round(clean.reduce((a,b)=>a+b,0)/4);
  const mmss=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  const sessionsThisWeek=WEEK.reduce((a,d)=>a+d.am+d.pm,0);

  return (
    <div style={S.shell}>
      <style>{CSS}</style>
      {loading && <Loader/>}
      <header style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <img src={ORALB_LOGO} alt="Oral-B" style={{height:28,objectFit:"contain",filter:"brightness(0) invert(1)",opacity:0.85}}/>
          <span style={{color:"rgba(234,252,255,0.3)",fontSize:18,fontWeight:300,lineHeight:1}}>×</span>
          <span style={S.logo}>MOUTH<span style={{color:C.turq}}>QUEST</span></span>
          <span style={S.tag}>healthy-lifestyle space hero · working title</span>
        </div>
        <StatusPill source={source} phase={phase} model={tele?.model}/>
      </header>

      <div style={S.tabs}>
        <button style={{...S.tabBtn,...(tab==="play"?S.tabOn:{})}} onClick={()=>setTab("play")}>Play</button>
        <button style={{...S.tabBtn,...(tab==="stats"?S.tabOn:{})}} onClick={()=>setTab("stats")}>Stats</button>
      </div>

      {tab==="play" ? (
        <>
          <div style={S.controls}>
            <button style={{...S.btn,...S.btnPrimary}} onClick={connectReal}>Connect Oral-B</button>
            {simOn ? <button style={{...S.btn,...S.btnGhost}} onClick={stopSim}>Pause</button>
                   : <button style={{...S.btn,...S.btnMint}} onClick={startSim}>Simulate brushing</button>}
            <button style={{...S.btn,...S.btnGhost}} onClick={reset}>Reset</button>
            <button style={{...S.btn,...S.btnGhost}} onClick={()=>setSound(s=>!s)}>{sound?"Sound on":"Sound off"}</button>
            <div style={S.rowTimer}><span style={S.rowTimerVal}>{mmss}</span><span style={S.rowTimerFresh}>{activeQuad!=null?QUADS[activeQuad].tag+" · ":""}{overall}% fresh</span></div>
          </div>
          {error && <div style={S.error}>{error}</div>}
          <div style={S.stage}>
            <canvas ref={canvasRef} style={S.canvas}/>
            {stamp && !finale && (
              <div style={S.stamp} key={stamp.quad+"-"+stamp.stars}>
                <div style={S.stampScene}>{stamp.scene}</div>
                <div style={S.stampMain}>STATION CLEARED</div>
                <div style={S.stars}>{"★★★".slice(0,stamp.stars)}<span style={{opacity:0.25}}>{"★★★".slice(stamp.stars)}</span></div>
              </div>
            )}
            {finale && (
              <div style={S.finale}>
                <div style={S.finaleMain}>ALL FRESH!</div>
                <div style={S.finaleSub}>Mouth cleared · streak {streak}🔥 · +1 unlocked</div>
                <button style={{...S.btn,...S.btnMint,marginTop:14}} onClick={reset}>Play again</button>
              </div>
            )}
          </div>
          <div style={{...S.coach, ...(phase==="easeoff"?S.coachWarn:phase==="done"?S.coachDone:{})}}>
            {phase==="easeoff"?"⚠ ":phase==="done"?"★ ":"› "}{coach}
          </div>
          <div style={S.stats}>
            <Stat label="Score" value={score}/><Stat label="Reps" value={reps}/><Stat label="Streak" value={`${streak}🔥`}/><Stat label="Unlocked" value={unlocks}/>
          </div>
          <button style={S.engineToggle} onClick={()=>setEngineOpen(o=>!o)}>{engineOpen?"▾ Hide brush link":"▸ Brush link (live data)"}</button>
          {engineOpen && <Engine tele={tele} source={source}/>}
          <footer style={S.footer}>Real brushing drives the hero in every scene. Same parser runs on simulated and live Oral-B packets.</footer>
        </>
      ) : (
        <StatsView streak={streak} unlocks={unlocks} sessions={sessionsThisWeek}/>
      )}
    </div>
  );
}

/* Oral-B branded splash. The wordmark is a styled placeholder; drop in the
   real Oral-B brand asset (svg/png) for a pitch build. */
function Loader(){
  return (
    <div style={S.loader}>
      <div style={S.loaderInner}>
      <img src={ORALB_LOGO} alt="Oral-B" style={S.loaderLogo}/>
      <div style={S.loaderPresents}>presents</div>
      <div style={S.loaderTitle}>MOUTH<span style={{color:C.turq}}>QUEST</span></div>
      <svg width="150" height="120" viewBox="0 0 150 120" style={{margin:"6px 0"}}>
        <g style={{transformOrigin:"75px 60px",animation:"brushWiggle 0.55s ease-in-out infinite"}}>
          <rect x="14" y="54" width="70" height="13" rx="6" fill="#eafcff"/>
          <rect x="80" y="50" width="30" height="20" rx="6" fill="#2ee6d6"/>
          {[0,1,2,3,4,5].map(i=>(<rect key={i} x={16+i*11} y="45" width="6" height="11" rx="2" fill="#2ee6d6"/>))}
        </g>
        <path d="M104 70 C104 58 126 58 126 70 C126 84 115 94 115 94 C115 94 104 84 104 70 Z" fill="#ffffff"/>
        <circle cx="113" cy="58" r="3" fill="#2ee6d6"><animate attributeName="opacity" values="0.2;1;0.2" dur="0.9s" repeatCount="indefinite"/></circle>
      </svg>
      <div style={S.loaderBarTrack}><div style={S.loaderBarFill}/></div>
      <div style={S.loaderNote}>Warming up your daily workout…</div>
      </div>
    </div>
  );
}

/* ===================== UI BITS ===================== */
function StatusPill({source,phase,model}){ const map={idle:["Idle","rgba(234,252,255,0.5)"],brushing:["Brushing",C.turq],easeoff:["Ease off","#ff6b7a"],done:["Complete","#ff5c9a"]}; const [label,color]=map[phase]||map.idle; return (<div style={S.pill}><span style={{...S.dot,background:color,boxShadow:`0 0 10px ${color}`}}/><span style={{color}}>{label}</span><span style={S.pillMeta}>{source==="real"?(model||"Oral-B"):source==="sim"?"Sim":"No link"}</span></div>); }
function Stat({label,value}){ return (<div style={S.stat}><div style={S.statValue}>{value}</div><div style={S.statLabel}>{label}</div></div>); }
function Engine({tele,source}){
  const fields=tele?[["model",tele.model],["state",tele.state],["time",tele.seconds+"s"],["sector",`${tele.sectorCode} → ${tele.quad==="done"?"done":tele.quad??"—"}`],["pressure",tele.pressure],["mode",tele.mode]]:[];
  const map=["ver","model","—","state","press","min","sec","mode","sector","secT","nSect"];
  return (<div style={S.engine}><div style={S.engineRow}>{fields.map(([k,v])=>(<div key={k} style={S.engineCell}><div style={S.engineKey}>{k}</div><div style={S.engineVal}>{String(v)}</div></div>))}{!tele&&<div style={S.engineKey}>Waiting for packets… (Connect or Simulate)</div>}</div>{tele&&(<div style={S.hexWrap}><div style={S.engineKey}>raw advertisement · 0x00DC ({source})</div><div style={S.hexRow}>{tele.bytes.map((b,i)=>(<div key={i} style={S.hexByte}><span style={S.hexVal}>{b.toString(16).padStart(2,"0")}</span><span style={S.hexIdx}>{map[i]||i}</span></div>))}</div></div>)}</div>);
}
function StatsView({streak,unlocks,sessions}){
  const maxM=Math.max(...MINUTES); const goal=2;
  return (
    <div style={S.statsView}>
      <div style={S.profileRow}>
        <div style={S.avatar}>🧑‍🚀</div>
        <div><div style={S.profileName}>Leo · age 6</div><div style={S.profileSub}>On a {streak}-day streak. Nice work, Leo!</div></div>
      </div>
      <div style={S.cardRow}>
        <Card big={`${streak}🔥`} label="Day streak"/><Card big={sessions+"/14"} label="Brushes this week"/><Card big="2:06" label="Avg time"/><Card big="2.7★" label="Avg rating"/>
      </div>
      <div style={S.panel}>
        <div style={S.panelTitle}>This week</div>
        <div style={S.weekRow}>
          {WEEK.map((d)=>(
            <div key={d.d} style={S.dayCol}>
              <div style={{...S.slot, ...(d.am?S.slotOn:S.slotOff)}}>{d.am?"✓":"–"}</div>
              <div style={{...S.slot, ...(d.pm?S.slotOn:S.slotOff)}}>{d.pm?"✓":"–"}</div>
              <div style={S.dayLabel}>{d.d}</div>
            </div>
          ))}
        </div>
        <div style={S.legend}>Top row AM · bottom row PM</div>
      </div>
      <div style={S.panel}>
        <div style={S.panelTitle}>Brushing time (min)</div>
        <svg viewBox="0 0 320 120" style={{width:"100%",height:120}}>
          <line x1="0" y1={120-(goal/maxM)*100-10} x2="320" y2={120-(goal/maxM)*100-10} stroke="#2ee6d6" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.7"/>
          {MINUTES.map((m,i)=>{ const h=(m/maxM)*100; const x=12+i*44; const ok=m>=goal; return (<g key={i}><rect x={x} y={110-h} width="28" height={h} rx="6" fill={ok?"#2ee6d6":"#7a4ad6"} opacity={ok?1:0.8}/><text x={x+14} y="118" fill="rgba(234,252,255,0.55)" fontSize="9" textAnchor="middle">{WEEK[i].d[0]}</text></g>); })}
        </svg>
        <div style={S.legend}>Dashed line is the 2-minute dentist goal</div>
      </div>
      <div style={S.panel}>
        <div style={S.panelTitle}>Coverage by area</div>
        {COVERAGE.map((c)=>(<div key={c.n} style={S.covRow}><span style={S.covName}>{c.n}</span><div style={S.covBar}><div style={{...S.covFill,width:`${c.v}%`}}/></div><span style={S.covVal}>{c.v}%</span></div>))}
      </div>
      <div style={S.footer}>Sample data for the prototype. In a build this fills from real Oral-B sessions per child.</div>
    </div>
  );
}
function Card({big,label}){ return (<div style={S.card}><div style={S.cardBig}>{big}</div><div style={S.cardLabel}>{label}</div></div>); }

/* ===================== STYLE ===================== */
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800&display=swap');
*{box-sizing:border-box}
@keyframes stampPop{0%{transform:translate(-50%,-50%) scale(0.6);opacity:0}40%{transform:translate(-50%,-50%) scale(1.08);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes finalePop{0%{transform:translate(-50%,-50%) scale(0.7);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes brushWiggle{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
@keyframes loadFill{0%{width:0%}100%{width:100%}}
@keyframes loaderIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
`;
const S={
  shell:{fontFamily:"'Nunito',ui-rounded,system-ui,sans-serif",color:"#eafcff",background:"radial-gradient(120% 80% at 50% -10%, #1a0b33 0%, #0c0720 45%, #06040d 100%)",minHeight:"100vh",padding:"18px 16px 40px",maxWidth:720,margin:"0 auto"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:12},
  logo:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:26,letterSpacing:"1px",textShadow:"0 0 18px rgba(46,230,214,0.5)"},
  tag:{fontSize:12,color:"rgba(234,252,255,0.55)",fontWeight:700},
  pill:{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:999,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(46,230,214,0.25)",fontWeight:800,fontSize:13},
  dot:{width:9,height:9,borderRadius:999},
  pillMeta:{color:"rgba(234,252,255,0.6)",fontWeight:700,fontSize:12,borderLeft:"1px solid rgba(255,255,255,0.15)",paddingLeft:8},
  tabs:{display:"flex",gap:6,marginBottom:12,background:"rgba(0,0,0,0.3)",padding:5,borderRadius:14,width:"fit-content"},
  tabBtn:{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:14,padding:"8px 22px",borderRadius:10,border:"none",background:"transparent",color:"rgba(234,252,255,0.6)",cursor:"pointer"},
  tabOn:{background:"#2ee6d6",color:"#06040d",boxShadow:"0 0 16px rgba(46,230,214,0.4)"},
  controls:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12},
  btn:{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:15,padding:"11px 16px",borderRadius:13,border:"none",cursor:"pointer",color:"#06040d"},
  btnPrimary:{background:"#eafcff"},
  btnMint:{background:"#2ee6d6",boxShadow:"0 0 20px rgba(46,230,214,0.45)"},
  btnGhost:{background:"rgba(46,230,214,0.08)",color:"#eafcff",border:"1px solid rgba(46,230,214,0.3)"},
  error:{background:"rgba(255,107,122,0.14)",border:"1px solid rgba(255,107,122,0.45)",color:"#ffd9cc",padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:700,marginBottom:12},
  stage:{position:"relative",borderRadius:18,overflow:"hidden",border:"1px solid rgba(46,230,214,0.22)",boxShadow:"0 0 40px rgba(46,230,214,0.12)"},
  canvas:{display:"block",width:"100%",height:"auto",aspectRatio:"1000 / 640",background:"#06040d"},
  hud:{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",textAlign:"center",pointerEvents:"none",textShadow:"0 2px 10px rgba(0,0,0,0.8)"},
  hudTimer:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:26,lineHeight:1},
  hudFresh:{fontWeight:800,fontSize:12,color:"#2ee6d6",letterSpacing:"0.5px"},
  rowTimer:{marginLeft:"auto",display:"flex",alignItems:"baseline",gap:10,paddingRight:4,alignSelf:"center"},
  rowTimerVal:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:24,lineHeight:1,color:"#eafcff"},
  rowTimerFresh:{fontWeight:800,fontSize:12,color:"#2ee6d6",letterSpacing:"0.5px"},
  stamp:{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",animation:"stampPop 0.4s ease-out",pointerEvents:"none"},
  stampScene:{fontWeight:800,fontSize:13,letterSpacing:"2px",color:"#2ee6d6"},
  stampMain:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:34,textShadow:"0 0 24px rgba(46,230,214,0.8)"},
  stars:{fontSize:30,color:"#ffd84a",marginTop:4,textShadow:"0 0 16px rgba(255,216,74,0.7)"},
  finale:{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",animation:"finalePop 0.5s ease-out",background:"rgba(6,4,13,0.7)",padding:"24px 30px",borderRadius:18,border:"1px solid rgba(46,230,214,0.4)"},
  finaleMain:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:42,color:"#2ee6d6",textShadow:"0 0 30px rgba(46,230,214,0.9)"},
  finaleSub:{fontWeight:800,fontSize:14,marginTop:6},
  coach:{marginTop:14,padding:"12px 16px",borderRadius:14,background:"rgba(46,230,214,0.06)",border:"1px solid rgba(46,230,214,0.2)",fontWeight:800,fontSize:14.5},
  coachWarn:{background:"rgba(255,107,122,0.16)",borderColor:"rgba(255,107,122,0.5)",color:"#ffd9cc"},
  coachDone:{background:"rgba(46,230,214,0.16)",borderColor:"rgba(46,230,214,0.5)",color:"#cffcf1"},
  stats:{display:"flex",gap:10,marginTop:12},
  stat:{flex:1,textAlign:"center",padding:"10px 6px",borderRadius:14,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(46,230,214,0.16)"},
  statValue:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:19},
  statLabel:{fontSize:10.5,fontWeight:800,color:"rgba(234,252,255,0.55)",textTransform:"uppercase",letterSpacing:"0.6px",marginTop:2},
  engineToggle:{marginTop:18,background:"none",border:"none",color:"rgba(234,252,255,0.6)",fontWeight:800,fontSize:13,cursor:"pointer",padding:0},
  engine:{marginTop:10,padding:14,borderRadius:14,background:"rgba(0,0,0,0.35)",border:"1px solid rgba(46,230,214,0.2)"},
  engineRow:{display:"flex",flexWrap:"wrap",gap:10},
  engineCell:{minWidth:90,padding:"6px 10px",borderRadius:10,background:"rgba(46,230,214,0.06)"},
  engineKey:{fontSize:10.5,fontWeight:800,color:"rgba(234,252,255,0.55)",textTransform:"uppercase",letterSpacing:"0.5px"},
  engineVal:{fontFamily:"'Fredoka',monospace",fontWeight:600,fontSize:14,marginTop:2},
  hexWrap:{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(46,230,214,0.18)"},
  hexRow:{display:"flex",flexWrap:"wrap",gap:5,marginTop:8},
  hexByte:{display:"flex",flexDirection:"column",alignItems:"center",padding:"5px 6px",borderRadius:8,background:"rgba(46,230,214,0.07)",minWidth:34},
  hexVal:{fontFamily:"monospace",fontSize:13,fontWeight:700,color:"#2ee6d6"},
  hexIdx:{fontSize:8.5,color:"rgba(234,252,255,0.5)",marginTop:2},
  footer:{marginTop:20,fontSize:12,color:"rgba(234,252,255,0.5)",lineHeight:1.5,fontWeight:700},
  // stats view
  statsView:{},
  profileRow:{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:16,background:"rgba(46,230,214,0.08)",border:"1px solid rgba(46,230,214,0.22)",marginBottom:12},
  avatar:{fontSize:34,width:56,height:56,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:"rgba(0,0,0,0.35)"},
  profileName:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:20},
  profileSub:{fontSize:13,color:"#2ee6d6",fontWeight:700},
  cardRow:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12},
  card:{padding:"14px",borderRadius:14,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(46,230,214,0.16)"},
  cardBig:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:26},
  cardLabel:{fontSize:11,fontWeight:800,color:"rgba(234,252,255,0.55)",textTransform:"uppercase",letterSpacing:"0.5px",marginTop:2},
  panel:{padding:"14px 16px",borderRadius:16,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(46,230,214,0.16)",marginBottom:12},
  panelTitle:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:15,marginBottom:12},
  weekRow:{display:"flex",justifyContent:"space-between",gap:6},
  dayCol:{display:"flex",flexDirection:"column",alignItems:"center",gap:5,flex:1},
  slot:{width:"100%",maxWidth:38,height:30,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13},
  slotOn:{background:"#2ee6d6",color:"#06040d",boxShadow:"0 0 10px rgba(46,230,214,0.35)"},
  slotOff:{background:"rgba(255,255,255,0.06)",color:"rgba(234,252,255,0.35)",border:"1px solid rgba(255,107,122,0.4)"},
  dayLabel:{fontSize:11,fontWeight:700,color:"rgba(234,252,255,0.55)"},
  legend:{fontSize:11,color:"rgba(234,252,255,0.45)",marginTop:10,fontWeight:700},
  covRow:{display:"flex",alignItems:"center",gap:10,marginBottom:9},
  covName:{fontSize:12.5,fontWeight:700,width:96,color:"rgba(234,252,255,0.8)"},
  covBar:{flex:1,height:10,borderRadius:999,background:"rgba(0,0,0,0.4)",overflow:"hidden"},
  covFill:{height:"100%",borderRadius:999,background:"#2ee6d6",boxShadow:"0 0 10px rgba(46,230,214,0.5)"},
  covVal:{fontSize:12,fontWeight:800,width:38,textAlign:"right",color:"#2ee6d6"},
  loader:{position:"fixed",inset:0,zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",background:"radial-gradient(120% 80% at 50% 30%, #1a0b33 0%, #0c0720 50%, #06040d 100%)",fontFamily:"'Nunito',system-ui,sans-serif"},
  loaderInner:{display:"flex",flexDirection:"column",alignItems:"center",animation:"loaderIn 0.4s ease-out"},
  loaderBrand:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:34,color:"#eafcff",letterSpacing:"0.5px"},
  loaderLogo:{width:230,height:"auto",marginBottom:8,filter:"drop-shadow(0 0 18px rgba(60,90,200,0.55))"},
  reg:{fontSize:13,verticalAlign:"super",opacity:0.65},
  loaderPresents:{fontSize:12,color:"rgba(234,252,255,0.5)",fontWeight:800,letterSpacing:"4px",textTransform:"uppercase",margin:"4px 0 8px"},
  loaderTitle:{fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:46,letterSpacing:"1px",textShadow:"0 0 26px rgba(46,230,214,0.6)"},
  loaderBarTrack:{width:210,height:8,borderRadius:999,background:"rgba(255,255,255,0.1)",overflow:"hidden"},
  loaderBarFill:{height:"100%",borderRadius:999,background:"#2ee6d6",boxShadow:"0 0 14px rgba(46,230,214,0.6)",width:"0%",animation:"loadFill 2.2s ease-out forwards"},
  loaderNote:{fontSize:12,color:"rgba(234,252,255,0.5)",fontWeight:700,marginTop:12},
};
