    'use strict';
    /* ================= pigeons ================= */
    const NAMES=['ハトミ','ソラ','マメ','ゴマ','スズ','タマ','ハル','アオ','クロ','シロ','ポチ','ミケ','フク','ユキ','ダイ','チビ','マル','ジン','レン','サク','トワ','ナギ','ヒナ','ルイ'];
    /* feral pigeon colour morphs (P1, Issue #11): each morph carries a
       wing pattern, a rump colour linked to the pattern, a population
       weight (percent; European feral-pigeon survey ratios — Osaka-local
       ratios are unmeasured) and whether the raised bar geometry shows.
       The flock assignment below derives from the weights and replaces
       the old uniform rotation.
       P4 (Issue #13): the barred morphs (barsGeo:true) have their rump
       raised to near-white — the pale rump flash visible in flight —
       staying within the P1 pattern-linked rump scheme. spread-black
       (rump null), pied and white keep their P1 values. */
    const MORPHS=[
      {name:'blue-bar',     body:0x8a939c, pattern:'bar',      rump:0xf4f4f0, weight:35, barsGeo:true},
      {name:'blue-checker', body:0x767e88, pattern:'checker',  rump:0xf0f0eb, weight:25, barsGeo:true},
      {name:'t-pattern',    body:0x6b7280, pattern:'tpattern', rump:0xedede8, weight:15, barsGeo:true},
      {name:'spread-black', body:0x4c4f52, pattern:'spread',   rump:null,     weight:8,  barsGeo:false},
      {name:'red',          body:0x9a6a52, pattern:'red',      rump:0xf3efe4, weight:7,  barsGeo:true},
      {name:'pied',         body:0xb5aea0, pattern:'pied',     rump:0xe4e2da, weight:5,  barsGeo:false},
      {name:'white',        body:0xd9d7d0, pattern:'white',    rump:0xe9e7e0, weight:2,  barsGeo:false},
      {name:'silver',       body:0xb0aca2, pattern:'bar',      rump:0xf2f2ed, weight:2,  barsGeo:true},
      {name:'brown-bar',    body:0x7d7268, pattern:'bar',      rump:0xf1ecdd, weight:1,  barsGeo:true},
    ];
    const BODY_COLORS=MORPHS.map(m=>m.body);
    /* P1: deterministic weighted assignment. Counts come from the
       weights by largest remainder over the flock size; the sequence
       then spreads each morph across the flock by always picking the
       morph with the largest shortfall against its even share. No
       randomness: the same build always assigns the same morph to the
       same bird. At 24 birds the counts are blue-bar 8, blue-checker 6,
       t-pattern 4, spread-black 2, red 2, pied 1, white 1 — silver
       (0.48 birds) and brown-bar (0.24 birds) fall below one bird and
       receive none; their definitions and weights stay for larger
       flocks. */
    function buildMorphAssignment(n){
      const totalW=MORPHS.reduce((s,m)=>s+m.weight,0);
      const quotas=MORPHS.map(m=>m.weight/totalW*n);
      const counts=quotas.map(q=>Math.floor(q));
      let rest=n-counts.reduce((s,c)=>s+c,0);
      const byRemainder=MORPHS.map((m,i)=>i).sort((a,b)=>{
        const fa=quotas[a]-Math.floor(quotas[a]), fb=quotas[b]-Math.floor(quotas[b]);
        if(fb!==fa) return fb-fa;
        if(MORPHS[b].weight!==MORPHS[a].weight) return MORPHS[b].weight-MORPHS[a].weight;
        return a-b;
      });
      for(let k=0;k<rest;k++) counts[byRemainder[k]]++;
      const assigned=new Array(MORPHS.length).fill(0);
      const seq=new Array(n);
      for(let k=0;k<n;k++){
        let best=-1, bestShort=-Infinity;
        for(let i=0;i<MORPHS.length;i++){
          if(assigned[i]>=counts[i]) continue;
          const short=counts[i]*(k+1)/n-assigned[i];
          if(short>bestShort){ bestShort=short; best=i; }
        }
        seq[k]=MORPHS[best]; assigned[best]++;
      }
      return seq;
    }
    const MORPH_OF_BIRD=buildMorphAssignment(NAMES.length);
    /* P7 (Issue #22): second-layer individual variation assignments.
       spreadIndicesP7 generalises P1's largest-remainder counts plus
       shortfall spread over a weights array (no randomness). */
    function spreadIndicesP7(weights, n){
      const totalW=weights.reduce((s,w)=>s+w,0);
      const quotas=weights.map(w=>w/totalW*n);
      const counts=quotas.map(q=>Math.floor(q));
      let rest=n-counts.reduce((s,c)=>s+c,0);
      const byRemainder=weights.map((w,i)=>i).sort((a,b)=>{
        const fa=quotas[a]-Math.floor(quotas[a]), fb=quotas[b]-Math.floor(quotas[b]);
        if(fb!==fa) return fb-fa;
        if(weights[b]!==weights[a]) return weights[b]-weights[a];
        return a-b;
      });
      for(let k=0;k<rest;k++) counts[byRemainder[k]]++;
      const assigned=new Array(weights.length).fill(0);
      const seq=new Array(n);
      for(let k=0;k<n;k++){
        let best=-1, bestShort=-Infinity;
        for(let i=0;i<weights.length;i++){
          if(assigned[i]>=counts[i]) continue;
          const short=counts[i]*(k+1)/n-assigned[i];
          if(short>bestShort){ bestShort=short; best=i; }
        }
        seq[k]=best; assigned[best]++;
      }
      return seq;
    }
    const P7_VARIANTS=[{jitter:0.96, uOff:0.00},{jitter:1.00, uOff:0.34},{jitter:1.04, uOff:0.67}];
    const BIRD_VARIANT=spreadIndicesP7([1,1,1], NAMES.length);
    const NECK_CLASSES=[{name:'strong', emissive:1.30, sheen:1.25, tint:null},{name:'weak', emissive:1.00, sheen:1.00, tint:null},{name:'juvenile', emissive:0.45, sheen:0.40, tint:0xb9b2a4}];
    const BIRD_NECK_CLASS=spreadIndicesP7([33,50,17], NAMES.length);
    const NECK_COLORS=[0x2e8f6e,0x2e8f6e,0x7a5fb0,0x3a9a7c,0x2e8f6e,0x6a55a8];
    /* iridescence endpoints: fully saturated emerald ⇄ violet — the
       previous muted pair mixed to a pale blue-grey at side views */
    const NECK_A=new THREE.Color(0x00c853), NECK_B=new THREE.Color(0x9d00ff);

    /* display scale: pigeons render at 1.6x real size (was an across-the-
       board 2.45x). Grounding / collision stay on the real-size frame:
       BODY_Y is the body-centre height above the contact surface. */
    const DISPLAY_SCALE=1.6;
    /* BODY_Y raised again 0.34 → 0.42 (2026-10-31 follow-up): the
       2026-10-31 close-up verification still found the legs reading as
       thin lines tucked under the belly. At 0.42 with the lengthened
       tarsus below, ~20 cm (display) of vivid-red leg stands in open
       air between the body underside and the ground, so standing and
       walking birds show full legs down to the feet. Leg geometry and
       the per-frame leg offsets are sized to land the feet exactly on
       the contact surface at this height. */
    const BODY_Y=0.42;
    const bodyGeo=new THREE.SphereGeometry(0.16, 20, 15);
    const headGeo=new THREE.SphereGeometry(0.056, 14, 11);
    const beakGeo=new THREE.ConeGeometry(0.016, 0.062, 7);
    /* tarsus: radius roughly doubled (0.011 → 0.019 top) and lengthened
       (0.15 → 0.22) so the leg reads as a thick red column at 2–3 m,
       not a 1-px orange line */
    const legGeo=new THREE.CylinderGeometry(0.019,0.016,0.22,9);

    /* feather textures (canvas): body scallops, wing barbs + twin bars, tail fan */
    function featherTexture(draw){
      const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
      draw(cv.getContext('2d'));
      const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=8; t.wrapS=THREE.RepeatWrapping; // P7 (Issue #22): wrapS for per-variant UV offset
      return t;
    }
    /* close-range (至近LOD) high-resolution feather textures: 2048px
       canvases, split per region (body/head, wing, tail) and swapped in
       only for a bird the camera is within ~3 m of, so the twin wing
       bars / tail band keep a hard luminance edge (ΔL* >= 35). Draw
       callbacks author in 1024-space; the context is scaled x2. */
    function featherTextureHi(draw){
      const cv=document.createElement('canvas'); cv.width=2048; cv.height=2048;
      const g=cv.getContext('2d'); g.scale(2,2);
      draw(g);
      const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.wrapS=THREE.RepeatWrapping; // P7 (Issue #22)
      t.anisotropy=Math.min(16, renderer.capabilities.getMaxAnisotropy());
      return t;
    }
    /* P5 (Issue #12): the one new texture of this unit — a shared
       procedural roughnessMap for every feathered material. Grayscale,
       because three.js r128 drives roughness from the GREEN channel of
       roughnessMap. The base value is RGB 230 (≈0.90): the feather
       materials already sit at roughness 0.85–0.95, and in r128 the
       map multiplies the scalar, so an 0.90 average leaves the
       effective roughness level essentially unchanged — only the
       modulation shows, in raking light. The modulation follows the
       barb flow of wingTexBase (same slope: moveTo(x,256) →
       lineTo(x+58,0)) as ~6px-period stripes swinging the value ±14,
       plus a gentle ±8 global gradient perpendicular to that flow.
       Fully deterministic (no Math.random). No sRGB encoding: this is
       a data texture and must stay linear. */
    function featherRoughTexture(){
      const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
      const g=cv.getContext('2d');
      g.fillStyle='rgb(230,230,230)'; g.fillRect(0,0,256,256);
      g.lineWidth=3;
      for(let x=-58,i=0;x<256+58;x+=3,i++){ // barb-direction stripes, ±14 around the base
        const v=(i%2===0)?244:216;
        g.strokeStyle='rgb('+v+','+v+','+v+')';
        g.beginPath(); g.moveTo(x,256); g.lineTo(x+58,0); g.stroke();
      }
      // global gradient along (256,58) — perpendicular to the barb
      // slope — scaled so its projection spans the whole canvas; the
      // alpha swing is ≈±8 in RGB value.
      const grad=g.createLinearGradient(0,0,299,68);
      grad.addColorStop(0,'rgba(255,255,255,0.031)');
      grad.addColorStop(1,'rgba(0,0,0,0.031)');
      g.fillStyle=grad; g.fillRect(0,0,256,256);
      const t=new THREE.CanvasTexture(cv); // no encoding: linear data texture
      t.anisotropy=8; t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.RepeatWrapping;
      return t;
    }
    const featherRoughTex=featherRoughTexture();
    const bodyTex=featherTexture(g=>{
      g.fillStyle='#f2f2f0'; g.fillRect(0,0,256,256);
      // darker mantle (sphere top = canvas top) fading to a pale belly
      const grad=g.createLinearGradient(0,0,0,256);
      grad.addColorStop(0,'rgba(38,40,46,.34)'); grad.addColorStop(0.5,'rgba(38,40,46,.05)');
      grad.addColorStop(0.85,'rgba(255,255,250,.10)'); grad.addColorStop(1,'rgba(255,255,250,.22)');
      g.fillStyle=grad; g.fillRect(0,0,256,256);
      g.strokeStyle='rgba(52,54,60,.38)'; g.lineWidth=1.6;
      for(let r=0;r<9;r++) for(let c=0;c<6;c++){ // overlapping feather scallops
        g.beginPath(); g.arc(c*44+(r%2)*22, r*30, 21, 0.25, Math.PI-0.25); g.stroke();
      }
      for(let i=0;i<1500;i++){ g.fillStyle='rgba(60,60,64,'+(Math.random()*0.07)+')'; g.fillRect(Math.random()*256,Math.random()*256,1.4,1.4); }
    });
    const wingTexBase=featherTexture(g=>{
      g.fillStyle='#e8e8e4'; g.fillRect(0,0,256,256);
      g.strokeStyle='rgba(70,70,76,.4)'; g.lineWidth=1.1;
      for(let i=0;i<44;i++){ g.beginPath(); g.moveTo(i*6, 256); g.lineTo(i*6+58, 0); g.stroke(); } // barbs
      g.fillStyle='rgba(52,54,60,.18)'; g.fillRect(0,0,256,26); g.fillRect(0,230,256,26); // covert shading
      const grad=g.createLinearGradient(185,0,256,0); grad.addColorStop(0,'rgba(30,31,36,0)'); grad.addColorStop(1,'rgba(30,31,36,.72)');
      g.fillStyle=grad; g.fillRect(185,0,71,256); // dark primary tips
    });
    /* P4 (Issue #13): underwing texture for the flight flash. Pale
       whitish-grey coverts with faint barb strokes in the same flow as
       wingTexBase; the only dark area is the primary tips. u runs root
       0 → tip 1 (same convention as drawWingPattern), so the dark band
       is a horizontal gradient over u ≈ 0.78 → 1.0. Fully
       deterministic (no randomness). */
    const underwingTex=featherTexture(g=>{
      g.fillStyle='#d9d9d3'; g.fillRect(0,0,256,256);
      g.strokeStyle='rgba(120,120,124,.26)'; g.lineWidth=1.1;
      for(let i=0;i<44;i++){ g.beginPath(); g.moveTo(i*6, 256); g.lineTo(i*6+58, 0); g.stroke(); } // faint barbs
      const grad=g.createLinearGradient(0.78*256,0,256,0); grad.addColorStop(0,'rgba(30,31,36,0)'); grad.addColorStop(1,'rgba(30,31,36,.85)');
      g.fillStyle=grad; g.fillRect(0.78*256,0,256-0.78*256,256); // dark primary tips only
    });
    /* P1: wing pattern overlay, drawn in unit space so the same code
       serves the 256px Lo canvas and the 1024-unit Hi authoring space
       (u runs root 0 to tip 1 across the canvas width). The twin bars
       sit at the same u positions the old code used (112/256 Lo,
       448/1024 Hi). Fully deterministic: fixed patch layout, no random
       placement, so a pattern reads identically on every load. */
    function drawWingPattern(g, S, pattern){
      const bars=style=>{ g.fillStyle=style; g.fillRect(0.4375*S,0,0.0898*S,S); g.fillRect(0.5859*S,0,0.0781*S,S); };
      const patches=(style,scale,alpha)=>{
        g.fillStyle=style; g.globalAlpha=alpha;
        const cols=6, rows=5, cw=S/cols, ch=S/rows;
        for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
          if((r+c)%2) continue;
          const cx=(c+0.5)*cw+(r%2?cw*0.18:0), cy=(r+0.5)*ch;
          if(cx>0.76*S) continue; // coverts only: the primary tips stay clean
          g.beginPath(); g.ellipse(cx,cy,cw*0.44*scale,ch*0.42*scale,-0.5,0,Math.PI*2); g.fill();
        }
        g.globalAlpha=1;
      };
      if(pattern==='bar'){
        bars('rgba(22,23,28,.94)');
      } else if(pattern==='checker'){
        patches('#16171c',1,0.5);
        bars('rgba(22,23,28,.94)');
      } else if(pattern==='tpattern'){
        g.fillStyle='rgba(20,21,26,.28)'; g.fillRect(0,0,S,S);
        patches('#101116',1.3,0.85);
        bars('rgba(16,17,22,.96)');
      } else if(pattern==='red'){
        patches('#46231a',1,0.38);
        bars('rgba(70,35,24,.92)');
      } else if(pattern==='spread'){
        g.fillStyle='rgba(15,16,20,.93)'; g.fillRect(0,0,S,S);
        g.strokeStyle='rgba(210,210,215,.10)'; g.lineWidth=Math.max(1,S/512);
        for(let i=0;i<28;i++){ g.beginPath(); g.moveTo(i*(S/24),S); g.lineTo(i*(S/24)+S*0.22,0); g.stroke(); }
      } else if(pattern==='pied'){
        bars('rgba(22,23,28,.9)');
        g.fillStyle='rgba(246,245,238,.96)';
        const blobs=[[0.16,0.24,0.15,0.20],[0.44,0.60,0.19,0.24],[0.63,0.28,0.12,0.16],[0.30,0.80,0.11,0.13],[0.80,0.58,0.14,0.18],[0.55,0.88,0.10,0.11]];
        for(const b of blobs){ g.beginPath(); g.ellipse(b[0]*S,b[1]*S,b[2]*S,b[3]*S,0.4,0,Math.PI*2); g.fill(); }
      } else if(pattern==='white'){
        g.fillStyle='rgba(247,247,243,.88)'; g.fillRect(0,0,S,S);
        bars('rgba(110,110,116,.35)');
      }
    }
    /* P2 (Issue #20): far-LOD wing pattern — same layout as
       drawWingPattern, posterised for distance: the twin bars keep
       their centres (u 0.4824 / 0.6250) but widen 1.5x, bar alpha goes
       to 1.0 (white stays ghosted at 0.53) and the patch alphas rise
       (checker 0.75, tpattern 1.0, red 0.57) so the pattern still
       reads when the bird is a few dozen pixels tall. Cell layout,
       the spread wash/strokes and the pied blobs are unchanged. */
    function drawWingPatternFar(g, S, pattern){
      const bars=style=>{ g.fillStyle=style; g.fillRect(0.4150*S,0,0.1347*S,S); g.fillRect(0.5664*S,0,0.1172*S,S); };
      const patches=(style,scale,alpha)=>{
        g.fillStyle=style; g.globalAlpha=alpha;
        const cols=6, rows=5, cw=S/cols, ch=S/rows;
        for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
          if((r+c)%2) continue;
          const cx=(c+0.5)*cw+(r%2?cw*0.18:0), cy=(r+0.5)*ch;
          if(cx>0.76*S) continue; // coverts only: the primary tips stay clean
          g.beginPath(); g.ellipse(cx,cy,cw*0.44*scale,ch*0.42*scale,-0.5,0,Math.PI*2); g.fill();
        }
        g.globalAlpha=1;
      };
      if(pattern==='bar'){
        bars('rgba(22,23,28,1)');
      } else if(pattern==='checker'){
        patches('#16171c',1,0.75);
        bars('rgba(22,23,28,1)');
      } else if(pattern==='tpattern'){
        g.fillStyle='rgba(20,21,26,.28)'; g.fillRect(0,0,S,S);
        patches('#101116',1.3,1.0);
        bars('rgba(16,17,22,1)');
      } else if(pattern==='red'){
        patches('#46231a',1,0.57);
        bars('rgba(70,35,24,1)');
      } else if(pattern==='spread'){
        g.fillStyle='rgba(15,16,20,.93)'; g.fillRect(0,0,S,S);
        g.strokeStyle='rgba(210,210,215,.10)'; g.lineWidth=Math.max(1,S/512);
        for(let i=0;i<28;i++){ g.beginPath(); g.moveTo(i*(S/24),S); g.lineTo(i*(S/24)+S*0.22,0); g.stroke(); }
      } else if(pattern==='pied'){
        bars('rgba(22,23,28,1)');
        g.fillStyle='rgba(246,245,238,.96)';
        const blobs=[[0.16,0.24,0.15,0.20],[0.44,0.60,0.19,0.24],[0.63,0.28,0.12,0.16],[0.30,0.80,0.11,0.13],[0.80,0.58,0.14,0.18],[0.55,0.88,0.10,0.11]];
        for(const b of blobs){ g.beginPath(); g.ellipse(b[0]*S,b[1]*S,b[2]*S,b[3]*S,0.4,0,Math.PI*2); g.fill(); }
      } else if(pattern==='white'){
        g.fillStyle='rgba(247,247,243,.88)'; g.fillRect(0,0,S,S);
        bars('rgba(110,110,116,.53)');
      }
    }
    const wingCache={};
    function wingTextureFor(morph){
      const key=morph.pattern;
      if(wingCache[key]) return wingCache[key];
      const t=featherTexture(g=>{
        g.drawImage(wingTexBase.image,0,0);
        drawWingPattern(g,256,morph.pattern);
      });
      wingCache[key]=t;
      return t;
    }
    const wingFarCache={};
    function wingTextureFarFor(morph){
      const key=morph.pattern;
      if(wingFarCache[key]) return wingFarCache[key];
      const t=featherTexture(g=>{
        g.drawImage(wingTexBase.image,0,0);
        drawWingPatternFar(g,256,morph.pattern);
      });
      wingFarCache[key]=t;
      return t;
    }
    const tailTex=featherTexture(g=>{
      g.fillStyle='#e9e9e6'; g.fillRect(0,0,256,256);
      // P4 (Issue #13): white outer tail edges, drawn under the shafts /
      // subterminal band / tip edge so the band crosses over the white
      g.fillStyle='rgba(248,248,244,.95)'; g.fillRect(0,0,14,256); g.fillRect(242,0,14,256);
      g.strokeStyle='rgba(70,70,74,.3)'; g.lineWidth=2;
      for(let i=1;i<7;i++){ g.beginPath(); g.moveTo(i*36,256); g.lineTo(i*36,0); g.stroke(); } // feather shafts
      g.fillStyle='rgba(24,25,30,.92)'; g.fillRect(0,26,256,52); // subterminal band
      g.fillStyle='rgba(245,245,242,.9)'; g.fillRect(0,0,256,12); // pale tip edge
    });
    /* P2 (Issue #20): far-LOD tail — identical to tailTex except the
       subterminal band widens from 52 to 78 px toward the root (the
       tip-side edge stays at y=26) so the band survives minification. */
    const tailTexFar=featherTexture(g=>{
      g.fillStyle='#e9e9e6'; g.fillRect(0,0,256,256);
      g.fillStyle='rgba(248,248,244,.95)'; g.fillRect(0,0,14,256); g.fillRect(242,0,14,256);
      g.strokeStyle='rgba(70,70,74,.3)'; g.lineWidth=2;
      for(let i=1;i<7;i++){ g.beginPath(); g.moveTo(i*36,256); g.lineTo(i*36,0); g.stroke(); } // feather shafts
      g.fillStyle='rgba(24,25,30,.92)'; g.fillRect(0,26,256,78); // subterminal band, widened for far LOD
      g.fillStyle='rgba(245,245,242,.9)'; g.fillRect(0,0,256,12); // pale tip edge
    });
    /* P6 (Issue #21): iris radial-gradient texture for the close-LOD
       eyeball (SHARED_IRIS_MAT below). Canvas 256x128; on the sphere
       UV the outward (+x) direction maps to the centre (0.5, 0.5) and
       the opposite (-x) eye to the u seam (0 / 1), so the same radial
       gradient is drawn at x = 0, 128 and 256 (y = 64, radius ~62px)
       and either eye lands on a gradient centre. Colours run gold
       #f2b53a at the centre through orange #e8761d (~45%) and deep
       orange #c4500f (~80%) to #8f3408 at the rim, with faint radial
       striations placed deterministically via the existing hash()
       helper (no Math.random). Colour map, so sRGB encoding and
       anisotropy 8 follow the surrounding feather textures. */
    function irisGradientTexture(){
      const cv=document.createElement('canvas'); cv.width=256; cv.height=128;
      const g=cv.getContext('2d');
      g.fillStyle='#8f3408'; g.fillRect(0,0,256,128);
      for(const cx of [0,128,256]){
        const grad=g.createRadialGradient(cx,64,0,cx,64,62);
        grad.addColorStop(0,'#f2b53a');
        grad.addColorStop(0.45,'#e8761d');
        grad.addColorStop(0.8,'#c4500f');
        grad.addColorStop(1,'#8f3408');
        g.fillStyle=grad;
        g.beginPath(); g.arc(cx,64,62,0,Math.PI*2); g.fill();
        g.lineWidth=1;
        for(let i=0;i<72;i++){ // faint radial striations, deterministic via hash()
          const a=(i/72)*Math.PI*2+hash(i*3.7)*0.06;
          const r0=6+hash(i*7.1)*10, r1=52+hash(i*11.3)*9;
          g.strokeStyle=hash(i*13.9)>0.5?'rgba(255,214,120,0.10)':'rgba(90,30,4,0.10)';
          g.beginPath();
          g.moveTo(cx+Math.cos(a)*r0, 64+Math.sin(a)*r0);
          g.lineTo(cx+Math.cos(a)*r1, 64+Math.sin(a)*r1);
          g.stroke();
        }
      }
      const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=8;
      return t;
    }
    const irisTex=irisGradientTexture();
    /* B6 (Issue #10): the 2048px close-LOD canvases are no longer drawn
       at startup. bodyTexHi / wingTexHiBase / tailTexHi start as 2x2
       placeholder CanvasTextures (same names, same sRGB encoding) and
       ensureHiTextures() below renders the real canvases — with these
       same draw callbacks — on first use. The Hi materials reach a mesh
       only via setCloseLOD(true), and the tail fan is invisible until
       then, so a placeholder is never drawn. */
    const drawBodyTexHi=g=>{
      g.drawImage(bodyTex.image,0,0,1024,1024);
      g.strokeStyle='rgba(52,54,60,.30)'; g.lineWidth=3;
      for(let r=0;r<18;r++) for(let c=0;c<12;c++){ g.beginPath(); g.arc(c*88+(r%2)*44, r*60, 42, 0.25, Math.PI-0.25); g.stroke(); }
      for(let i=0;i<6000;i++){ g.fillStyle='rgba(60,60,64,'+(Math.random()*0.06)+')'; g.fillRect(Math.random()*1024,Math.random()*1024,2.4,2.4); }
    };
    const drawWingTexHiBase=g=>{
      g.fillStyle='#ececea'; g.fillRect(0,0,1024,1024);
      g.strokeStyle='rgba(70,70,76,.34)'; g.lineWidth=2;
      for(let i=0;i<170;i++){ g.beginPath(); g.moveTo(i*6, 1024); g.lineTo(i*6+230, 0); g.stroke(); } // fine barbs
      g.fillStyle='rgba(52,54,60,.16)'; g.fillRect(0,0,1024,104); g.fillRect(0,920,1024,104);
      const grad=g.createLinearGradient(740,0,1024,0); grad.addColorStop(0,'rgba(30,31,36,0)'); grad.addColorStop(1,'rgba(30,31,36,.72)');
      g.fillStyle=grad; g.fillRect(740,0,284,1024);
    };
    const wingHiCache={};
    function wingTextureHiFor(morph){
      ensureHiTextures(); // the hi base must be a real canvas before the drawImage below
      const key=morph.pattern;
      if(wingHiCache[key]) return wingHiCache[key];
      const t=featherTextureHi(g=>{
        g.drawImage(wingTexHiBase.image,0,0,1024,1024);
        drawWingPattern(g,1024,morph.pattern);
      });
      wingHiCache[key]=t;
      return t;
    }
    const drawTailTexHi=g=>{
      g.fillStyle='#eeeEea'; g.fillRect(0,0,1024,1024);
      g.strokeStyle='rgba(70,70,74,.32)'; g.lineWidth=5;
      for(let i=0;i<12;i++){ const x=42+i*85; g.beginPath(); g.moveTo(x,1024); g.lineTo(x,0); g.stroke(); } // 12 rectrix shafts
      g.fillStyle='#0e0f13'; g.fillRect(0,104,1024,208); // subterminal band, maximum contrast
      g.fillStyle='rgba(248,248,245,.95)'; g.fillRect(0,0,1024,48);
    };
    function hiPlaceholderTex(){
      const cv=document.createElement('canvas'); cv.width=2; cv.height=2;
      const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.wrapS=THREE.RepeatWrapping; // P7 (Issue #22)
      return t;
    }
    const bodyTexHi=hiPlaceholderTex();
    const wingTexHiBase=hiPlaceholderTex();
    const tailTexHi=hiPlaceholderTex();
    let hiTexturesReady=false;
    function ensureHiTextures(){
      if(hiTexturesReady) return; // generate once, on first close-LOD use
      hiTexturesReady=true;
      const fill=(tex,draw)=>{
        const cv=document.createElement('canvas'); cv.width=2048; cv.height=2048;
        const g=cv.getContext('2d'); g.scale(2,2);
        draw(g);
        tex.image=cv;
        tex.anisotropy=Math.min(16, renderer.capabilities.getMaxAnisotropy());
        tex.needsUpdate=true;
      };
      fill(bodyTexHi, drawBodyTexHi);
      fill(wingTexHiBase, drawWingTexHiBase);
      fill(tailTexHi, drawTailTexHi);
    }
    /* wing silhouette: rounded tip, notched trailing edge (shape -> horizontal) */
    function makeWingGeo(){
      const s=new THREE.Shape();
      s.moveTo(0,0.095);
      s.quadraticCurveTo(0.2,0.105, 0.35,0.055);
      s.quadraticCurveTo(0.415,0.03, 0.40,-0.01);
      s.quadraticCurveTo(0.36,-0.045, 0.315,-0.052);
      s.lineTo(0.30,-0.028); s.lineTo(0.265,-0.062); s.lineTo(0.245,-0.036);
      s.lineTo(0.205,-0.075); s.lineTo(0.185,-0.045);
      s.quadraticCurveTo(0.08,-0.095, 0,-0.085);
      s.closePath();
      const geo=new THREE.ShapeGeometry(s, 6);
      geo.rotateX(Math.PI/2); // shape +y (leading edge) -> +z (forward)
      const uvA=geo.attributes.uv;
      for(let i=0;i<uvA.count;i++) uvA.setXY(i, uvA.getX(i)/0.42, uvA.getY(i)/0.21+0.5);
      return geo;
    }
    const wingGeo=makeWingGeo();
    /* P3 (Issue #24): two-joint wing. The wing shape is split at the
       wrist (x = P3_WRIST_X in wing-geometry coordinates) into inner
       and outer geometries by clipping every triangle of wingGeo
       against the wrist plane, interpolating position / normal / uv,
       so the silhouette and the UV layout (P1 morph wing patterns,
       P7 variant UV offsets) are preserved exactly and the two parts
       sum to the original wing area. The outer part is re-based to
       the wrist so it can hang on a pivot group there; wingGeo itself
       stays whole for the folded panels, the P4 underwing panels and
       the P2 far-LOD full wing. */
    const P3_WRIST_X=0.205;
    const P3_LAG_RAD=0.55;
    function clipWingGeo(src, W, keepOuter){
      const posA=src.attributes.position, norA=src.attributes.normal, uvA=src.attributes.uv;
      const idx=src.index.array;
      const read=i=>({p:[posA.getX(i),posA.getY(i),posA.getZ(i)], n:[norA.getX(i),norA.getY(i),norA.getZ(i)], u:[uvA.getX(i),uvA.getY(i)]});
      const out={p:[], n:[], u:[]};
      const push=v=>{ out.p.push(v.p[0],v.p[1],v.p[2]); out.n.push(v.n[0],v.n[1],v.n[2]); out.u.push(v.u[0],v.u[1]); };
      const inside=v=>keepOuter?(v.p[0]>=W):(v.p[0]<=W);
      const cut=(a,b)=>{ const t=(W-a.p[0])/(b.p[0]-a.p[0]); const mix=(x,y)=>x+(y-x)*t;
        return {p:[W, mix(a.p[1],b.p[1]), mix(a.p[2],b.p[2])], n:[mix(a.n[0],b.n[0]), mix(a.n[1],b.n[1]), mix(a.n[2],b.n[2])], u:[mix(a.u[0],b.u[0]), mix(a.u[1],b.u[1])]}; };
      for(let t=0;t<idx.length;t+=3){
        const poly=[read(idx[t]), read(idx[t+1]), read(idx[t+2])];
        const clipped=[];
        for(let i=0;i<poly.length;i++){
          const a=poly[i], b=poly[(i+1)%poly.length];
          if(inside(a)) clipped.push(a);
          if(inside(a)!==inside(b)) clipped.push(cut(a,b));
        }
        for(let i=1;i+1<clipped.length;i++){ push(clipped[0]); push(clipped[i]); push(clipped[i+1]); }
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(out.p,3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(out.n,3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(out.u,2));
      return g;
    }
    const wingInnerGeo=clipWingGeo(wingGeo, P3_WRIST_X, false);
    const wingOuterGeo=clipWingGeo(wingGeo, P3_WRIST_X, true); wingOuterGeo.translate(-P3_WRIST_X,0,0);
    /* P3 (Issue #24): primary flight-feather cards -- one shared
       trapezoid (origin at the feather root, unit length along +x,
       scaled per feather), 5 per wing along the outer wing's
       trailing edge. The closed angles stack the cards parallel;
       the open angles fan them. Driven only by flapPhase in
       animate(), never by a new random source. */
    const P3_PRIM_ROOTS=[[0.225,-0.062],[0.262,-0.068],[0.298,-0.062],[0.332,-0.050],[0.363,-0.034]];
    const P3_PRIM_LENGTHS=[0.105,0.125,0.140,0.148,0.142];
    const P3_PRIM_CLOSED=[0.98,0.98,0.98,0.98,0.98];
    const P3_PRIM_OPEN=[1.30,1.12,0.94,0.76,0.58];
    const primGeo=(()=>{ const g=new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0.011, 0,0,-0.011, 1,0,0.006, 1,0,-0.006],3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0],3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0.55,0.32, 0.55,0.68, 0.98,0.32, 0.98,0.68],2));
      g.setIndex([0,1,2, 1,3,2]); return g; })();
    const tailGeo=new THREE.PlaneGeometry(0.175, 0.2); tailGeo.rotateX(-Math.PI/2); tailGeo.translate(0,0,-0.095);
    /* P4 (Issue #13): shared geometry for the close-LOD tail fan's
       white outer-edge strips — same transform chain as the fan's
       fGeo (translate(0,0.1,0) → rotateX(-PI/2)), narrower plane. */
    const tailEdgeGeo=new THREE.PlaneGeometry(0.007, 0.2); tailEdgeGeo.translate(0,0.1,0); tailEdgeGeo.rotateX(-Math.PI/2);
    /* foot plate: wider + longer than before, dropped so its underside
       sits exactly on the contact surface at BODY_Y = 0.42
       (foot mesh y −0.155 + geometry offset −0.107 = −0.262 local
       = −0.42 world after the 1.6 display scale) */
    const footGeo=new THREE.BoxGeometry(0.07, 0.014, 0.135); footGeo.translate(0,-0.107,0.03);
    const exclaimTex=(()=>{ 
      const cv=document.createElement('canvas'); cv.width=cv.height=96;
      const g=cv.getContext('2d');
      g.beginPath(); g.arc(48,48,42,0,Math.PI*2); g.fillStyle='#e8a713'; g.fill();
      g.lineWidth=6; g.strokeStyle='#fff'; g.stroke();
      g.fillStyle='#fff'; g.font='900 62px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('!',48,52);
      const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; return t;
    })();

    /* ---- iridescent neck: gradient texture + fresnel sheen shell ----
       The 2026-10-31 verification found the neck reading as a flat mint
       patch with no green⇄violet change from either flank. Root cause:
       the old material was one uniform colour per bird per frame
       (colour + matching emissive), so the whole sphere was a single
       flat tone in any single view. Two fixes, both spatial:
       1. A wrap-around canvas texture whose hue cycles emerald→violet
          twice around the neck, so any side view already spans green
          and violet across the visible face; per frame the texture
          offset rotates with the viewing azimuth, so the bands sweep
          as the camera (or the bird) turns.
       2. An additive sheen shell whose fragment colour mixes emerald⇄
          violet by the view-space normal across the surface plus a
          fresnel rim — a gloss that varies *within* one frame, not
          only between frames. */
    /* P8 (Issue #23): gold -> yellow-green stops inserted into the
       green<->violet transition band of each cycle (0.16-0.30 and
       0.66-0.80), so the sweep reads emerald -> teal -> gold ->
       chartreuse -> violet, closer to a real feral pigeon's neck.
       Every pre-existing stop (position and colour) is unchanged,
       so the item-6 main transition and the fresnel sheen shell are
       untouched; the stops live in the texture, so the per-frame
       offset rotation and the P7 neckPhase ride on them as before. */
    const P8_NECK_STOPS=[[0.00,'#00d95e'],[0.16,'#00c2a0'],[0.205,'#d9a514'],[0.25,'#9fc53a'],[0.30,'#7b2ff2'],[0.44,'#b04dff'],[0.52,'#00d95e'],[0.66,'#00c2a0'],[0.705,'#d9a514'],[0.75,'#9fc53a'],[0.80,'#7b2ff2'],[0.94,'#b04dff'],[1.00,'#00d95e']];
    const neckCanvas=(()=>{
      const cv=document.createElement('canvas'); cv.width=512; cv.height=256;
      const g=cv.getContext('2d');
      const grad=g.createLinearGradient(0,0,512,0);
      for(const s of P8_NECK_STOPS) grad.addColorStop(s[0], s[1]); // P8 (Issue #23)
      g.fillStyle=grad; g.fillRect(0,0,512,256);
      const vshade=g.createLinearGradient(0,0,0,256); // brighter crown, deeper throat base
      vshade.addColorStop(0,'rgba(255,255,255,.20)'); vshade.addColorStop(0.55,'rgba(0,0,0,0)');
      vshade.addColorStop(1,'rgba(20,0,40,.28)');
      g.fillStyle=vshade; g.fillRect(0,0,512,256);
      g.strokeStyle='rgba(10,20,16,.30)'; g.lineWidth=2.2; // feather scallops so it reads as plumage, not plastic
      for(let r=0;r<8;r++) for(let c=0;c<12;c++){
        g.beginPath(); g.arc(c*46+(r%2)*23, r*34+8, 24, 0.2, Math.PI-0.2); g.stroke();
      }
      return cv;
    })();
    function makeNeckSheenMat(){
      return new THREE.ShaderMaterial({
        uniforms:{ uShift:{value:0},
          uA:{value:new THREE.Color(0x00e065)}, uB:{value:new THREE.Color(0xa020ff)},
          uHi:{value:new THREE.Color(0xc8ffe9)} },
        vertexShader:[
          'varying vec3 vN; varying vec3 vV;',
          'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0);',
          ' vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);',
          ' gl_Position=projectionMatrix*mv; }'
        ].join('\n'),
        fragmentShader:[
          'uniform float uShift; uniform vec3 uA; uniform vec3 uB; uniform vec3 uHi;',
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          ' vec3 N=normalize(vN); vec3 V=normalize(vV);',
          ' float ndv=clamp(dot(N,V),0.0,1.0);',
          ' float fres=pow(1.0-ndv,1.5);',
          ' float sweep=N.x*0.78+N.y*0.28;',           // varies across the visible face
          ' float t=clamp(0.5+sweep*0.95+(uShift-0.5)*1.05,0.0,1.0);',
          ' vec3 col=mix(uA,uB,t);',
          ' col+=uHi*pow(fres,2.0)*0.55;',               // bright rim where the gloss grazes
          ' float alpha=0.16+fres*0.62+pow(ndv,3.0)*0.22;',
          ' gl_FragColor=vec4(col*(0.55+0.95*fres+0.35*pow(ndv,2.0)), alpha*0.9);',
          '}'
        ].join('\n'),
        transparent:true, blending:THREE.AdditiveBlending, depthWrite:false
      });
    }
    /* P8 (Issue #23): weak fresnel tint for the folded-wing coverts,
       close LOD only. One shared ShaderMaterial (no per-bird
       uniforms, nothing rewritten per frame) plus, per bird, two
       shell meshes reusing the shared wingGeo -- no new textures and
       no new geometry. The shells are children of the folded panels,
       so they inherit the panels' transforms and their folded-only
       visibility; the close-LOD gate itself is applied in
       setCloseLOD, and setFarLOD forces the shells off, so the P2
       far LOD never shows the tint. Peak alpha is 0.20 at grazing
       angles and zero head-on -- deliberately far weaker than the
       neck sheen -- mixing the same emerald<->violet pair. Being a
       ShaderMaterial (not MeshStandardMaterial), it is not reached
       by C2's tuneEnvIntensity traverse and carries no
       envMapIntensity; being outside morphMatsFor, it leaves the P5
       featherRough sharing and the P7 variant UV shift (which apply
       to the wing materials themselves) untouched. */
    const SHARED_COVERT_TINT_MAT=new THREE.ShaderMaterial({
      uniforms:{ uA:{value:new THREE.Color(0x00c95c)}, uB:{value:new THREE.Color(0x8a3ffc)} },
      vertexShader:[
        'varying vec3 vN; varying vec3 vV;',
        'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0);',
        ' vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);',
        ' gl_Position=projectionMatrix*mv; }'
      ].join('\n'),
      fragmentShader:[
        'uniform vec3 uA; uniform vec3 uB;',
        'varying vec3 vN; varying vec3 vV;',
        'void main(){',
        ' vec3 N=normalize(vN); vec3 V=normalize(vV);',
        ' float ndv=clamp(dot(N,V),0.0,1.0);',
        ' float fres=pow(1.0-ndv,2.0);',
        ' float t=clamp(0.5+(N.x*0.78+N.y*0.28)*0.95,0.0,1.0);',
        ' vec3 col=mix(uA,uB,t);',
        ' gl_FragColor=vec4(col, fres*0.20);',
        '}'
      ].join('\n'),
      transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide
    });

    /* P9 (Issue #27): feather fringe trial, close LOD only -- shell
       texturing deliberately weakened to the minimum. At most two
       shells per volume, offset 1 mm / 2 mm from the host surface
       (the 0.001 / 0.002 convention of the P8 covert shells above),
       no shell texture or strand pattern at all, and an alpha that
       is exactly zero face-on and reaches only 0.16 (inner shell) /
       0.08 (outer shell) at a grazing silhouette angle
       (fres = pow(1 - ndv, 2)), so under back / side light the rim
       can soften without ever reading as a solid halo. The shells
       reuse each host mesh's own geometry (body / neck / head --
       the volumetric parts that carry the silhouette; the flat
       wing / tail planes get no shell, because offsetting a plane
       along its normal cannot widen its silhouette) and are
       children of the host meshes, so the existing transforms
       (body squash, neck scale, head-group motion) carry them with
       no per-frame code. Two shared materials, one per layer, with
       identical shader code compile to a single program; no new
       textures and no new geometry.
       Draw order (this unit's stop condition concerns the
       occlusion ghost): the shells are transparent with
       depthWrite:false and depthTest left on, and
       renderOrder = P9_RENDER_ORDER (1), so in the transparent
       pass they draw after every renderOrder-0 transparent in the
       scene -- the occlusion ghost material (cityGhostMat:
       transparent, depthWrite:false, renderOrder 0), the P6 cornea
       caps, the P8 covert tint and the neck sheen shell. They
       never write depth, so they cannot hide or punch through a
       ghosted building behind them, and they never touch the city
       mesh, its geometry groups or cityGhostMat:
       applyOcclGroups() / updateOcclusion() are unchanged. Being
       a ShaderMaterial outside morphMatsFor, the shells are also
       not reached by C2's env traverse or the P5 / P7 sharing. */
    const P9_OFFSETS=[0.001, 0.002];
    const P9_PEAK_ALPHA=[0.16, 0.08];
    const P9_RENDER_ORDER=1;
    function makeFringeMat(peak){
      return new THREE.ShaderMaterial({
        uniforms:{ uPeak:{value:peak}, uTint:{value:new THREE.Color(0x9aa0a6)} },
        vertexShader:[
          'varying vec3 vN; varying vec3 vV;',
          'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0);',
          ' vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);',
          ' gl_Position=projectionMatrix*mv; }'
        ].join('\n'),
        fragmentShader:[
          'uniform float uPeak; uniform vec3 uTint;',
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          ' vec3 N=normalize(vN); vec3 V=normalize(vV);',
          ' float ndv=clamp(dot(N,V),0.0,1.0);',
          ' float fres=pow(1.0-ndv,2.0);',
          ' gl_FragColor=vec4(uTint, fres*uPeak);',
          '}'
        ].join('\n'),
        transparent:true, depthWrite:false
      });
    }
    const SHARED_FRINGE_MAT_1=makeFringeMat(P9_PEAK_ALPHA[0]);
    const SHARED_FRINGE_MAT_2=makeFringeMat(P9_PEAK_ALPHA[1]);

    /* ---- B3 (Issue #7): shared pigeon materials ----
       Previously every bird allocated its own copy of every material
       below. Materials whose parameters are identical for all birds are
       now single module-level instances, and materials whose colour is
       fixed by the morph are cached per morph (at most MORPHS.length
       entries, plus a Lo/Hi pair for the textures the close LOD swaps).
       Textures were already shared and are untouched.
       The neck is deliberately NOT shared: neckTex.offset.x,
       neck.material.emissiveIntensity and neckSheenMat.uniforms.uShift
       are rewritten per bird per frame in animate(), so sharing them
       would make birds fight over one instance and break the
       iridescence. neckMat / neckSheenMat / neckTex stay per bird.
       Body / breast / head / wing / tail were previously mutated per
       bird only by setCloseLOD (map swap). With shared instances that
       mutation would leak to every bird of the morph, so setCloseLOD
       now swaps mesh.material between the Lo and Hi shared variants
       instead of mutating a shared material. The rendered result —
       same colours, same textures, same LOD thresholds — is unchanged. */
    /* P6 (Issue #21): beak colour goes grey-black like the real bird
       (0x8a7f70 → 0x3a383d) and the cere goes powdery (roughness
       0.7 → 0.9, colour unchanged). */
    const SHARED_BEAK_MAT=new THREE.MeshStandardMaterial({color:0x3a383d, roughness:0.55});
    const SHARED_CERE_MAT=new THREE.MeshStandardMaterial({color:0xe9e2d2, roughness:0.9});
    const SHARED_TWIG_MAT=new THREE.MeshStandardMaterial({color:0x6a5136, roughness:1});
    const SHARED_EYE_MAT=new THREE.MeshBasicMaterial({color:0xd8541e});
    const SHARED_PUPIL_MAT=new THREE.MeshBasicMaterial({color:0x14100c});
    const SHARED_RING_MAT=new THREE.MeshBasicMaterial({color:0xd8cfc0});
    const SHARED_BAR_MAT=new THREE.MeshStandardMaterial({color:0x101116, roughness:0.9});
    const SHARED_LEG_MAT=new THREE.MeshBasicMaterial({color:0xea0d0d});
    /* P6 (Issue #21): Hi beak keeps the slightly-darker-than-Lo
       relationship (0x776c5c → 0x2f2e33); Hi cere roughness
       0.65 → 0.85, colour unchanged. The iris drops its flat 0xe05a1a
       tint for the procedural irisTex gradient map (colour white,
       roughness unchanged) — close-LOD eyeball only, the basic eye
       (SHARED_EYE_MAT) is untouched. The cornea cap material is new:
       a transparent Physical shell whose highlight comes only from
       the environment map + clearcoat, kept subtle (opacity 0.25). */
    const SHARED_BEAK_HI_MAT=new THREE.MeshStandardMaterial({color:0x2f2e33, roughness:0.45});
    const SHARED_CERE_HI_MAT=new THREE.MeshStandardMaterial({color:0xefe7d6, roughness:0.85});
    const SHARED_IRIS_MAT=new THREE.MeshStandardMaterial({color:0xffffff, map:irisTex, roughness:0.25});
    const SHARED_CORNEA_MAT=new THREE.MeshPhysicalMaterial({color:0xffffff, transparent:true, opacity:0.25, roughness:0.06, metalness:0, clearcoat:1.0, clearcoatRoughness:0.1, envMapIntensity:0.3, depthWrite:false, side:THREE.FrontSide});
    /* P6 (Issue #21): one shared cornea-cap sphere, slightly larger
       than the 0.0155 eyeball, same 20x14 segmentation. */
    const corneaGeo=new THREE.SphereGeometry(0.0168,20,14);
    const SHARED_PUPIL_HI_MAT=new THREE.MeshStandardMaterial({color:0x0d0a08, roughness:0.2});
    const SHARED_RING_HI_MAT=new THREE.MeshStandardMaterial({color:0xd9d0bf, roughness:0.6});
    const SHARED_TOE_MAT=new THREE.MeshStandardMaterial({color:0xe80d0d, roughness:0.35, emissive:0x7a0404, emissiveIntensity:0.85});
    const SHARED_CLAW_MAT=new THREE.MeshStandardMaterial({color:0x3a3430, roughness:0.4});
    /* P4 (Issue #13): underwing flash panels share one material (and
       the one underwingTex above); the close-LOD tail fan's white
       outer-edge strips share one material too. */
    const SHARED_UNDERWING_MAT=new THREE.MeshStandardMaterial({map:underwingTex, roughness:0.95, side:THREE.DoubleSide});
    const SHARED_TAIL_EDGE_MAT=new THREE.MeshStandardMaterial({color:0xf6f6f2, roughness:0.95, side:THREE.DoubleSide});
    const _morphMatCache=new Array(MORPHS.length*P7_VARIANTS.length).fill(null); // P7 (Issue #22): per morph x variant
    /* P5 (Issue #12): bumpMap reuses each material's own map instance
       (no new textures) and every feathered material shares the one
       featherRoughTex above as roughnessMap; the scalar roughness
       values are unchanged. bumpScale is per region because r128 bump
       mapping is screen-space derivative based — the stronger the
       luminance gradient in texture space, the harder it bites. Body
       scallops are soft gradients, so 0.04; wing barbs are thin,
       high-gradient lines, so 0.02; tail sits between at 0.03. The aim
       is feather overlap reading as shading at close range without
       deforming the silhouette. Hi bumpMaps reference the same texture
       instance as map, so they ride the B6 placeholder → real-canvas
       swap in ensureHiTextures() untouched. */
    const BUMP_BODY=0.04, BUMP_WING=0.02, BUMP_TAIL=0.03;
    /* P7 (Issue #22): r128 shares one vUv across all map slots, so
       adding a uniform offset to vUv.x in the vertex shader shifts
       map / bumpMap / roughnessMap consistently at every LOD. */
    function p7ShiftUV(mat, uOff){ mat.onBeforeCompile=shader=>{ shader.uniforms.uP7Off={value:uOff}; shader.vertexShader=('uniform float uP7Off;\n'+shader.vertexShader).replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vUv.x+=uP7Off;\n#endif'); }; mat.customProgramCacheKey=()=>'p7uv'; return mat; }
    function morphMatsFor(morph, variant){
      const v=(variant===undefined||variant===null)?0:variant;
      const idx=MORPHS.indexOf(morph);
      const cacheKey=idx*P7_VARIANTS.length+v;
      if(_morphMatCache[cacheKey]) return _morphMatCache[cacheKey];
      const bc=morph.body;
      const jf=P7_VARIANTS[v].jitter, uOff=P7_VARIANTS[v].uOff;
      const entry={
        bodyLo:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(jf), map:bodyTex, bumpMap:bodyTex, bumpScale:BUMP_BODY, roughnessMap:featherRoughTex, roughness:0.92, metalness:0.02}),
        bodyHi:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(jf), map:bodyTexHi, bumpMap:bodyTexHi, bumpScale:BUMP_BODY, roughnessMap:featherRoughTex, roughness:0.92, metalness:0.02}),
        breastLo:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(jf), map:bodyTex, bumpMap:bodyTex, bumpScale:BUMP_BODY, roughnessMap:featherRoughTex, roughness:0.85}),
        breastHi:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(jf), map:bodyTexHi, bumpMap:bodyTexHi, bumpScale:BUMP_BODY, roughnessMap:featherRoughTex, roughness:0.85}),
        headLo:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.78*jf), map:bodyTex, bumpMap:bodyTex, bumpScale:BUMP_BODY, roughnessMap:featherRoughTex, roughness:0.9}),
        headHi:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.78*jf), map:bodyTexHi, bumpMap:bodyTexHi, bumpScale:BUMP_BODY, roughnessMap:featherRoughTex, roughness:0.9}),
        wingLo:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.78*jf), map:wingTextureFor(morph), bumpMap:wingTextureFor(morph), bumpScale:BUMP_WING, roughnessMap:featherRoughTex, roughness:0.95, side:THREE.DoubleSide}),
        wingHi:null, // lazy: wingTextureHiFor() builds a 2048px texture, as before only on first close LOD
        tailLo:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.92*jf), map:tailTex, bumpMap:tailTex, bumpScale:BUMP_TAIL, roughnessMap:featherRoughTex, roughness:0.95, side:THREE.DoubleSide}),
        tailHi:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.92*jf), map:tailTexHi, bumpMap:tailTexHi, bumpScale:BUMP_TAIL, roughnessMap:featherRoughTex, roughness:0.95, side:THREE.DoubleSide}),
        rump:new THREE.MeshStandardMaterial({color:new THREE.Color(morph.rump==null?bc:morph.rump).multiplyScalar(jf), roughness:0.9}),
        fan:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.92*jf), map:tailTexHi, bumpMap:tailTexHi, bumpScale:BUMP_TAIL, roughnessMap:featherRoughTex, roughness:0.95, side:THREE.DoubleSide}),
        /* P2 (Issue #20): far-LOD materials — posterised wing/tail
           textures and flat darkened head/neck/trunk so a distant
           bird keeps its pattern and value structure. */
        wingFar:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.78*jf), map:wingTextureFarFor(morph), bumpMap:wingTextureFarFor(morph), bumpScale:BUMP_WING, roughnessMap:featherRoughTex, roughness:0.95, side:THREE.DoubleSide}),
        tailFar:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.92*jf), map:tailTexFar, bumpMap:tailTexFar, bumpScale:BUMP_TAIL, roughnessMap:featherRoughTex, roughness:0.95, side:THREE.DoubleSide}),
        headFar:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.62*jf), roughness:0.9}),
        neckFar:new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.62*jf), roughness:0.9}),
        trunkFar:new THREE.MeshStandardMaterial({color:new THREE.Color(jf,jf,jf), vertexColors:true, map:bodyTex, bumpMap:bodyTex, bumpScale:BUMP_BODY, roughnessMap:featherRoughTex, roughness:0.92, metalness:0.02})
      };
      // P7 (Issue #22): shift UVs on every mapped slot for offset variants (mapless rump/headFar/neckFar excluded).
      if(uOff!==0){ for(const k of ['bodyLo','bodyHi','breastLo','breastHi','headLo','headHi','wingLo','tailLo','tailHi','fan','wingFar','tailFar','trunkFar']){ if(entry[k]) p7ShiftUV(entry[k], uOff); } }
      // C2 (Issue #16): pigeon Standard materials take envMapIntensity 0.3.
      // Set at creation so lazily built Hi-LOD materials are covered too
      // (tuneEnvIntensity only reaches materials attached at first env apply).
      for(const k in entry){ const m=entry[k]; if(m) m.envMapIntensity=0.3; }
      _morphMatCache[cacheKey]=entry;
      return entry;
    }
    function morphWingHiMat(morph, variant){
      const v=(variant===undefined||variant===null)?0:variant;
      const entry=morphMatsFor(morph, v);
      if(!entry.wingHi){
        const bc=morph.body;
        const jf=P7_VARIANTS[v].jitter, uOff=P7_VARIANTS[v].uOff;
        // P5 (Issue #12): same-instance bumpMap + shared roughnessMap, as in morphMatsFor above.
        entry.wingHi=new THREE.MeshStandardMaterial({color:new THREE.Color(bc).multiplyScalar(0.78*jf), map:wingTextureHiFor(morph), bumpMap:wingTextureHiFor(morph), bumpScale:BUMP_WING, roughnessMap:featherRoughTex, roughness:0.95, side:THREE.DoubleSide});
        if(uOff!==0) p7ShiftUV(entry.wingHi, uOff); // P7 (Issue #22)
        entry.wingHi.envMapIntensity=0.3; // C2 (Issue #16): created lazily, may postdate tuneEnvIntensity
      }
      return entry.wingHi;
    }

    /* ---- P2 (Issue #20): far-LOD merged geometry ----
       At distance the body+breast+rump spheres, the neck+breastPatch
       pair and the head collapse into one low-segment merged mesh
       each (vertex colours carry the body/rump split on the trunk;
       the neck material is flat, so its colours are unused). Segment
       counts are far below the near geometry (body 20x15, neck 18x14,
       head 14x11) — that is the triangle saving the far LOD exists
       for. farLodCounts records (index-count or, when unindexed,
       position-count)/3 per spec. */
    const farLodCounts={trunkTris:0, neckTris:0, headTris:0};
    function mergeFarParts(parts){
      const geos=[]; let total=0;
      for(const part of parts){
        let geo=new THREE.SphereGeometry(part.radius, part.w, part.h);
        geo.applyMatrix4(part.matrix);
        geo=geo.toNonIndexed();
        const n=geo.attributes.position.count;
        const col=new Float32Array(n*3);
        for(let i=0;i<n;i++){ col[i*3]=part.color.r; col[i*3+1]=part.color.g; col[i*3+2]=part.color.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(col,3));
        geos.push(geo); total+=n;
      }
      const pos=new Float32Array(total*3), nor=new Float32Array(total*3),
        uv=new Float32Array(total*2), colArr=new Float32Array(total*3);
      let vo=0;
      for(const geo of geos){
        pos.set(geo.attributes.position.array, vo*3);
        nor.set(geo.attributes.normal.array, vo*3);
        uv.set(geo.attributes.uv.array, vo*2);
        colArr.set(geo.attributes.color.array, vo*3);
        vo+=geo.attributes.position.count;
      }
      const merged=new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos,3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor,3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uv,2));
      merged.setAttribute('color', new THREE.BufferAttribute(colArr,3));
      return merged;
    }
    const _farTrunkGeoCache=new Array(MORPHS.length).fill(null);
    function farTrunkGeoFor(morph){
      const idx=MORPHS.indexOf(morph);
      if(_farTrunkGeoCache[idx]) return _farTrunkGeoCache[idx];
      const mtx=(px,py,pz,sx,sy,sz)=>new THREE.Matrix4().compose(
        new THREE.Vector3(px,py,pz), new THREE.Quaternion(), new THREE.Vector3(sx,sy,sz));
      const geo=mergeFarParts([
        {radius:0.16, w:13, h:10, matrix:new THREE.Matrix4().makeScale(1,0.86,1.38), color:new THREE.Color(morph.body)},
        {radius:0.16, w:12, h:9, matrix:mtx(0,-0.012,0.075, 0.82,0.78,0.8), color:new THREE.Color(morph.body)},
        {radius:0.105, w:10, h:7, matrix:mtx(0,0.018,-0.115, 0.92,0.72,0.9),
          color:new THREE.Color((morph.rump===null||morph.rump===undefined)?morph.body:morph.rump)}
      ]);
      if(!farLodCounts.trunkTris) farLodCounts.trunkTris=(geo.index?geo.index.count:geo.attributes.position.count)/3;
      _farTrunkGeoCache[idx]=geo;
      return geo;
    }
    const farNeckGeo=(()=>{
      const geo=mergeFarParts([
        {radius:0.105, w:12, h:9, matrix:new THREE.Matrix4(), color:new THREE.Color(0xffffff)},
        {radius:0.112, w:12, h:9, matrix:new THREE.Matrix4().compose(
          new THREE.Vector3(0,-0.074,0.01), new THREE.Quaternion(), new THREE.Vector3(0.94,1.14,0.84)),
          color:new THREE.Color(0xffffff)}
      ]);
      farLodCounts.neckTris=(geo.index?geo.index.count:geo.attributes.position.count)/3;
      return geo;
    })();
    const farHeadGeo=(()=>{
      const geo=new THREE.SphereGeometry(0.056, 11, 8);
      farLodCounts.headTris=(geo.index?geo.index.count:geo.attributes.position.count)/3;
      return geo;
    })();

    function makePigeonMesh(pi){
      const g=new THREE.Group();
      g.userData.pigeonIdx=pi; // tap-to-select raycast target
      const bodyG=new THREE.Group(); g.add(bodyG);
      const morph=MORPH_OF_BIRD[pi%MORPH_OF_BIRD.length];
      const bc=morph.body;
      const mm=morphMatsFor(morph, BIRD_VARIANT[pi%BIRD_VARIANT.length]);
      const mat=mm.bodyLo;
      const body=new THREE.Mesh(bodyGeo, mat); body.scale.set(1,0.86,1.38); body.castShadow=true; bodyG.add(body);
      const breast=new THREE.Mesh(bodyGeo, mm.breastLo);
      breast.scale.set(0.82,0.78,0.8); breast.position.set(0,-0.012,0.075); bodyG.add(breast);
      // rump patch (pale on wild type) just before the tail
      const rump=new THREE.Mesh(new THREE.SphereGeometry(0.105,12,9), mm.rump);
      rump.scale.set(0.92,0.72,0.9); rump.position.set(0,0.018,-0.115); bodyG.add(rump);
      /* neck + breast: gradient iridescent texture (per-bird instance so
         the azimuth offset can rotate independently) under a fresnel
         sheen shell. The patch is enlarged (neck r 0.088 → 0.105,
         breast r 0.095 → 0.112) so the structural colour covers the
         whole throat-to-breast sweep and reads at 2–3 m, not only in
         close-up. */
      const neckTex=new THREE.CanvasTexture(neckCanvas);
      neckTex.wrapS=THREE.RepeatWrapping; neckTex.encoding=THREE.sRGBEncoding; neckTex.anisotropy=8;
      /* P5 (Issue #12): neckTex doubles as its own bumpMap (same
         instance). neckTex.offset.x is rewritten per bird per frame,
         but the bundled three.js r128 shares a single vUv driven by
         the map slot's transform across all texture slots, so the
         bump follows the iridescence shift automatically. No
         roughnessMap here: the 0.24 / 0.38 gloss stays as-is. */
      /* P6 (Issue #21): neckMat is promoted to MeshPhysicalMaterial
         with parameters identical to before (no sheen / clearcoat
         values added — defaults). The Physical upgrade is scoped to
         the eye (cornea cap above) and neck only; body / wing / tail
         / head feather materials stay Standard. neckTex and the
         fresnel sheen shell are unchanged, and the per-frame
         emissiveIntensity / uShift writes work as before. */
      const neckMat=new THREE.MeshPhysicalMaterial({map:neckTex, bumpMap:neckTex, bumpScale:0.03, roughness:0.24, metalness:0.38,
          emissive:0xffffff, emissiveMap:neckTex, emissiveIntensity:0.5});
      const neckSheenMat=makeNeckSheenMat();
      /* P7 (Issue #22): neck iridescence class for this bird. */
      const ncls=NECK_CLASSES[BIRD_NECK_CLASS[pi%BIRD_NECK_CLASS.length]];
      if(ncls.sheen!==1){ neckSheenMat.uniforms.uA.value.multiplyScalar(ncls.sheen); neckSheenMat.uniforms.uB.value.multiplyScalar(ncls.sheen); neckSheenMat.uniforms.uHi.value.multiplyScalar(ncls.sheen); }
      if(ncls.tint) neckMat.color.setHex(ncls.tint);
      const neck=new THREE.Mesh(new THREE.SphereGeometry(0.105,18,14), neckMat);
      neck.scale.set(1.0,1.18,1.0); neck.position.set(0,0.04,0.12); bodyG.add(neck);
      const neckSheen=new THREE.Mesh(new THREE.SphereGeometry(0.1095,20,14), neckSheenMat);
      neck.add(neckSheen);
      const breastPatch=new THREE.Mesh(new THREE.SphereGeometry(0.112,16,12), neckMat);
      breastPatch.scale.set(0.94,1.14,0.84); breastPatch.position.set(0,-0.034,0.13); bodyG.add(breastPatch);
      const breastSheen=new THREE.Mesh(new THREE.SphereGeometry(0.1165,18,12), neckSheenMat);
      breastPatch.add(breastSheen);
      const headG=new THREE.Group(); headG.position.set(0,0.085,0.155); bodyG.add(headG);
      const headMat=mm.headLo;
      const head=new THREE.Mesh(headGeo, headMat); head.castShadow=true; headG.add(head);
      const beak=new THREE.Mesh(beakGeo, SHARED_BEAK_MAT);
      beak.rotation.x=Math.PI/2; beak.position.set(0,-0.004,0.08); headG.add(beak);
      const cere=new THREE.Mesh(new THREE.SphereGeometry(0.013,8,6), SHARED_CERE_MAT);
      cere.scale.set(1.15,0.6,1); cere.position.set(0,0.008,0.052); headG.add(cere); // fleshy cere at beak base
      // nest material (twig) carried in the beak during the breeding season
      const twig=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.009,0.17,5), SHARED_TWIG_MAT);
      twig.rotation.x=Math.PI/2.3; twig.position.set(0,-0.014,0.13); twig.visible=false; headG.add(twig);
      const eyeMat=SHARED_EYE_MAT;
      const pupilMat=SHARED_PUPIL_MAT;
      const ringMat=SHARED_RING_MAT;
      const basicHeadParts=[beak, cere];
      for(const s of [-1,1]){
        const ring=new THREE.Mesh(new THREE.SphereGeometry(0.018,8,6), ringMat);
        ring.position.set(0.048*s,0.014,0.018); ring.scale.set(0.4,1,1); headG.add(ring); // pale eye ring
        const eye=new THREE.Mesh(new THREE.SphereGeometry(0.0145,8,6), eyeMat);
        eye.position.set(0.0495*s,0.014,0.018); headG.add(eye);
        const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.0072,6,5), pupilMat);
        pupil.position.set(0.0555*s,0.014,0.02); headG.add(pupil);
        basicHeadParts.push(ring, eye, pupil);
      }
      const wingMat=mm.wingLo;
      const wingLP=new THREE.Group(); wingLP.position.set(0.05,0.045,0.015); bodyG.add(wingLP);
      const wingL=new THREE.Mesh(wingInnerGeo, wingMat); wingL.castShadow=true; wingLP.add(wingL);
      const wingRP=new THREE.Group(); wingRP.position.set(-0.05,0.045,0.015); bodyG.add(wingRP);
      const wingR=new THREE.Mesh(wingInnerGeo, wingMat); wingR.scale.x=-1; wingR.castShadow=true; wingRP.add(wingR);
      /* P3 (Issue #24): outer wing on a wrist pivot (group at the
         wrist, mesh geometry re-based to the wrist), so animate()
         can add the phase-lagged bend and the reversal twist on top
         of the root pivot's flap. The right pivot sits at -wrist and
         its mesh keeps the usual scale.x=-1 mirror. */
      const wingOLP=new THREE.Group(); wingOLP.position.set(P3_WRIST_X,0,0); wingLP.add(wingOLP);
      const wingOL=new THREE.Mesh(wingOuterGeo, wingMat); wingOL.castShadow=true; wingOLP.add(wingOL);
      const wingORP=new THREE.Group(); wingORP.position.set(-P3_WRIST_X,0,0); wingRP.add(wingORP);
      const wingOR=new THREE.Mesh(wingOuterGeo, wingMat); wingOR.scale.x=-1; wingOR.castShadow=true; wingORP.add(wingOR);
      /* P3 (Issue #24): far-LOD full wings -- the P2 far LOD keeps
         the pre-P3 single-mesh wing (whole wingGeo, wingFar
         material); the split wing and the primary cards are never
         applied to far birds. Hidden until setFarLOD / animate()
         show them in the far state. */
      const wingFullL=new THREE.Mesh(wingGeo, wingMat); wingFullL.castShadow=true; wingFullL.visible=false; wingLP.add(wingFullL);
      const wingFullR=new THREE.Mesh(wingGeo, wingMat); wingFullR.scale.x=-1; wingFullR.castShadow=true; wingFullR.visible=false; wingRP.add(wingFullR);
      /* P3 (Issue #24): primary flight-feather cards, 5 per wing,
         children of the outer-wing meshes so they inherit the wrist
         lag and twist. They share the wing material, so the LOD
         material swaps carry them along and no texture or program
         is added. Hidden until animate() shows them for near /
         mid-range flying birds outside a collective escape. */
      const primL=[], primR=[];
      for(let k=0;k<P3_PRIM_ROOTS.length;k++){
        const pl=new THREE.Mesh(primGeo, wingMat);
        pl.position.set(P3_PRIM_ROOTS[k][0]-P3_WRIST_X, -0.0015, P3_PRIM_ROOTS[k][1]);
        pl.scale.x=P3_PRIM_LENGTHS[k]; pl.castShadow=false; pl.visible=false; pl.rotation.y=P3_PRIM_CLOSED[k];
        wingOL.add(pl); primL.push(pl);
        const pr=new THREE.Mesh(primGeo, wingMat);
        pr.position.copy(pl.position); pr.scale.x=P3_PRIM_LENGTHS[k]; pr.castShadow=false; pr.visible=false; pr.rotation.y=P3_PRIM_CLOSED[k];
        wingOR.add(pr); primR.push(pr);
      }
      /* P4 (Issue #13): underwing flash panels, 3mm below each wing
         plane, sharing the wing silhouette and the one underwing
         material. Hidden by default; animate() shows them only while
         the bird is flying with its wings unfolded. */
      const underL=new THREE.Mesh(wingGeo, SHARED_UNDERWING_MAT);
      underL.position.y=-0.003; underL.castShadow=false; underL.visible=false; wingLP.add(underL);
      const underR=new THREE.Mesh(wingGeo, SHARED_UNDERWING_MAT);
      underR.scale.x=-1; underR.position.y=-0.003; underR.castShadow=false; underR.visible=false; wingRP.add(underR);
      // folded-wing panels lying over the back (where a perched pigeon's
      // barred wings actually show); swapped in when the wings are folded
      const foldL=new THREE.Mesh(wingGeo, wingMat);
      foldL.position.set(0.028,0.108,0.045); foldL.rotation.y=1.32; foldL.scale.setScalar(0.92);
      bodyG.add(foldL);
      const foldR=new THREE.Mesh(wingGeo, wingMat);
      foldR.position.set(-0.028,0.108,0.045); foldR.rotation.y=-1.32; foldR.scale.set(-0.92,0.92,0.92);
      bodyG.add(foldR);
      /* P8 (Issue #23): covert fresnel tint shells over the folded
         panels (SHARED_COVERT_TINT_MAT above), 2.5 mm above the
         panel surface and below the raised wing bars (3.5 mm).
         Hidden until setCloseLOD turns them on. */
      const covertTintL=new THREE.Mesh(wingGeo, SHARED_COVERT_TINT_MAT);
      covertTintL.position.y=0.0025; covertTintL.castShadow=false; covertTintL.visible=false; foldL.add(covertTintL);
      const covertTintR=new THREE.Mesh(wingGeo, SHARED_COVERT_TINT_MAT);
      covertTintR.position.y=0.0025; covertTintR.castShadow=false; covertTintR.visible=false; foldR.add(covertTintR);
      /* P9 (Issue #27): fringe shells, two per volumetric host
         (body r 0.16 / neck r 0.105 / head r 0.056), each shell
         scaled per axis by 1 + offset / (hostRadius x hostScale)
         so the surface offset is the P9_OFFSETS value itself. The shell reuses the host's
         geometry instance -- no new geometry. Hidden until
         setCloseLOD turns them on. */
      const fringe=[];
      for(const [host, hr, hs] of [[body, 0.16, [1, 0.86, 1.38]], [neck, 0.105, [1, 1.18, 1]], [head, 0.056, [1, 1, 1]]]){
        for(let li=0; li<P9_OFFSETS.length; li++){
          const sh=new THREE.Mesh(host.geometry, li===0?SHARED_FRINGE_MAT_1:SHARED_FRINGE_MAT_2);
          /* per-axis scale compensates the host's anisotropic
             scale, so the surface offset is P9_OFFSETS[li] itself
             on every axis, not offset x host-scale. */
          sh.scale.set(1+P9_OFFSETS[li]/(hr*hs[0]), 1+P9_OFFSETS[li]/(hr*hs[1]), 1+P9_OFFSETS[li]/(hr*hs[2]));
          sh.castShadow=false; sh.visible=false; sh.renderOrder=P9_RENDER_ORDER;
          host.add(sh); fringe.push(sh);
        }
      }
      const tailG=new THREE.Group(); tailG.position.set(0,0.008,-0.15); bodyG.add(tailG);
      const tailMat=mm.tailLo;
      const tail=new THREE.Mesh(tailGeo, tailMat);
      tailG.add(tail);
      /* twin wing bars as thin raised geometry over the texture bars, so
         the bars read by silhouette/shading as well as by print (both the
         flying wing and the folded back panels carry them) */
      const barMeshes=[];
      if(morph.barsGeo){
        const barMat=SHARED_BAR_MAT;
        const barGeos=[new THREE.BoxGeometry(0.036,0.0035,0.175), new THREE.BoxGeometry(0.031,0.0035,0.175)];
        for(const host of [wingL, wingR, foldL, foldR]){
          const b1=new THREE.Mesh(barGeos[0], barMat); b1.position.set(0.184,0.0035,0); host.add(b1); barMeshes.push(b1);
          const b2=new THREE.Mesh(barGeos[1], barMat); b2.position.set(0.246,0.0035,0); host.add(b2); barMeshes.push(b2);
        }
        /* P3 (Issue #24): on the flying wings the outer bar (centre
           x=0.246) lies past the wrist, so the b2 copies just added
           to wingL / wingR (barMeshes[0..3] when barsGeo is on) are
           re-parented to the outer-wing meshes at wrist-local x, so
           the bar bends with the outer wing. The folded panels keep
           their whole-wing bars as before. */
        if(morph.barsGeo){
          const obL=barMeshes[1], obR=barMeshes[3];
          wingOL.add(obL); obL.position.set(0.246-P3_WRIST_X,0.0035,0);
          wingOR.add(obR); obR.position.set(0.246-P3_WRIST_X,0.0035,0);
        }
      }
      /* scarlet legs + feet: pure vivid red with almost no green
         channel (0xea0d0d — the old 0xe03324 carried enough green to
         read orange), thick tarsus, wider stance (x ±0.036 → ±0.042)
         so the two legs separate visually from the side. Leg centre
         y −0.155 / ankle −0.245 are matched by the per-frame leg
         animation; feet land on the ground at BODY_Y = 0.42. */
      const legMat=SHARED_LEG_MAT;
      const legs=[];
      for(const s of [-1,1]){
        const leg=new THREE.Mesh(legGeo, legMat); leg.position.set(0.042*s,-0.155,0.005); bodyG.add(leg); legs.push(leg);
        const foot=new THREE.Mesh(footGeo, legMat); foot.position.copy(leg.position); bodyG.add(foot); legs.push(foot);
        const ankle=new THREE.Mesh(new THREE.SphereGeometry(0.021,9,7), legMat);
        ankle.position.set(0.042*s,-0.245,0.005); bodyG.add(ankle); legs.push(ankle);
      }
      /* ---- close-range LOD (至近LOD) ----
         Built once per bird, visible only when the camera is within ~3 m
         (or the bird fills >25% of the frame height). Discrimination is
         carried by geometry, not texture: separate beak + cere, eyeballs
         with iris/pupil and a raised eye ring, jointed toes with claws
         (3 forward + 1 back), and a tail of 12 separate rectrices. */
      const closeHead=new THREE.Group(); closeHead.visible=false; headG.add(closeHead);
      {
        const beakMatHi=SHARED_BEAK_HI_MAT;
        const upper=new THREE.Mesh(new THREE.ConeGeometry(0.017,0.07,12), beakMatHi);
        upper.rotation.x=Math.PI/2-0.1; upper.position.set(0,-0.002,0.082); closeHead.add(upper);
        const lower=new THREE.Mesh(new THREE.ConeGeometry(0.011,0.05,10), beakMatHi);
        lower.rotation.x=Math.PI/2+0.06; lower.position.set(0,-0.013,0.07); closeHead.add(lower);
        const cereHi=new THREE.Mesh(new THREE.SphereGeometry(0.0145,12,9), SHARED_CERE_HI_MAT);
        cereHi.scale.set(1.25,0.62,1.05); cereHi.position.set(0,0.009,0.053); closeHead.add(cereHi);
        for(const s of [-1,1]){ // nostril bumps on the cere
          const nos=new THREE.Mesh(new THREE.SphereGeometry(0.0045,8,6), cereHi.material);
          nos.position.set(0.007*s,0.013,0.058); closeHead.add(nos);
        }
        const irisMat=SHARED_IRIS_MAT;
        const pupilMatHi=SHARED_PUPIL_HI_MAT;
        const ringMatHi=SHARED_RING_HI_MAT;
        for(const s of [-1,1]){
          const ball=new THREE.Mesh(new THREE.SphereGeometry(0.0155,20,14), irisMat);
          ball.position.set(0.0495*s,0.014,0.018); closeHead.add(ball);
          /* P6 (Issue #21): transparent cornea cap at the same
             position as the eyeball — closeHead only, so it shows
             solely in the close LOD. */
          const cap=new THREE.Mesh(corneaGeo, SHARED_CORNEA_MAT);
          cap.position.copy(ball.position); closeHead.add(cap);
          const pup=new THREE.Mesh(new THREE.SphereGeometry(0.0078,12,9), pupilMatHi);
          pup.position.set(0.0585*s,0.014,0.021); closeHead.add(pup);
          const ringHi=new THREE.Mesh(new THREE.TorusGeometry(0.0165,0.0038,8,20), ringMatHi);
          ringHi.rotation.y=Math.PI/2; ringHi.position.set(0.0495*s,0.014,0.018); closeHead.add(ringHi);
        }
      }
      const closeBody=new THREE.Group(); closeBody.visible=false; bodyG.add(closeBody);
      const closeFeet=[];
      {
        /* toes thickened ~1.5x and the same vivid red as the basic feet,
           so the close-LOD foot (the one actually seen at 2–3 m) is as
           legible as the basic one; foot groups are kept in closeFeet
           so the per-frame step animation can move them too */
        const toeMat=SHARED_TOE_MAT;
        const clawMat=SHARED_CLAW_MAT;
        const segGeo=new THREE.CylinderGeometry(0.0075,0.0062,0.042,7); segGeo.rotateX(Math.PI/2); segGeo.translate(0,0,0.021);
        const seg2Geo=new THREE.CylinderGeometry(0.0062,0.0046,0.032,7); seg2Geo.rotateX(Math.PI/2-0.35); seg2Geo.translate(0,-0.0045,0.015);
        const clawGeo=new THREE.ConeGeometry(0.0042,0.019,6); clawGeo.rotateX(Math.PI/2+0.5); clawGeo.translate(0,-0.005,0.009);
        const jointGeo=new THREE.SphereGeometry(0.008,8,6);
        for(const s of [-1,1]){
          const footG=new THREE.Group(); footG.position.set(0.042*s,-0.25,0.005); closeBody.add(footG); closeFeet.push(footG);
          const toeDefs=[[-0.55,1],[0,1.08],[0.55,1],[-2.85,0.72]]; // 3 forward + 1 back
          for(const [ang,lenK] of toeDefs){
            const toe=new THREE.Group(); toe.rotation.y=ang; footG.add(toe);
            const s1=new THREE.Mesh(segGeo, toeMat); s1.scale.z=lenK; toe.add(s1);
            const jt=new THREE.Mesh(jointGeo, toeMat); jt.position.z=0.042*lenK; toe.add(jt);
            const s2=new THREE.Group(); s2.position.z=0.042*lenK; s2.add(new THREE.Mesh(seg2Geo, toeMat)); toe.add(s2);
            const cl=new THREE.Mesh(clawGeo, clawMat); cl.position.set(0,-0.007,0.042*lenK+0.024); toe.add(cl);
          }
        }
      }
      const tailFan=new THREE.Group(); tailFan.visible=false; tailG.add(tailFan);
      {
        const fanMat=mm.fan;
        const fGeo=new THREE.PlaneGeometry(0.021,0.2); fGeo.translate(0,0.1,0); fGeo.rotateX(-Math.PI/2);
        for(let k=0;k<12;k++){
          const pivot=new THREE.Group();
          pivot.rotation.y=(k-5.5)*0.052;
          const f=new THREE.Mesh(fGeo, fanMat); pivot.add(f); tailFan.add(pivot);
          /* P4 (Issue #13): white edge strips on the fan's outer rim
             only — the outermost rectrix pivots (k=0 and k=11). */
          if(k===0||k===11){
            const edge=new THREE.Mesh(tailEdgeGeo, SHARED_TAIL_EDGE_MAT);
            edge.position.x=(k===0)?0.0135:-0.0135;
            pivot.add(edge);
          }
        }
      }
      /* P2 (Issue #20): far-LOD merged meshes, hidden until
         setFarLOD swaps them in for the multi-part near assembly. */
      const farTrunk=new THREE.Mesh(farTrunkGeoFor(morph), mm.trunkFar);
      farTrunk.castShadow=true; farTrunk.visible=false; bodyG.add(farTrunk);
      const farNeck=new THREE.Mesh(farNeckGeo, mm.neckFar);
      farNeck.position.set(0,0.04,0.12); farNeck.scale.set(1.0,1.18,1.0); farNeck.visible=false; bodyG.add(farNeck);
      const farHead=new THREE.Mesh(farHeadGeo, mm.headFar);
      farHead.castShadow=true; farHead.visible=false; headG.add(farHead);
      // "noticed!" marker, shown briefly when the bird spots food / danger
      const exclaim=new THREE.Sprite(new THREE.SpriteMaterial({map:exclaimTex, transparent:true, depthWrite:false}));
      exclaim.scale.setScalar(0.21); exclaim.position.set(0,0.34,0); exclaim.visible=false; g.add(exclaim);
      g.scale.setScalar(DISPLAY_SCALE);
      scene.add(g);
      return {g, bodyG, headG, neck, wingLP, wingRP, tailG, legs, exclaim, foldL, foldR, covertTintL, covertTintR, fringe, wingL, wingR, underL, underR, body, twig,
        basicHeadParts, closeHead, closeBody, tailFan, tail, closeFeet, neckTex, neckSheenMat, breastPatch,
        wingOLP, wingORP, wingOL, wingOR, wingFullL, wingFullR, primL, primR,
        breastMesh:breast, headMesh:head, rump, barMeshes, farTrunk, farNeck, farHead,
        bodyMat:mat, breastMat:breast.material, headMat, wingMat, tailMat,
        variant:BIRD_VARIANT[pi%BIRD_VARIANT.length], neckClass:ncls.name, neckGain:ncls.emissive, neckPhase:hash(pi*57+13)}; // P7 (Issue #22)
    }
    /* toggle the close-range LOD for one bird: geometry detail + hi-res
       textures in, basic parts out. Display scale never changes. */
    function setCloseLOD(p, on){
      if(p.closeLOD===on) return;
      if(on) ensureHiTextures(); // B6: first close-LOD activation generates the 2048px textures
      p.closeLOD=on;
      const m=p.mesh;
      m.closeHead.visible=on; m.closeBody.visible=on; m.tailFan.visible=on;
      m.tail.visible=!on;
      /* P8 (Issue #23): covert tint shells follow the close LOD only. */
      if(m.covertTintL) m.covertTintL.visible=on&&!p.farLOD;
      if(m.covertTintR) m.covertTintR.visible=on&&!p.farLOD;
      /* P9 (Issue #27): fringe shells follow the close LOD only. */
      if(m.fringe) for(const sh of m.fringe) sh.visible=on&&!p.farLOD;
      for(const part of m.basicHeadParts) part.visible=!on;
      // basic feet yield to the jointed toes (per-frame leg logic honours p.closeLOD)
      // B3: materials are shared per morph, so do not mutate .map on the
      // shared instance (that would flip every bird of the morph). Swap
      // each mesh to the shared Lo/Hi variant for this bird's morph —
      // same maps (bodyTex/bodyTexHi, wing lo/hi, tailTex/tailTexHi)
      // and same colours as the old per-bird mutation produced.
      const morph=MORPH_OF_BIRD[p.i%MORPH_OF_BIRD.length];
      const mm=morphMatsFor(morph, BIRD_VARIANT[p.i%BIRD_VARIANT.length]);
      const bodyMat=on?mm.bodyHi:mm.bodyLo;
      const breastMat=on?mm.breastHi:mm.breastLo;
      const headMat=on?mm.headHi:mm.headLo;
      const wingMat=on?morphWingHiMat(morph, BIRD_VARIANT[p.i%BIRD_VARIANT.length]):mm.wingLo;
      const tailMat=on?mm.tailHi:mm.tailLo;
      if(m.body) m.body.material=bodyMat;
      if(m.breastMesh) m.breastMesh.material=breastMat;
      if(m.headMesh) m.headMesh.material=headMat;
      if(m.wingL) m.wingL.material=wingMat;
      if(m.wingR) m.wingR.material=wingMat;
      /* P3 (Issue #24): split / far-full wings and primary cards follow the same swap. */
      if(m.wingOL) m.wingOL.material=wingMat;
      if(m.wingOR) m.wingOR.material=wingMat;
      if(m.wingFullL) m.wingFullL.material=wingMat;
      if(m.wingFullR) m.wingFullR.material=wingMat;
      if(m.primL) for(const pm of m.primL) pm.material=wingMat;
      if(m.primR) for(const pm of m.primR) pm.material=wingMat;
      if(m.foldL) m.foldL.material=wingMat;
      if(m.foldR) m.foldR.material=wingMat;
      if(m.tail) m.tail.material=tailMat;
      m.bodyMat=bodyMat; m.breastMat=breastMat; m.headMat=headMat; m.wingMat=wingMat; m.tailMat=tailMat;
    }
    /* P2 (Issue #20): far LOD — swap the multi-part near assembly
       (body/breast/rump, iridescent neck + breast patch, head + basic
       head parts, raised wing bars) for the merged far meshes, and
       the wing/tail materials for their posterised far variants.
       underL/underR, tail visibility, closeHead/closeBody/tailFan
       are owned by flight state / close LOD and are not touched. */
    function setFarLOD(p, on){
      if(p.farLOD===on) return;
      p.farLOD=on;
      const m=p.mesh;
      m.farTrunk.visible=on; m.farNeck.visible=on; m.farHead.visible=on;
      m.body.visible=!on; m.breastMesh.visible=!on; m.rump.visible=!on;
      m.neck.visible=!on; m.breastPatch.visible=!on; m.headMesh.visible=!on;
      for(const part of m.basicHeadParts) part.visible=on?false:!p.closeLOD;
      for(const b of m.barMeshes) b.visible=!on;
      /* P8 (Issue #23): the far LOD never shows the covert tint. */
      if(on){ if(m.covertTintL) m.covertTintL.visible=false; if(m.covertTintR) m.covertTintR.visible=false; }
      /* P9 (Issue #27): the far LOD never shows the fringe. */
      if(on && m.fringe) for(const sh of m.fringe) sh.visible=false;
      const morph=MORPH_OF_BIRD[p.i%MORPH_OF_BIRD.length];
      const mm=morphMatsFor(morph, BIRD_VARIANT[p.i%BIRD_VARIANT.length]);
      const wingMat=on?mm.wingFar:(p.closeLOD?morphWingHiMat(morph, BIRD_VARIANT[p.i%BIRD_VARIANT.length]):mm.wingLo);
      const tailMat=on?mm.tailFar:(p.closeLOD?mm.tailHi:mm.tailLo);
      if(m.wingL) m.wingL.material=wingMat;
      if(m.wingR) m.wingR.material=wingMat;
      /* P3 (Issue #24): split / far-full wings and primary cards follow the same swap. */
      if(m.wingOL) m.wingOL.material=wingMat;
      if(m.wingOR) m.wingOR.material=wingMat;
      if(m.wingFullL) m.wingFullL.material=wingMat;
      if(m.wingFullR) m.wingFullR.material=wingMat;
      if(m.primL) for(const pm of m.primL) pm.material=wingMat;
      if(m.primR) for(const pm of m.primR) pm.material=wingMat;
      if(m.foldL) m.foldL.material=wingMat;
      if(m.foldR) m.foldR.material=wingMat;
      if(m.tail) m.tail.material=tailMat;
      m.wingMat=wingMat; m.tailMat=tailMat;
    }
    /* per-bird LOD check with ±10% hysteresis so the switch never flickers:
       enter at dist < 3.0 m or frame-height occupancy > 25%, leave at
       dist > 3.3 m and occupancy < 22.5% */
    function updateCloseLODs(){
      const tanHalf=Math.tan(camera.fov*Math.PI/360);
      for(const p of pigeons){
        const d=camera.position.distanceTo(p.pos);
        const occ=(0.58/d)/(2*tanHalf); // bird height ≈ 0.36 m real × 1.6 display
        if(!p.closeLOD && (d<3.0 || occ>0.25)) setCloseLOD(p, true);
        else if(p.closeLOD && d>3.3 && occ<0.225) setCloseLOD(p, false);
        /* P2 (Issue #20): far band with hysteresis — enter at
           d >= 15.0 m, leave at d <= 13.5 m, never while close. */
        if(!p.farLOD && !p.closeLOD && d>=15.0) setFarLOD(p, true);
        else if(p.farLOD && d<=13.5) setFarLOD(p, false);
        if(p.farLOD) p.mesh.farNeck.scale.copy(p.mesh.neck.scale); // follow courtship neck swell
      }
    }

    class Pigeon{
      constructor(i){
        this.i=i; this.name=NAMES[i%NAMES.length];
        this.mesh=makePigeonMesh(i);
        this.mass=rand(0.24,0.38); if(i%7===3) this.mass=rand(0.4,0.5); // a few racer-types
        this.dominance=clamp((this.mass-0.23)/0.27*0.7+rand(0,0.35),0,1);
        this.leadership=clamp(this.dominance*0.6+rand(0,0.5),0,1);
        /* dominance on the ground and flight leadership are separate
           hierarchies: food/water access queues by dominance_ground,
           flock following keys off leadership_flight */
        this.dominance_ground=this.dominance;
        this.leadership_flight=this.leadership;
        this.sex=(i%2===0)?'♂':'♀';
        this.breeding=(i%5<2);
        this.breeding_state=this.breeding; // bimodal daily rhythm applies only when true
        this.closeLOD=false; this.farLOD=false;
        this.flightSecToday=0; this.pecks=0; this.peckHits=0;
        this.sinceDrink=rand(60,400); this.checkFails=0;
        this.strategy=(i%9===8)?'wide':(i%3===0?'commuter':'local');
        this.prefSpeed=rand(12.5,16);
        this.pos=V3(0,0,0); this.vel=V3(0,0,0);
        this.heading=rand(0,TAU);
        this.state='perch'; this.stateT=0; this.idleT=rand(1,5);
        this.flapPhase=rand(0,TAU); this.flapFreq=0; this.fold=1; this.glide=false; this.glideT=rand(1,3);
        this.bobPhase=rand(0,1); this.peckT=0; this.peckAnim=0; this.headYaw=0; this.headYawT=0;
        this.slot=V3(rand(-1,1),rand(-0.3,0.5),rand(-1,1)).multiplyScalar(rand(3,13));
        this.target=null; this.checkPoint=null; this.finalPoint=null; this.finalKind=null;
        this.site=null; this.wanderT=0; this.courtT=0; this.alertT=0; this.escapeT=0; this.splitSign=0;
        this.landDelay=0; this.checkT=0; this.drinkT=0; this.preT=0; this.restT=0;
        this.carryT=0; this.batheT=0;
        this.player=false; this.takeoffBeats=0;
        this.exclaimT=0; this.feedRush=false;
      }
      get speed(){ return this.vel.length(); }
      setState(s){ this.state=s; this.stateT=0; }
      headWorld(out){ return this.mesh.headG.getWorldPosition(out||V3()); }
    }

    const pigeons=[];
    for(let i=0;i<24;i++) pigeons.push(new Pigeon(i));
    let focusIdx=0;
    pigeons.forEach((p,i)=>{ if(p.leadership>pigeons[focusIdx].leadership) focusIdx=i; });
    const focus=()=>pigeons[focusIdx];

    /* focus marker: pulsing ring + bobbing arrow + name tag, so the watched
       bird can be found at any zoom (it is only ~1 m long in a 1.9 km city) */
    const focusMarker=new THREE.Group();
    const fmRing=new THREE.Mesh(new THREE.RingGeometry(0.62,0.8,40),
      new THREE.MeshBasicMaterial({color:0x17a37e, transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false}));
    fmRing.rotation.x=-Math.PI/2; focusMarker.add(fmRing);
    const fmArrow=new THREE.Mesh(new THREE.ConeGeometry(0.17,0.46,4),
      new THREE.MeshBasicMaterial({color:0x17a37e}));
    fmArrow.rotation.x=Math.PI; focusMarker.add(fmArrow);
    const fmLabelCv=document.createElement('canvas'); fmLabelCv.width=256; fmLabelCv.height=108;
    const fmLabelTex=new THREE.CanvasTexture(fmLabelCv); fmLabelTex.encoding=THREE.sRGBEncoding;
    const fmLabel=new THREE.Sprite(new THREE.SpriteMaterial({map:fmLabelTex, transparent:true, depthWrite:false}));
    fmLabel.scale.set(2.6,1.1,1); focusMarker.add(fmLabel);
    scene.add(focusMarker);
    /* the tag's second line narrates the current action as a verb phrase */
    function actionVerb(p){
      if(p.player) return 'あなたが操作中';
      if(p.escapeT>0) return 'ハヤブサから逃げている';
      if(p.feedRush && p.state!=='forage') return '餌に気づいて移動中';
      switch(p.state){
        case 'roost': return 'ねぐらで休んでいる';
        case 'perch': return p.preT>0?'羽づくろいしている':'止まって休んでいる';
        case 'forage':
          if(p.feedRush) return 'まかれた餌をついばんでいる';
          if(p.restT>0) return '座り込んで休んでいる';
          return p._walking?'歩いて餌を探している':'餌をついばんでいる';
        case 'drink': return '水を飲んでいる';
        case 'bathe': return '水浴びしている';
        case 'court': return '求愛している（bow-coo）';
        case 'alert': return '周囲を警戒している';
        case 'takeoff': return '離陸している';
        case 'fly': return p.glide?'滑空している':'群れで飛んでいる';
        case 'descend': return '着陸に向かっている';
        case 'perchcheck': return '着陸前に周りを確認中';
        default: return '';
      }
    }
    let lastLabelKey='';
    function drawFocusLabel(){
      const p=focus();
      const key=p.name+'|'+actionVerb(p);
      if(key===lastLabelKey) return;
      lastLabelKey=key;
      const g=fmLabelCv.getContext('2d');
      g.clearRect(0,0,256,108);
      g.beginPath();
      const r=18; g.moveTo(10+r,6); g.lineTo(246-r,6); g.quadraticCurveTo(246,6,246,6+r); g.lineTo(246,102-r);
      g.quadraticCurveTo(246,102,246-r,102); g.lineTo(10+r,102); g.quadraticCurveTo(10,102,10,102-r);
      g.lineTo(10,6+r); g.quadraticCurveTo(10,6,10+r,6); g.closePath();
      g.fillStyle='rgba(10,22,17,.68)'; g.fill();
      g.fillStyle='#fff'; g.font='700 38px "Zen Kaku Gothic New", sans-serif';
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText('注目：'+p.name, 128, 36);
      g.fillStyle='rgba(255,255,255,.82)'; g.font='500 25px "Zen Kaku Gothic New", sans-serif';
      g.fillText(actionVerb(p), 128, 78);
      fmLabelTex.needsUpdate=true;
    }
    drawFocusLabel();
    function updateFocusMarker(now){
      drawFocusLabel(); // second line (current action) refreshes on change
      const p=focus();
      focusMarker.position.copy(p.pos);
      const s=1+Math.sin(now*0.005)*0.13;
      fmRing.scale.setScalar(s);
      fmRing.position.y=0.06;
      // the tag shrinks as the camera closes in, so at close-LOD range it
      // frames the bird instead of covering it
      const ls=clamp(camera.position.distanceTo(p.pos)/14, 0.3, 1);
      fmLabel.scale.set(2.6*ls, 1.1*ls, 1);
      fmArrow.position.y=(1.55+Math.sin(now*0.006)*0.16)*(0.45+0.55*ls);
      fmLabel.position.y=2.25*(0.4+0.6*ls);
      focusMarker.visible=(camMode!=='pov' && !(camMode==='play'&&playView==='pov'));
    }

    /* perch assignment helpers */
    function nearestPerches(center, n, kinds){
      const arr=perchPoints.filter(pp=>!kinds||kinds.includes(pp.kind));
      arr.sort((a,b)=>a.p.distanceToSquared(center)-b.p.distanceToSquared(center));
      const out=[];
      for(const pp of arr){
        if(out.length>=n) break;
        if(out.every(o=>o.p.distanceToSquared(pp.p)>4)) out.push(pp);
      }
      return out;
    }
    function randomPerchNear(center, radius, popularBias){
      const cand=perchPoints.filter(pp=>pp.p.distanceTo(center)<radius && (!popularBias||pp.popular||Math.random()<0.3));
      if(!cand.length) return null;
      return cand[randi(0,cand.length-1)];
    }
    const roostPerches=nearestPerches(V3(0,0,0), 60, ['girder']);
    function placeAtPerch(p, pp){
      p.pos.copy(pp.p); p.pos.y+=BODY_Y; p.vel.set(0,0,0);
      p.heading=rand(0,TAU); p.setState('perch'); p.perch=pp; p.fold=1;
    }
    function placeAtGround(p, site){
      const a=rand(0,TAU), r=rand(1, site.r*0.85);
      p.pos.set(site.p.x+Math.cos(a)*r, BODY_Y, site.p.z+Math.sin(a)*r);
      p.vel.set(0,0,0); p.heading=rand(0,TAU); p.setState('forage'); p.site=site; p.fold=1;
    }
    // initial placement: morning scene — some roost, some forage, some loaf
    pigeons.forEach((p,i)=>{
      if(i<8){ const pp=roostPerches[i%roostPerches.length]||perchPoints[i]; placeAtPerch(p,pp); p.setState('roost'); }
      else if(i<17){ placeAtGround(p, FORAGE[i%FORAGE.length]); }
      else { const pp=randomPerchNear(V3(0,0,0), 420, true); if(pp) placeAtPerch(p,pp); else placeAtGround(p,FORAGE[0]); }
    });

    /* ================= flock anchor & flight control ================= */
    const anchor={ pos:V3(0,36,-255), heading:0, path:[], speed:13, mode:'idle', landSite:null, landPerches:null, circuitLeft:0 };
    let flockFlying=false;
    function startFlockFlight(opts){
      opts=opts||{};
      let flyers=pigeons.filter(p=>!p.player && p.state!=='fly');
      if(!flyers.length) return;
      if(opts.fraction && opts.fraction<1){
        // real flocks split: only a subgroup relocates while the rest keep
        // foraging / loafing on the ground (the usual city-pigeon picture)
        const shuffled=flyers.slice();
        for(let i=shuffled.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=shuffled[i]; shuffled[i]=shuffled[j]; shuffled[j]=t; }
        flyers=shuffled.slice(0, Math.max(3, Math.round(flyers.length*opts.fraction)));
      }
      anchor.pos.copy(flyers[0].pos).add(V3(0,14,0));
      anchor.path=[];
      // opts.segments caps the circuit waypoints (short relocation hop);
      // without it, opts.loops full circuits are flown (commute flights)
      const totalPts=opts.segments||((opts.loops||1)*CIRCUIT.length);
      const startIdx=randi(0,CIRCUIT.length-1);
      for(let k=0;k<totalPts;k++) anchor.path.push(CIRCUIT[(startIdx+k)%CIRCUIT.length]);
      if(opts.dest){
        anchor.path.push(V3(opts.dest.x, 26, opts.dest.z));
      }
      anchor.landSite=opts.landSite||null;
      anchor.landPerches=opts.landPerches||null;
      anchor.mode='circuit';
      flockFlying=true;
      flyers.forEach((p,idx)=>{ p.landDelay=idx*0.14; setTimeout(()=>{},0); p.setState('takeoff'); p.takeoffBeats=0; p.stateT=-idx*0.13; });
      toast('群れが飛び立った');
    }
    function anchorUpdate(dt){
      if(!flockFlying) return;
      const tgt=anchor.path[0];
      if(!tgt){ // arrive → landing phase
        if(anchor.mode!=='landing'){ anchor.mode='landing'; beginLanding(); }
        return;
      }
      const to=_v1.copy(tgt).sub(anchor.pos); to.y*=0.7;
      const d=to.length();
      if(d<16){ anchor.path.shift(); return; }
      // cruise speed follows the distance still to fly (short hop = slower)
      let remaining=d;
      for(let k=1;k<anchor.path.length;k++) remaining+=anchor.path[k].distanceTo(anchor.path[k-1]);
      anchor.speed=cruiseSpeedFor(remaining);
      to.normalize();
      const targetHeading=Math.atan2(to.x,to.z);
      anchor.heading=angLerp(anchor.heading, targetHeading, clamp(dt*0.9,0,1));
      anchor.pos.addScaledVector(to, anchor.speed*dt);
    }
    function beginLanding(){
      const site=anchor.landSite, perches=anchor.landPerches;
      const flyers=pigeons.filter(p=>(p.state==='fly'||p.state==='takeoff') && !p.player);
      flyers.forEach((p,idx)=>{
        p.landDelay=0.4+idx*0.35;
        if(perches && perches[idx%perches.length]){
          p.finalPoint=perches[idx%perches.length].p; p.finalKind='perch'; p.perch=perches[idx%perches.length];
          p.checkPoint=pickCheckPoint(p.finalPoint); p.checked=false; p.checkFails=0; // narrow target: always two-stage
        } else if(site){
          const a=(idx/flyers.length)*TAU+rand(-0.3,0.3), r=rand(1.5, site.r*0.8);
          p.finalPoint=V3(site.p.x+Math.cos(a)*r, 0, site.p.z+Math.sin(a)*r);
          p.finalKind='ground'; p.site=site; p.checkPoint=null;
        } else {
          const pp=randomPerchNear(anchor.pos, 300, true);
          p.finalPoint=pp?pp.p:V3(0,BODY_Y,0); p.finalKind=pp?'perch':'ground'; p.perch=pp;
          p.checkPoint=pp?pickCheckPoint(pp.p):null; p.checked=false; p.checkFails=0;
        }
        p.setState('descend');
      });
      setTimeout(()=>{ flockFlying=false; anchor.mode='idle'; }, 6000);
    }

    /* ================= food event ================= */
    let crumbCluster=null; // {p, until, mesh, inst, site, noticed, born, crumbs[], ring, pillar, label}
    // B4: crumbs are a single InstancedMesh (150 instances) instead of 150
    // individual Meshes. The white base material multiplied by the
    // per-instance colour reproduces the three original Lambert colours
    // (0xd9a441 / 0xc78f2e / 0xe6bc62) exactly, and each instance matrix
    // carries the same position and uniform scale its Mesh had.
    const crumbColors=[0xd9a441,0xc78f2e,0xe6bc62].map(c=>new THREE.Color(c));
    const crumbMat=new THREE.MeshLambertMaterial({color:0xffffff});
    const crumbGeo=new THREE.SphereGeometry(0.13,6,5);
    const CRUMB_COUNT=150;
    const _crumbMtx=new THREE.Matrix4(), _crumbQ=new THREE.Quaternion(), _crumbSv=new THREE.Vector3();
    function makeFeedLabel(){
      const cv=document.createElement('canvas'); cv.width=256; cv.height=80;
      const g=cv.getContext('2d');
      g.beginPath();
      const r=18; g.moveTo(10+r,6); g.lineTo(246-r,6); g.quadraticCurveTo(246,6,246,6+r); g.lineTo(246,74-r);
      g.quadraticCurveTo(246,74,246-r,74); g.lineTo(10+r,74); g.quadraticCurveTo(10,74,10,74-r);
      g.lineTo(10,6+r); g.quadraticCurveTo(10,6,10+r,6); g.closePath();
      g.fillStyle='rgba(120,74,4,.82)'; g.fill();
      g.fillStyle='#ffe9b0'; g.font='700 38px "Zen Kaku Gothic New", sans-serif';
      g.textAlign='center'; g.textBaseline='middle'; g.fillText('餌をまいた', 128, 42);
      const tex=new THREE.CanvasTexture(cv); tex.encoding=THREE.sRGBEncoding;
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false}));
      sp.scale.set(7.5,2.34,1);
      return sp;
    }
    function scatterFeed(site){
      if(crumbCluster){ if(crumbCluster.inst) crumbCluster.inst.dispose(); scene.remove(crumbCluster.mesh); }
      const grp=new THREE.Group();
      // crumbs tossed from one point: each has a landing spot + flight delay
      const crumbs=[];
      const inst=new THREE.InstancedMesh(crumbGeo, crumbMat, CRUMB_COUNT);
      inst.castShadow=false; inst.receiveShadow=false; // same as the original crumb Meshes (both default off)
      inst.frustumCulled=false; // r128 culls an InstancedMesh by the base geometry's sphere at the group origin, which would hide crumbs scattered away from the origin
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for(let i=0;i<CRUMB_COUNT;i++){
        const a=rand(0,TAU), r=Math.sqrt(Math.random())*3.6;
        const to=V3(site.p.x+Math.cos(a)*r, 0.13, site.p.z+Math.sin(a)*r);
        const pos=V3(site.p.x, 1.4, site.p.z);
        const s0=rand(0.7,1.6);
        _crumbSv.set(s0,s0,s0);
        _crumbMtx.compose(pos, _crumbQ, _crumbSv);
        inst.setMatrixAt(i, _crumbMtx);
        inst.setColorAt(i, crumbColors[i%3]);
        crumbs.push({i, to, pos, delay:Math.random()*0.35, s0, settled:false});
      }
      inst.instanceMatrix.needsUpdate=true;
      if(inst.instanceColor) inst.instanceColor.needsUpdate=true;
      grp.add(inst);
      // ground ring + soft disc + light pillar so the spot reads from afar
      const ring=new THREE.Mesh(new THREE.RingGeometry(3.45,4.05,44),
        new THREE.MeshBasicMaterial({color:0xe8a713, transparent:true, opacity:0.95, side:THREE.DoubleSide, depthWrite:false}));
      ring.rotation.x=-Math.PI/2; ring.position.set(site.p.x,0.08,site.p.z); grp.add(ring);
      const disc=new THREE.Mesh(new THREE.CircleGeometry(4.05,44),
        new THREE.MeshBasicMaterial({color:0xe8a713, transparent:true, opacity:0.13, depthWrite:false}));
      disc.rotation.x=-Math.PI/2; disc.position.set(site.p.x,0.06,site.p.z); grp.add(disc);
      const pillar=new THREE.Mesh(new THREE.CylinderGeometry(4.05,4.05,13,24,1,true),
        new THREE.MeshBasicMaterial({color:0xe8a713, transparent:true, opacity:0.10, side:THREE.DoubleSide, depthWrite:false}));
      pillar.position.set(site.p.x,6.5,site.p.z); grp.add(pillar);
      const label=makeFeedLabel(); label.position.set(site.p.x, 9.5, site.p.z); grp.add(label);
      scene.add(grp);
      const now=performance.now();
      crumbCluster={p:site.p.clone(), until:now+45000, born:now, mesh:grp, inst, site, crumbs, ring, pillar, label, noticed:0};
      // who notices: everyone grounded/perched within 260 m (visual range)
      pigeons.forEach(p=>{
        if(p.player) return;
        const d=p.pos.distanceTo(site.p);
        const idle=['forage','perch','roost','court','alert','drink','bathe'].includes(p.state);
        if(d>=260 || !idle) return;
        if(ENV.rain>0.5 && d>60) return; // heavy rain: only nearby birds bother to notice food
        crumbCluster.noticed++;
        p.exclaimT=2.4; // "!" pops over the head
        if(p.state==='forage' && d<26){
          // close by: sprint on foot, producer first
          p.site=site; p.target=site.p.clone(); p.wanderT=0; p.feedRush=true;
        } else {
          // farther: fly down to the food
          p.finalPoint=V3(site.p.x+rand(-3.6,3.6), 0, site.p.z+rand(-3.6,3.6));
          p.finalKind='ground'; p.site=site; p.checkPoint=null; p.checked=false;
          p.setState('takeoff'); p.soloDescent=true; p.feedRush=true;
          p.stateT=-rand(0,1.1); // staggered departures read as a wave
        }
      });
      // camera assist: bring the feeding spot into close view in orbit mode
      if(camMode==='orbit'){
        orbit.tx=site.p.x; orbit.ty=site.p.y+0.4; orbit.tz=site.p.z;
        orbit.r=Math.min(orbit.r, 24);
      }
      const fs=document.getElementById('feedstat');
      if(fs){ fs.classList.add('show'); document.getElementById('feed-place').textContent=site.name; }
      toast(site.name+'に餌をまいた — '+crumbCluster.noticed+'羽が気づいて集まってくる（「！」が発見の合図）');
    }
    function updateFeedFX(dt){
      if(!crumbCluster) return;
      const now=performance.now();
      const age=(now-crumbCluster.born)/1000;
      const left=clamp((crumbCluster.until-now)/45000, 0, 1);
      // crumbs get eaten: shrink during the second half (same factor as
      // the per-Mesh version: scale = s0 * (0.35 + left * 1.3))
      const shrink=left<0.5 ? (0.35+left*1.3) : 1;
      // crumb toss: parabola from the hand point to each landing spot.
      // Instance matrices are rewritten only while a crumb is still in
      // flight or while the shrink is running; the resulting positions
      // and scales are identical to the per-Mesh version in every frame.
      let crumbsDirty=false;
      for(const c of crumbCluster.crumbs){
        if(c.settled && left>=0.5) continue;
        if(!c.settled){
          const t=clamp((age-c.delay)/0.55, 0, 1);
          if(t<1){
            c.pos.lerpVectors(_v4.set(crumbCluster.p.x,1.4,crumbCluster.p.z), c.to, t);
            c.pos.y+=Math.sin(t*Math.PI)*1.1*(1-t*0.4);
          } else { c.pos.copy(c.to); c.settled=true; }
        }
        const sc=c.s0*shrink;
        _crumbSv.set(sc,sc,sc);
        _crumbMtx.compose(c.pos, _crumbQ, _crumbSv);
        crumbCluster.inst.setMatrixAt(c.i, _crumbMtx);
        crumbsDirty=true;
      }
      if(crumbsDirty) crumbCluster.inst.instanceMatrix.needsUpdate=true;
      crumbCluster.ring.scale.setScalar(1+Math.sin(now*0.006)*0.05);
      crumbCluster.ring.material.opacity=0.55+0.4*Math.sin(now*0.006)*0.5+0.2;
      crumbCluster.pillar.material.opacity=0.10*Math.min(1,left*3);
      crumbCluster.label.position.y=9.5+Math.sin(now*0.003)*0.35;
      if(now>crumbCluster.until){
        crumbCluster.inst.dispose();
        scene.remove(crumbCluster.mesh); crumbCluster=null;
        pigeons.forEach(p=>{ p.feedRush=false; });
        const fs=document.getElementById('feedstat'); if(fs) fs.classList.remove('show');
        toast('餌は食べ尽くされた — 群れは通常の採餌に戻る');
      }
    }
    function updateFeedStatus(){
      if(!crumbCluster) return;
      const site=crumbCluster.site;
      let coming=0, eating=0;
      for(const p of pigeons){
        if(p.site!==site) continue;
        const d=Math.hypot(p.pos.x-site.p.x, p.pos.z-site.p.z);
        if(p.state==='forage' && d<4.6) eating++;
        else if(p.feedRush || p.state==='takeoff' || p.state==='descend') coming++;
      }
      document.getElementById('feed-noticed').textContent=crumbCluster.noticed;
      document.getElementById('feed-coming').textContent=coming;
      document.getElementById('feed-eating').textContent=eating;
      const left=clamp((crumbCluster.until-performance.now())/45000,0,1);
      document.querySelector('#feedbar i').style.width=(left*100)+'%';
      const msg=document.getElementById('feed-msg');
      msg.textContent = eating>=3 ? '群れが餌に群がってついばみ中。優位な個体ほど中心にいる。'
        : coming>0 ? '「！」の鳩が発見役。周囲が次々と飛来・疾走して集合中。'
        : '発見役（producer）が周囲を呼んでいる…';
    }

    /* ================= falcon ================= */
    const falcon=(()=> {
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color:0x4a4238, roughness:0.8});
      const b=new THREE.Mesh(new THREE.ConeGeometry(0.16,1.1,7), mat); b.rotation.x=Math.PI/2; g.add(b);
      const wg=new THREE.BoxGeometry(1.5,0.03,0.34);
      const w=new THREE.Mesh(wg, mat); w.position.z=-0.05; g.add(w);
      g.visible=false; scene.add(g);
      return {g, active:false, t:0, pass:0, vel:V3(), target:V3()};
    })();
    function launchFalcon(){
      if(falcon.active) return;
      falcon.active=true; falcon.t=0; falcon.pass=0; falcon.g.visible=true;
      const c=pigeons.some(p=>p.state==='fly')?anchor.pos:focus().pos;
      falcon.g.position.set(c.x+rand(-160,160), 120, c.z+rand(-160,160));
      falcon.target.copy(c);
      toast('ハヤブサ襲来 — 群れは進行方向から逃げる（HoPEモデル）');
      pigeons.forEach(p=>{
        if(p.player) return;
        if(p.state==='fly'||p.state==='takeoff'){ p.escapeT=2.6; p.splitSign=0; }
        else if(Math.random()<0.55){ // flush to short flight
          const pp=randomPerchNear(p.pos, 120, true);
          if(pp){ p.finalPoint=pp.p; p.finalKind='perch'; p.perch=pp; p.checkPoint=pickCheckPoint(pp.p); p.checked=false; p.checkFails=0; p.setState('takeoff'); p.soloDescent=true; }
          else { p.alertT=1.4; p.setState('alert'); }
        } else { p.alertT=rand(1,2); if(p.state!=='forage') p.setState('alert'); }
      });
    }
    function falconUpdate(dt){
      if(!falcon.active) return;
      falcon.t+=dt;
      const c=pigeons.some(p=>p.state==='fly')?anchor.pos:focus().pos;
      falcon.target.lerp(c, clamp(dt*0.7,0,1));
      const to=_v1.copy(falcon.target).sub(falcon.g.position);
      const d=to.length(); to.normalize();
      const sp=falcon.pass===0?30:26;
      falcon.vel.copy(to).multiplyScalar(sp);
      falcon.g.position.addScaledVector(falcon.vel, dt);
      falcon.g.lookAt(_v2.copy(falcon.g.position).add(falcon.vel));
      if(d<10){ falcon.pass++; falcon.g.position.y+=55; falcon.g.position.x+=rand(-90,90); falcon.g.position.z+=rand(-90,90);
        pigeons.forEach(p=>{ if(p.state==='fly'){ p.escapeT=2.2; } });
        if(falcon.pass>=3){ falcon.active=false; falcon.g.visible=false; }
      }
      if(falcon.t>26){ falcon.active=false; falcon.g.visible=false; }
      // splits: peripheral initiators with fast turn → split (Papadopoulou 2022)
      if(flockFlying && Math.random()<dt*0.8){
        const flyers=pigeons.filter(p=>p.state==='fly');
        if(flyers.length>4){
          const c2=anchor.pos;
          flyers.forEach(p=>{
            const radial=p.pos.distanceTo(c2);
            if(radial>9 && p.splitSign===0 && Math.random()<0.3) p.splitSign=(p.slot.x>=0?1:-1);
            else if(p.splitSign===0 && Math.random()<0.1) p.splitSign=0;
          });
        }
      }
    }

    /* scratch vectors */
    const _v1=V3(), _v2=V3(), _v3=V3(), _v4=V3();

    /* ================= per-pigeon update ================= */
    /* head-bobbing parameters: hold is the primary parameter (Frost 1978;
       Davies & Green 1988) — hold/thrust phases are derived from the
       stride cycle, and the stabilisation breaks down above ~0.81 m/s */
    const HEADBOB={holdRatio:0.63, stride:0.115, breakSpeed:0.81};
    /* cruise speed is a function of the distance still to fly: short hops
       (<100 m) peak at 8–10 m/s, longer legs build toward the 16 m/s cap */
    function cruiseSpeedFor(distM){
      if(distM<100) return lerp(8, 10, clamp(distM/100,0,1));
      return lerp(10, 16, clamp((distM-100)/700,0,1));
    }
    function flapFreqFor(p, dt){
      // Berg & Biewener 2010 / Dial & Biewener 1993 (report §B) — a
      // continuous function of speed, climb and flight phase, never a
      // fixed value; intermittent glides drop it to 0
      if(p.state==='takeoff'){ p.takeoffBeats+=p.flapFreq*dt; return lerp(8.9, 7.7, clamp(p.takeoffBeats/4,0,1)); }
      if(p.state==='descend') return lerp(7.8, 6.8, clamp(p.stateT/2.2,0,1));
      if(p.state==='fly'){
        if(p.glide) return 0;
        return clamp(6.6+(p.speed-9)*0.14 + clamp(p.vel.y,-3,3)*0.12, 6.2, 8.8);
      }
      return 0;
    }
    /* two-stage landing helper: a confirmation perch 4 m+ from the final
       (narrow) target. Narrow targets — ledges, rails, eaves, signs, roof
       edges — always land in two stages; only open ground / plaza and
       roof surfaces may be approached directly. */
    function pickCheckPoint(finalP){
      const cp=randomPerchNear(finalP, 55, false);
      if(cp && cp.p.distanceToSquared(finalP)>16) return cp.p;
      const near=nearestPerches(finalP, 4, null);
      for(const np of near){ if(np.p.distanceToSquared(finalP)>16) return np.p; }
      return null;
    }
    function perchOccupied(pt, self){
      for(const q of pigeons){
        if(q===self) continue;
        if(q.state!=='perch' && q.state!=='roost' && q.state!=='perchcheck') continue;
        const dx=q.pos.x-pt.x, dz=q.pos.z-pt.z;
        if(dx*dx+dz*dz<0.3) return q;
      }
      return null;
    }
    function avoidBuildings(p, dt){
      // hard push-out: a pigeon must never be inside a building volume
      const cell=aabbGrid.get(Math.floor(p.pos.x/80)+','+Math.floor(p.pos.z/80));
      if(!cell) return;
      for(let ci=0;ci<cell.length;ci++){
        const b=buildingsAABB[cell[ci]];
        if(p.pos.y > b.h+0.6) continue;
        if(p.pos.x>b.x0-1 && p.pos.x<b.x1+1 && p.pos.z>b.z0-1 && p.pos.z<b.z1+1){
          const exL=p.pos.x-(b.x0-1), exR=(b.x1+1)-p.pos.x, exB=p.pos.z-(b.z0-1), exF=(b.z1+1)-p.pos.z;
          const m=Math.min(exL,exR,exB,exF);
          if(m>3.5 || p.pos.y>b.h-1.5){ p.pos.y=b.h+0.6; if(p.vel.y<0) p.vel.y=0; }
          else if(m===exL){ p.pos.x=b.x0-1; if(p.vel.x>0) p.vel.x*=-0.2; }
          else if(m===exR){ p.pos.x=b.x1+1; if(p.vel.x<0) p.vel.x*=-0.2; }
          else if(m===exB){ p.pos.z=b.z0-1; if(p.vel.z>0) p.vel.z*=-0.2; }
          else { p.pos.z=b.z1+1; if(p.vel.z<0) p.vel.z*=-0.2; }
          p.vel.y+=14*dt;
        }
      }
    }
    function steer(p, desired, maxSpeed, accel, dt){
      _v3.copy(desired).sub(p.vel);
      const l=_v3.length(), maxD=accel*dt;
      if(l>maxD) _v3.multiplyScalar(maxD/l);
      p.vel.add(_v3);
      if(p.vel.length()>maxSpeed) p.vel.setLength(maxSpeed);
      p.pos.addScaledVector(p.vel, dt);
      if(p.vel.lengthSq()>0.4) p.heading=angLerp(p.heading, Math.atan2(p.vel.x,p.vel.z), clamp(dt*4,0,1));
    }

    function updatePigeon(p, dt, simMin){
      p.stateT+=dt;
      p.sinceDrink+=dt;
      if(p.state==='fly'||p.state==='takeoff'||p.state==='descend') p.flightSecToday+=dt*timeScale; // sim-seconds aloft
      const m=p.mesh;
      /* ---- flight states ---- */
      if(p.state==='takeoff'){
        if(p.stateT<0){ /* staggered wait */ }
        else{
          p.fold=lerp(p.fold,0,dt*6);
          const dir=_v1.set(Math.sin(p.heading),0,Math.cos(p.heading));
          const want=_v2.copy(dir).multiplyScalar(7).add(_v3.set(0,3.2,0));
          steer(p, want, 12, 14, dt);
          avoidBuildings(p, dt);
          if(p.stateT>1.15){
            if(p.soloDescent){ p.setState('descend'); }
            else p.setState('fly');
          }
        }
      }
      else if(p.state==='fly'){
        p.fold=lerp(p.fold,0,dt*5);
        // glide cycling (urban pigeons glide more — report §1-1)
        if(!p.player){
          p.glideT-=dt;
          if(p.glideT<=0){ p.glide=!p.glide; p.glideT=p.glide?rand(0.6,1.9):rand(1.2,3.2); }
        }
        // flock anchor frame
        const base=(playerControl.active&&playerPigeon===p)? null : null;
        let ax, ay, az, ah;
        if(p.player){
          ax=p.pos.x+Math.sin(p.heading)*26; ay=p.pos.y+(p._vy||0)*1.6; az=p.pos.z+Math.cos(p.heading)*26; ah=p.heading;
        }
        else if(playerControl.active && p!==playerPigeon){
          ax=playerPigeon.pos.x; ay=playerPigeon.pos.y; az=playerPigeon.pos.z; ah=playerPigeon.heading;
        } else { ax=anchor.pos.x; ay=anchor.pos.y; az=anchor.pos.z; ah=anchor.heading; }
        const cs=Math.cos(ah), sn=Math.sin(ah);
        const slotX=p.player?0:p.slot.x, slotZ=p.player?0:p.slot.z;
        let ox=slotX*cs + slotZ*sn, oz=-slotX*sn + slotZ*cs;
        ox*=ENV.cohesion; oz*=ENV.cohesion; // winter flocks bunch tighter; summer spreads out
        if(p.splitSign!==0){ ox+=p.splitSign*16; oz-=8; if(p.stateT%7<0.01) {} }
        _v1.set(ax+ox, ay+p.slot.y, az+oz);
        // escape: flee the falcon's heading (HoPE), distance-independent
        if(p.escapeT>0 && falcon.active){
          p.escapeT-=dt;
          _v1.addScaledVector(_v2.copy(falcon.vel).normalize(), -26);
          _v1.y+=4;
          if(p.escapeT<=0) p.splitSign=0;
        }
        const dist=_v1.distanceTo(p.pos);
        const cruiseBase=(p.player||playerControl.active)?13:anchor.speed;
        let sp=clamp(cruiseBase + (p.prefSpeed-14)*0.3 + dist*0.35 - 3, 8.2, 16); // Goldilocks compromise + catch-up, 16 m/s cap
        if(p.player) sp=p._playerSpeed||13;
        _v2.copy(_v1).sub(p.pos).normalize().multiplyScalar(sp);
        // separation (topological neighbours ≒ all in this small flock)
        for(const q of pigeons){
          if(q===p||(q.state!=='fly'&&q.state!=='takeoff')) continue;
          const d2=p.pos.distanceToSquared(q.pos);
          if(d2<12.25 && d2>0.0001){ _v3.copy(p.pos).sub(q.pos).normalize().multiplyScalar((3.5-Math.sqrt(d2))*2.2); _v2.add(_v3); }
        }
        steer(p, _v2, 16.5, 11, dt);
        avoidBuildings(p, dt);
        // strong wind pushes the whole body downwind between corrections
        if(!p.player && ENV.wind>0.05){ p.pos.x+=ENV.windX*ENV.wind*dt*3.4; p.pos.z+=ENV.windZ*ENV.wind*dt*3.4; }
        p.pos.y=Math.max(p.pos.y, 6);
      }
      else if(p.state==='descend'){
        p.fold=lerp(p.fold,0,dt*5); p.glide=false;
        if(p.landDelay>0){ p.landDelay-=dt;
          // keep circling near anchor meanwhile
          _v1.copy(anchor.pos).add(_v2.set(Math.sin(p.stateT*0.9+p.i)*14, 2, Math.cos(p.stateT*0.9+p.i)*14));
          _v2.copy(_v1).sub(p.pos).normalize().multiplyScalar(11);
          steer(p, _v2, 13, 9, dt);
        } else {
          const groundTarget=(p.finalKind==='ground' && (!p.checkPoint||p.checked));
          let tgt, approach=false;
          if(p.checkPoint && !p.checked){ tgt=_v1.copy(p.checkPoint); tgt.y+=BODY_Y; }
          else {
            const gy=groundTarget?BODY_Y:p.finalPoint.y+BODY_Y;
            const hd=Math.hypot(p.finalPoint.x-p.pos.x, p.finalPoint.z-p.pos.z);
            const appY=Math.max(20, gy+14);
            if(hd>22 && p.pos.y<appY){ tgt=_v1.set(p.finalPoint.x, appY, p.finalPoint.z); approach=true; }
            else tgt=_v1.set(p.finalPoint.x, gy, p.finalPoint.z);
          }
          const d=tgt.distanceTo(p.pos);
          const sp=clamp(d*0.9, 2.2, 11);
          _v2.copy(tgt).sub(p.pos).normalize().multiplyScalar(sp);
          steer(p, _v2, 12, 10, dt);
          avoidBuildings(p, dt);
          if(d<1.6 && !approach){
            if(p.checkPoint && !p.checked){
              if(perchOccupied(p.checkPoint, p) && p.checkFails<3){
                // confirmation perch is taken: cancel and pick another
                p.checkFails++; p.checkPoint=pickCheckPoint(p.finalPoint); p.landDelay=0.8;
              } else if(p.finalPoint && p.finalKind==='perch' && perchOccupied(p.finalPoint, p) && p.checkFails<3){
                // final perch got taken: abort this landing entirely
                p.checkFails++; p.checked=false; p.checkPoint=pickCheckPoint(p.finalPoint); p.landDelay=1.4;
              } else { p.checked=true; p.pos.copy(tgt); p.vel.set(0,0,0); p.setState('perchcheck'); p.checkT=rand(1.5,4); }
            }
            else {
              p.pos.copy(tgt); p.vel.set(0,0,0); p.soloDescent=false; p.checked=false;
              if(p.finalKind==='ground'){ p.setState('forage'); }
              else p.setState('perch');
            }
          }
          if(p.stateT>14){ // failsafe
            p.pos.copy(p.finalPoint); p.pos.y+=BODY_Y; p.vel.set(0,0,0);
            p.setState(p.finalKind==='ground'?'forage':'perch'); p.soloDescent=false; p.checked=false;
          }
        }
      }
      else if(p.state==='perchcheck'){ // two-stage landing: safety check (Osaka Pref. observation)
        p.fold=lerp(p.fold,1,dt*5);
        p.checkT-=dt;
        if(Math.random()<dt*1.4) p.headYawT=rand(-1,1);
        if(p.finalPoint && p.finalKind==='perch' && perchOccupied(p.finalPoint, p)){
          // the target was taken while checking: cancel the landing
          p.checked=false; p.checkFails++; p.checkPoint=pickCheckPoint(p.finalPoint); p.landDelay=1.2;
          p.setState('descend');
        }
        else if(p.checkT<=0){ p.setState('descend'); p.landDelay=0; }
      }
      /* ---- grounded states ---- */
      else if(p.state==='perch' || p.state==='roost'){
        p.fold=lerp(p.fold,1,dt*5);
        const sleeping=(p.state==='roost');
        p.idleT-=dt;
        if(p.idleT<=0){
          p.idleT=rand(1.5,6);
          const r=Math.random();
          if(!sleeping && r<0.30) p.preT=rand(0.8,1.6);              // preen
          else if(!sleeping && r<0.30+0.12*ENV.court && p.sex==='♂') { p.setState('court'); p.courtT=rand(4,6.5); } // bow-coo rate follows the breeding season
          else p.headYawT=rand(-1.1,1.1);                            // fovea scan (head saccade)
        }
        if(p.preT>0) p.preT-=dt;
      }
      else if(p.state==='court'){
        // bow-coo: bow + crop inflate + tail fan + slow strut turn (Goodwin ethogram)
        p.courtT-=dt; p.stateT+=0; // stateT already advanced
        p.heading+=dt*0.85;
        if(p.courtT<=0) p.setState(p.perch?'perch':'forage');
      }
      else if(p.state==='alert'){
        p.alertT-=dt;
        if(p.alertT<=0) p.setState(p.site?'forage':'perch');
      }
      else if(p.state==='forage'){
        p.fold=lerp(p.fold,1,dt*5);
        updateForage(p, dt);
      }
      else if(p.state==='drink'){
        p.drinkT-=dt;
        if(p.drinkT<=0){ p.setState('forage'); p.site=FORAGE[2]; }
      }
      else if(p.state==='bathe'){
        // bathing: crouched at the water's edge, shaking water through the feathers
        p.fold=lerp(p.fold,1,dt*5);
        p.batheT-=dt;
        if(Math.random()<dt*1.4) p.peckAnim=1;
        if(p.batheT<=0){ p.setState('forage'); }
      }

      /* ---- wing / head animation ---- */
      p.flapFreq=flapFreqFor(p, dt);
      if(p.flapFreq>0) p.flapPhase+=dt*p.flapFreq*TAU;
      const flying=(p.state==='fly'||p.state==='takeoff'||p.state==='descend');
      let wingA;
      if(flying){
        if(p.glide && p.state==='fly'){ wingA=0.32; } // shallow dihedral glide
        else wingA=Math.sin(p.flapPhase)*1.02 - 0.08;
      } else wingA=-0.1;
      const foldA=p.fold*1.85;
      m.wingLP.rotation.z=lerp(m.wingLP.rotation.z, wingA*(1-p.fold*0.85), 0.65);
      m.wingRP.rotation.z=lerp(m.wingRP.rotation.z, -wingA*(1-p.fold*0.85), 0.65);
      m.wingLP.rotation.y=foldA; m.wingRP.rotation.y=-foldA;
      /* P3 (Issue #24): outer-wing articulation, driven only by the
         existing flapPhase (no new random or time source). The outer
         wing repeats the root flap with a fixed phase lag
         (P3_LAG_RAD), so its relative bend peaks after the root's;
         the twist is proportional to the lagged downstroke amount
         (-cos of the lagged phase), so it reverses sign at each
         stroke reversal. Glides hold a slight extra dihedral, a
         fixed pronation and splayed primaries. Folding adds a
         wrist sweep-back on top of the root fold. */
      let p3OuterRel=0, p3Twist=0, p3Spread=0;
      if(flying){
        if(p.glide && p.state==='fly'){ p3OuterRel=0.06; p3Twist=0.10; p3Spread=0.85; }
        else{
          const ph=p.flapPhase;
          p3OuterRel=((Math.sin(ph-P3_LAG_RAD)*1.02-0.08)-wingA)*(1-p.fold*0.85);
          p3Twist=0.32*clamp(-Math.cos(ph-P3_LAG_RAD),-1,1)*(1-p.fold*0.85);
          p3Spread=Math.pow(clamp(-Math.cos(ph),0,1),0.75);
        }
      }
      p._p3Spread=p3Spread;
      if(m.wingOLP){
        m.wingOLP.rotation.z=lerp(m.wingOLP.rotation.z, p3OuterRel, 0.65);
        m.wingORP.rotation.z=lerp(m.wingORP.rotation.z, -p3OuterRel, 0.65);
        m.wingOLP.rotation.x=lerp(m.wingOLP.rotation.x, p3Twist, 0.65);
        m.wingORP.rotation.x=lerp(m.wingORP.rotation.x, -p3Twist, 0.65);
        m.wingOLP.rotation.y=lerp(m.wingOLP.rotation.y, p.fold*0.9, 0.65);
        m.wingORP.rotation.y=lerp(m.wingORP.rotation.y, -p.fold*0.9, 0.65);
      }
      /* P3 (Issue #24): collective-escape gate for the primary
         cards -- while the falcon is active and at least 6 birds
         are in escape flight, the cards are omitted flock-wide. */
      let p3EscN=0; for(const q of pigeons) if(q.escapeT>0) p3EscN++;
      const p3EscapeGate=falcon.active && p3EscN>=6;
      p._p3EscapeGate=p3EscapeGate;
      // swap between animated wings (flight) and back panels (folded)
      const foldedNow=p.fold>0.7;
      m.foldL.visible=m.foldR.visible=foldedNow;
      /* P3 (Issue #24): the split wing shows only outside the far
         LOD; far birds keep the single full wing (P2). */
      const wingSplitShow=!foldedNow && !p.farLOD;
      m.wingL.visible=m.wingR.visible=wingSplitShow;
      if(m.wingOL) m.wingOL.visible=m.wingOR.visible=wingSplitShow;
      if(m.wingFullL) m.wingFullL.visible=m.wingFullR.visible=(!foldedNow && p.farLOD);
      /* P3 (Issue #24): primary cards -- flying, near/mid range
         only, omitted in a collective escape; the fan angle follows
         the downstroke spread computed above. */
      const primShow=flying && wingSplitShow && !p3EscapeGate;
      if(m.primL){
        for(let k=0;k<m.primL.length;k++){
          const pa=lerp(P3_PRIM_CLOSED[k], P3_PRIM_OPEN[k], p3Spread);
          m.primL[k].rotation.y=pa; m.primR[k].rotation.y=pa;
          m.primL[k].visible=primShow; m.primR[k].visible=primShow;
        }
      }
      /* P4 (Issue #13): underwing flash panels show only in flight
         with the wings unfolded — never on the ground, and not during
         the fold transition right after takeoff. */
      m.underL.visible=m.underR.visible=(flying && !foldedNow);
      // body pitch/roll from velocity
      let pitch=0, roll=0;
      if(flying){
        pitch=clamp(-p.vel.y*0.045 + (p.speed<9?0.12:0), -0.5, 0.6);
        const turnRate=_angDiff(p.heading, p._lastHeading||p.heading)/Math.max(dt,0.001);
        roll=clamp(-turnRate*p.speed*0.028, -0.9, 0.9);
        m.tailG.rotation.x=(p.state==='descend')?0.5:0.12;
        m.tailG.scale.x=(p.state==='descend')?1.5:1; // tail fanned wide as an air brake on landing
      } else {
        m.tailG.rotation.x=(p.state==='court')?0.55:0.05;
        if(p.state==='court'){
          const bow=Math.max(0, Math.sin(p.stateT*TAU*0.55));
          pitch=bow*0.38; m.neck.scale.set(1.0+bow*0.3, 1.18+bow*0.35, 1.0+bow*0.3);
          m.tailG.scale.x=1+bow*0.5;
        } else { m.neck.scale.set(1.0,1.18,1.0); m.tailG.scale.x=1; }
      }
      p._lastHeading=p.heading;
      m.bodyG.position.y=lerp(m.bodyG.position.y||0, (p.state==='forage'&&p.restT>0)?-0.032:0, 0.2);
      m.bodyG.rotation.x=lerp(m.bodyG.rotation.x, pitch, 0.2);
      m.bodyG.rotation.z=lerp(m.bodyG.rotation.z, roll, 0.15);

      // head: bobbing / peck / preen / scan
      let hz=0, hy=0, hpitch=0;
      const walking=(p.state==='forage' && p._walking);
      if(walking){
        // hold/thrust derived from the stride cycle with hold_ratio as the
        // primary parameter (Frost 1978; Davies & Green 1988). Walking
        // only — never in flight — and the stabilisation breaks down
        // (amplitude collapses) above HEADBOB.breakSpeed (0.81 m/s).
        const hr=HEADBOB.holdRatio;
        const stable=(p._walkSpeed||0.4)<=HEADBOB.breakSpeed;
        const A=0.02*(stable?1:0.22);
        const ph=((p.bobPhase%1)+1)%1;
        hz = ph<hr ? A*(1-2*ph/hr) : -A + 2*A*(ph-hr)/(1-hr);
        hy = -Math.abs(Math.sin(ph*Math.PI))*0.004;
        p._bobHz=hz;
      }
      if(p.peckAnim>0){
        p.peckAnim-=dt*3.2;
        const k=Math.sin(clamp(p.peckAnim,0,1)*Math.PI);
        hpitch+=k*0.95; hz+=k*0.03; hy-=k*0.035;
      }
      if(p.state==='drink'){ hpitch=0.85; hz=0.035; hy=-0.03; } // suction drinking: head stays down
      if(p.state==='bathe'){ hpitch=0.5+Math.sin(p.stateT*19)*0.28; hz+=Math.sin(p.stateT*13)*0.02; } // dipping + shaking
      if(p.preT>0){ hpitch=0.5; p.headYawT=1.15; }
      if(p.state==='roost'){ hpitch=0.25; hy=-0.012; }
      p.headYaw=lerp(p.headYaw, p.headYawT, 0.35);
      if(Math.random()<dt*0.7 && !walking && p.state!=='court') p.headYawT=rand(-1,1);
      m.headG.position.set(0, 0.085+hy, 0.155+hz);
      m.headG.rotation.set(hpitch, p.headYaw*0.8, 0);
      // iridescent neck feathers: hue swings green <-> violet with the
      // viewing angle, as structural colour does. The azimuth factor vf
      // (saturated extremes at the two flanks) now drives two spatial
      // carriers instead of one flat material colour: the gradient
      // texture rotates around the neck (offset.x = vf × 0.5, i.e. a
      // full emerald⇄violet band swap across the azimuth swing) and
      // the sheen shell's uShift sweeps its within-frame gradient.
      // Together the colour varies across the neck in a single view
      // *and* swings hard as the viewpoint changes — visible at the
      // normal 2–3 m observation distance, not only in close-up.
      _v4.copy(camera.position).sub(p.pos).normalize();
      const relAz=Math.atan2(_v4.x,_v4.z)-p.heading;
      const vf=clamp(0.5+0.75*Math.sin(relAz)-0.3*Math.cos(relAz), 0, 1);
      if(m.neckTex) m.neckTex.offset.x=vf*0.5+(m.neckPhase||0); // P7 (Issue #22): per-bird phase
      if(m.neckSheenMat) m.neckSheenMat.uniforms.uShift.value=vf;
      m.neck.material.emissiveIntensity=(0.45+0.25*Math.abs(vf-0.5)*2)*(m.neckGain||1); // P7 (Issue #22): neck class gain
      // legs dangle on takeoff and landing approach, tucked only in cruise.
      // legs[] layout: [legL, footL, ankleL, legR, footR, ankleR]; in close
      // LOD the flat basic feet (1, 4) yield to the jointed toes.
      const legShow=p.state!=='fly';
      m.legs.forEach((l,li)=>{ l.visible=legShow && !((li===1||li===4) && p.closeLOD); });
      /* stepping: while a ground bird walks, the scarlet legs swing in
         alternation with the stride (same phase as the head-bob), so
         the feet visibly work instead of sliding under the body.
         2026-10-31 fix: the swing now also runs in close LOD — the old
         !closeLOD guard froze the legs of exactly the watched bird at
         the 2–3 m verification distance. Swing amplitude is up
         0.035 → 0.06 (≈ ±9.6 cm display) with a real lift
         (up to +0.034 local on the forward leg), and the jointed
         close-LOD feet (closeFeet) step along with the basic legs. */
      const LEG_Y=-0.155, ANK_Y=-0.245, FOOT_Y=-0.25;
      if(p.state==='forage' && p._walking){
        const ph=Math.sin(p.bobPhase*TAU);
        const sw=ph*0.06, liftL=Math.max(0,ph)*0.034, liftR=Math.max(0,-ph)*0.034;
        m.legs[0].position.z=0.005+sw;  m.legs[1].position.z=0.005+sw;
        m.legs[3].position.z=0.005-sw;  m.legs[4].position.z=0.005-sw;
        m.legs[0].position.y=LEG_Y+liftL; m.legs[1].position.y=LEG_Y+liftL;
        m.legs[3].position.y=LEG_Y+liftR; m.legs[4].position.y=LEG_Y+liftR;
        m.legs[2].position.z=0.005+sw; m.legs[2].position.y=ANK_Y+liftL;
        m.legs[5].position.z=0.005-sw; m.legs[5].position.y=ANK_Y+liftR;
        if(m.closeFeet){
          m.closeFeet[0].position.z=0.005+sw; m.closeFeet[0].position.y=FOOT_Y+liftL;
          m.closeFeet[1].position.z=0.005-sw; m.closeFeet[1].position.y=FOOT_Y+liftR;
        }
      } else {
        m.legs[0].position.z=m.legs[1].position.z=m.legs[3].position.z=m.legs[4].position.z=0.005;
        m.legs[0].position.y=m.legs[1].position.y=m.legs[3].position.y=m.legs[4].position.y=LEG_Y;
        m.legs[2].position.z=m.legs[5].position.z=0.005;
        m.legs[2].position.y=m.legs[5].position.y=ANK_Y;
        if(m.closeFeet){
          m.closeFeet[0].position.z=m.closeFeet[1].position.z=0.005;
          m.closeFeet[0].position.y=m.closeFeet[1].position.y=FOOT_Y;
        }
      }
      // nest-material carrying (breeding season): pick a twig up on the
      // ground / perch, keep it in the beak through the flight to the nest
      if(m.twig){
        if(p.carryT>0){ p.carryT-=dt; m.twig.visible=true; }
        else{
          m.twig.visible=false;
          if(ENV.court>1.2 && p.breeding && (p.state==='forage'||p.state==='perch') && Math.random()<dt*0.015) p.carryT=rand(6,13);
        }
      }
      if(p.state==='bathe') m.bodyG.rotation.z=Math.sin(p.stateT*16)*0.15; // splash roll while bathing
      if(p.exclaimT>0){ p.exclaimT-=dt; m.exclaim.visible=p.exclaimT>0; }
      // place mesh
      m.g.position.copy(p.pos);
      m.g.rotation.y=p.heading;
    }
    function _angDiff(a,b){ let d=(a-b)%TAU; if(d>Math.PI)d-=TAU; if(d<-Math.PI)d+=TAU; return d; }

    function updateForage(p, dt){
      if(p.player){ p.pos.y=BODY_Y; return; }
      const site=p.site||FORAGE[0];
      // ground loafing: sitting still between foraging bouts takes up much
      // of a city pigeon's day (Rose et al. 2006) — body lowered, head scans
      if(p.restT>0){
        p.restT-=dt; p._walking=false;
        if(Math.random()<dt*0.5) p.headYawT=rand(-1,1);
        p.pos.y=BODY_Y; return;
      }
      // rain: foraging is suppressed — birds mostly stand still and wait it out
      if(ENV.rain>0.4 && Math.random()<dt*0.9){ p.restT=rand(1.5,4); return; }
      // just after rain (or in summer heat at the water): bathe in a puddle here
      if((ENV.postRain>0 || seasonKey==='summer') && Math.random()<dt*0.045){
        p.setState('bathe'); p.batheT=rand(2.5,4.5); return;
      }
      p.wanderT-=dt;
      // DRINK fires only at water points; its probability rises after a
      // foraging bout and just before the evening return to the roost
      const drinkBoost=(phaseOf(simMin)==='evening'?2.4:1)*(p.sinceDrink>420?1.8:1)*(p.stateT>25?1.5:1);
      if(site===FORAGE[2] && Math.random()<dt*0.05*ENV.drink*drinkBoost){
        const dp=DRINK[randi(0,DRINK.length-1)];
        p.pos.set(dp.x+rand(-1.5,1.5), BODY_Y, dp.z+rand(-1,1));
        const batheP=(ENV.postRain>0?0.55:0)+(seasonKey==='summer'?0.3:0);
        if(Math.random()<batheP){ p.setState('bathe'); p.batheT=rand(2.5,4.5); }
        else { p.setState('drink'); p.drinkT=rand(1.6,2.6); p.sinceDrink=0; }
        return;
      }
      const clusterActive=crumbCluster && performance.now()<crumbCluster.until && crumbCluster.site===site;
      if(p.wanderT<=0 || !p.target){
        p.wanderT=rand(1.2,4);
        /* daily activity profile: the bimodal (dawn/dusk) rhythm belongs
           to breeding birds only; non-breeders follow a single peak
           centred on 10–15 h (the dawn/dusk commute flights still
           involve the whole flock via the director) */
        const hrNow=simMin/60;
        const restBias=p.breeding_state
          ? ((hrNow<9.5||hrNow>15.5)?0.55:1.35)
          : ((hrNow>=10&&hrNow<15)?0.45:1.3);
        if(!clusterActive && Math.random()<0.16*restBias){ p.restT=rand(4,10); return; }
        if(clusterActive){
          // access to the food is a queue ordered by dominance_ground:
          // while clearly dominant birds are feeding at the centre, a
          // low-ranking bird waits out at the ring instead of pushing in
          const dominantsFeeding=pigeons.some(q=>q!==p && q.dominance_ground>p.dominance_ground+0.25 &&
            (q.state==='forage'||q.state==='drink') && q.pos.distanceTo(crumbCluster.p)<2.4);
          if(p.dominance_ground<0.5 && dominantsFeeding){
            const rr=rand(3.3,4.3);
            const a=rand(0,TAU);
            p.target=V3(crumbCluster.p.x+Math.cos(a)*rr, 0, crumbCluster.p.z+Math.sin(a)*rr);
            p.wanderT=rand(0.8,1.6);
            return;
          }
          // scroungers converge; dominance → inner radius (producer-scrounger + pecking order)
          const rr=lerp(3.2, 0.7, p.dominance_ground)*Math.sqrt(Math.random());
          const a=rand(0,TAU);
          p.target=V3(crumbCluster.p.x+Math.cos(a)*rr, 0, crumbCluster.p.z+Math.sin(a)*rr);
        } else {
          const a=rand(0,TAU), r=rand(1, site.r*ENV.forageScale); // snow shrinks the ground-foraging range
          p.target=V3(site.p.x+Math.cos(a)*r, 0, site.p.z+Math.sin(a)*r);
        }
      }
      _v1.copy(p.target); _v1.y=p.pos.y;
      const d=_v1.distanceTo(p.pos);
      p._walking=d>0.35;
      if(p._walking){
        const sp=clusterActive?(p.feedRush?1.6:0.95):rand(0.28,0.5); // food rush: a clear sprint, not a stroll
        p._walkSpeed=sp;
        const wantHeading=Math.atan2(_v1.x-p.pos.x, _v1.z-p.pos.z);
        p.heading=angLerp(p.heading, wantHeading, clamp(dt*5,0,1));
        p.pos.addScaledVector(_v2.set(Math.sin(p.heading),0,Math.cos(p.heading)), Math.min(sp*dt, d));
        p.bobPhase+=(sp*dt)/HEADBOB.stride; // the bob cycle is driven by stride distance, not wall time
        // ground separation + dominance retreat: a lower-ranking bird that
        // strays within 0.3–0.5 m of a clearly dominant one gives way
        for(const q of pigeons){
          if(q===p||q.state!=='forage') continue;
          const d2=p.pos.distanceToSquared(q.pos);
          if(d2<0.30 && d2>0.0001 && q.dominance_ground>p.dominance_ground+0.15){
            _v3.copy(p.pos).sub(q.pos).setY(0).normalize();
            p.pos.addScaledVector(_v3, (0.55-Math.sqrt(d2))*dt*7);
            if(Math.random()<dt*0.8) p.wanderT=0; // and pick a new spot
          }
          else if(d2<0.8 && d2>0.0001){ _v3.copy(p.pos).sub(q.pos).setY(0).normalize(); p.pos.addScaledVector(_v3, (0.9-Math.sqrt(d2))*dt*2); }
        }
      } else {
        // peck: red-field target within 0.5 m, best focus ~0.1 m
        p.peckT-=dt;
        if(p.peckT<=0){
          p.peckT=clusterActive?rand(0.3,0.85):rand(1.4,4.2); p.peckAnim=1;
          // a peck only *succeeds* (finds food) inside a food cell — the
          // scattered crumb patch; elsewhere it is a searching peck
          p.pecks++;
          if(clusterActive && Math.hypot(p.pos.x-crumbCluster.p.x, p.pos.z-crumbCluster.p.z)<4.2) p.peckHits++;
        }
        if(clusterActive && Math.random()<dt*0.25 && p.dominance<0.45){
          // displaced by a dominant bird: hop aside (chase / wing-slap outcome)
          p.pos.x+=rand(-1.4,1.4); p.pos.z+=rand(-1.4,1.4); p.wanderT=0;
        }
      }
      p.pos.y=BODY_Y;
    }
