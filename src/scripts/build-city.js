    'use strict';
    /* ============================================================
       日本橋 鳩シミュレーション
       地図: OpenStreetMap 実データ (ODbL) / 行動: 研究ノートのパラメータ
       座標: 原点 = 日本橋交差点付近 (34.6668, 135.5058), 単位 m
             three.js: x=東, z=南 (北は -z)
       ============================================================ */
    /* boot timing (計測専用, boot phases for __QA__.snapshot):
       performance.now() recorded at each startup phase. This script
       runs only after the parser-blocking library scripts above it
       (three.min.js, city.js) have been fetched, decoded and executed,
       so 'decoded' is recorded at this same entry point. Phases whose
       location cannot be identified stay null — never fabricated. */
    const __boot={scriptStart:performance.now(), decoded:performance.now(),
      cityBuilt:null, texturesReady:null, firstFrame:null, interactive:null};
    const V3 = (x,y,z)=>new THREE.Vector3(x||0,y||0,z||0);
    const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
    const lerp=(a,b,t)=>a+(b-a)*t;
    const rand=(a,b)=>a+Math.random()*(b-a);
    const randi=(a,b)=>Math.floor(rand(a,b+1));
    const TAU=Math.PI*2;
    function angLerp(a,b,t){ let d=(b-a)%TAU; if(d>Math.PI)d-=TAU; if(d<-Math.PI)d+=TAU; return a+d*t; }
    function hash(n){ const s=Math.sin(n*127.1+311.7)*43758.5453; return s-Math.floor(s); }

    const loadbar=document.getElementById('loadbar'), loadmsg=document.getElementById('loadmsg');
    function setLoad(p,m){ loadbar.style.width=(p*100)+'%'; if(m) loadmsg.textContent=m; }

    /* ---------------- renderer / scene ---------------- */
    const stage=document.getElementById('stage');
    const renderer=new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.5)); // High quality DPR cap (Ultra: 2.0)
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=false; // B5: redraws are gated by the shadow update controller (needsUpdate)
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.02;
    stage.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x9fc3d8);
    scene.fog=new THREE.Fog(0x9fc3d8, 700, 2600);
    const camera=new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 5000);
    camera.position.set(14, 7, 24);

    const hemi=new THREE.HemisphereLight(0xcfe5ef, 0x54503f, 0.85); scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(300,420,140); sun.castShadow=true;
    /* shadow budget: instead of full CSM, one tight shadow camera follows
       the watched bird (0–170 m at 2048px ≈ the first CSM cascade's
       texel density); pigeons and street props read crisp shadows there */
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-170; sun.shadow.camera.right=170;
    sun.shadow.camera.top=170; sun.shadow.camera.bottom=-170;
    sun.shadow.camera.far=1600; sun.shadow.bias=-0.0006;
    scene.add(sun); scene.add(sun.target);
    const amb=new THREE.AmbientLight(0xffffff,0.12); scene.add(amb);

    /* ---------------- city build ---------------- */
    setLoad(0.1,'建物 9,079 棟を押し出し中…');
    const CITY=window.CITY;
    const buildingsAABB=[];   // {x0,x1,z0,z1,h}
    const buildingVertRanges=[]; // per-building vertex ranges in the merged city geometry (for occlusion fade)
    let cityMeshRef=null, cityGhostMat=null;
    /* X1 (Issue #28): spatial chunking of the city geometry.
       X1_CELL is the chunk cell size in metres (3x3 of the 80 m
       aabbGrid cells); X1_FADE_RADIUS is the fade-candidate line
       (see buildCity): a building whose AABB lies within this
       distance of a pigeon activity anchor (FORAGE site, DRINK
       point, or the CIRCUIT flight polyline) is a fade candidate
       and is never chunked -- it stays in the legacy merged fade
       mesh (cityMeshRef). cityFadeRecs holds one record per city
       geometry (legacy fade mesh first, then one per chunk), each
       {geo, list:[{bi, start, count}]} with chunk-local
       per-building vertex ranges, so applyOcclGroups() can rebuild
       the fade groups on every city geometry. x1State is read by
       __QA__ / the measurement panel. */
    const X1_CELL=240, X1_FADE_RADIUS=60;
    const x1State={chunks:0, fadeBuildings:0, chunkedBuildings:0, fadeVerts:0, chunkVerts:0};
    let cityFadeRecs=[];
    let waterTex=null, rippleTex=null;
    const streetPropCounts={poles:0, wires:0, vending:0, manholes:0, stripes:0, sleeveSigns:0};
    /* C3 (Issue #17) near-distance layer: placements recorded by
       buildStreetProps() so the dedicated close-range layer can attach
       to the exact same spots without touching the merged city
       geometry (CITYGEO) or the existing prop builders. */
    const vendPlacements=[];   // {x,z,rot}
    const sleevePlacements=[]; // {x,y,z,dirX,di}
    const polePlacements=[];   // {x,z,px,pz}
    /* C3: widened wire-bundle offsets [lateral, dy] — the ONLY change
       to the wire layout; pole positions and span data are unchanged.
       Upper three spread ±1.8 m laterally and 0.35–0.62 m vertically,
       the lower wire sits 1.0 m below on the second arm, so all four
       wires separate into individual lines at street level. */
    const WIRE_OFFS=[[-1.8,0.35],[0,0.62],[1.8,0.35],[-1.05,-1.0]];
    const nearLayerCounts={barrierPosts:0, barrierRails:0, pricePlanes:0,
      sleeveCells:0, sleeveArms:0, decalIntersections:0, crossarms:0,
      wireBundleSpacing:{lateral:1.8, upperLift:0.62, lowerDrop:1.0,
        offsets:WIRE_OFFS.map(o=>[o[0],o[1]])}};
    /* handles the season/weather system (later script) drives */
    let cityMeshMat=null, roadsMat=null, groundMat=null, waterMatRef=null, canopyMesh=null;
    /* C4 (Issue #18): public wet-state of the road surface, written by
       updateEnvironment() alongside roadsMat and read by __QA__. */
    const roadSurface={roughnessFactor:1.0, envMapIntensity:0.25, curbSegments:0};
    /* C6 (Issue #25): limited planar reflection for the two rivers.
       One reflection plane at the water height (y = C6_REFL_Y): every
       water mesh shares the same transform (position (0, 0.35, 0),
       rotation -PI/2 about X), so a single render target and a single
       projective texture matrix cover both the Dotonbori and the
       Higashi-Yokobori. Only objects tagged onto layer C6_REFL_LAYER
       (the merged building mesh and the opaque elevated-expressway
       meshes) are drawn by the mirrored camera — pigeons, props, the
       ground, the water itself and the translucent barrier panels
       never enter the reflection. The C2 water material is NOT
       replaced: a transparent overlay reusing each water polygon's
       ShapeGeometry is laid at y = 0.40 (between the water at 0.35
       and the ripple layer at 0.44) and adds the mirrored image on
       top, fresnel-weighted, with a small ripple-driven wobble. */
    const C6_REFL_LAYER=1;
    const C6_REFL_Y=0.35;
    let c6RtSize=256; // render-target edge; 512 in Ultra, else 256 (spec: 256-512)
    const c6RenderTarget=new THREE.WebGLRenderTarget(c6RtSize, c6RtSize,
      {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat});
    const c6VirtualCamera=new THREE.PerspectiveCamera();
    c6VirtualCamera.layers.set(C6_REFL_LAYER);
    const c6TexMatrix=new THREE.Matrix4();
    const c6ReflMat=new THREE.ShaderMaterial({
      uniforms:{tReflect:{value:c6RenderTarget.texture}, tRipple:{value:null},
        uRippleOff:{value:new THREE.Vector2(0,0)}, uTexMatrix:{value:c6TexMatrix},
        uOpacity:{value:0.85}},
      vertexShader:[
        'uniform mat4 uTexMatrix;',
        'varying vec4 vProj; varying vec2 vUvW; varying vec3 vView;',
        'void main(){',
        '  vUvW=uv;',
        '  vec4 wp=modelMatrix*vec4(position,1.0);',
        '  vView=cameraPosition-wp.xyz;',
        '  vProj=uTexMatrix*vec4(position,1.0);',
        '  gl_Position=projectionMatrix*viewMatrix*wp;',
        '}',
      ].join('\n'),
      fragmentShader:[
        'uniform sampler2D tReflect; uniform sampler2D tRipple;',
        'uniform vec2 uRippleOff; uniform float uOpacity;',
        'varying vec4 vProj; varying vec2 vUvW; varying vec3 vView;',
        'void main(){',
        '  float rip=texture2D(tRipple, vUvW*0.085+uRippleOff).a;',
        '  vec4 proj=vProj;',
        '  proj.xy+=(rip-0.30)*0.010*proj.w;',
        '  vec2 uv=proj.xy/max(proj.w, 0.0001);',
        '  float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0)*step(0.0,proj.w);',
        '  vec3 refl=texture2D(tReflect, uv).rgb;',
        '  vec3 V=normalize(vView);',
        '  float fres=pow(1.0-clamp(V.y,0.0,1.0), 2.0);',
        '  float alpha=uOpacity*(0.10+0.80*fres)*inside;',
        '  if(alpha<=0.001) discard;',
        '  gl_FragColor=vec4(refl*vec3(0.82,0.93,0.97), alpha);',
        '}',
      ].join('\n'),
      transparent:true, depthWrite:false});
    const c6Overlays=[];   // one per water polygon, filled in buildRoadsWater()
    let c6WaterBase=null;  // first base water mesh (its transform defines the plane)
    const c6State={mode:'auto', enabled:false, renders:0, tagged:0};
    function c6Tag(obj){ obj.layers.enable(C6_REFL_LAYER); c6State.tagged++; }
    /* lights must answer the reflection camera as well, so the
       mirrored image is lit like the main view */
    hemi.layers.enable(C6_REFL_LAYER); sun.layers.enable(C6_REFL_LAYER); amb.layers.enable(C6_REFL_LAYER);
    /* C5 (Issue #19): rooftop-layer tallies, filled by
       buildRoofLayerC5() and read by __QA__. addedTriangles is the
       exact triangle count of the layer's own geometry, accumulated
       from the built geometry (instanced open boxes 10, tanks 18
       after the PR #49 triangle-budget fix). */
    const roofLayerCounts={buildings:0, textureTypes:4, byTexture:[0,0,0,0],
      parapets:0, parapetHeightMin:0, parapetHeightMax:0,
      classBuildings:{S:0,M:0,L:0,XL:0},
      addedByClass:{S:0,M:0,L:0,XL:0},
      addedItems:{penthouse:0, tank:0, ac:0, total:0},
      existingRooftopItems:0,
      addedNodes:0, addedCalls:0, addedTextures:0, addedTriangles:0};
    const canopyBase=[]; // per-tree canopy {x,y,z,sx,sy,sz} for wind sway
    const aabbGrid=new Map(); // 80m cells -> indices into buildingsAABB
    const perchPoints=[];      // {p:V3, popular:bool, kind}
    const ledgePoints=[];

    /* procedural facade texture: 1 tile = 10 m. Mostly light wall so it
       multiplies with the per-building vertex colour; corners stay plain
       so roofs can sample a single flat texel (uv 0.03,0.03). */
    /* Facade atlas: 2x2 tiles (512px each), one per building type —
       office glass curtain wall / commercial with sign band / residential
       with balconies / low shop with shutter + awning. 1 tile = 10 m.
       Every tile keeps its corners plain wall so roofs can sample a flat
       texel (uv 0.03,0.03 within the building's own tile). */
    const FACADE_TILES={office:[0,0], commercial:[1,0], residential:[0,1], shop:[1,1]};
    /* C1 (phase 2): alongside the diffuse atlas, makeFacadeAtlas fills
       two auxiliary canvases in the same tile coordinate system — a
       glass mask (white = glass) and a lit-window (emissive) canvas —
       and derives a Sobel normal map and a roughness map from them.
       The three derived textures are published here for buildCity(). */
    let facadeNormalTex=null, facadeRoughTex=null, facadeEmissiveTex=null;
    function makeFacadeAtlas(){
      const S=512, cv=document.createElement('canvas'); cv.width=cv.height=1024;
      const g=cv.getContext('2d');
      const maskCv=document.createElement('canvas'); maskCv.width=maskCv.height=1024;
      const gm=maskCv.getContext('2d'); gm.fillStyle='#000'; gm.fillRect(0,0,1024,1024);
      const emisCv=document.createElement('canvas'); emisCv.width=emisCv.height=1024;
      const ge=emisCv.getContext('2d'); ge.fillStyle='#000'; ge.fillRect(0,0,1024,1024);
      let curOX=0, curOY=0; // origin of the tile currently being drawn
      // MR: record a glass rect in the mask. ER: record a lit-window rect
      // in the emissive canvas at deterministic intensity v (0.55..1.0).
      const MR=(x,yb,w,h)=>{ gm.fillStyle='#fff'; gm.fillRect(curOX+x, curOY+S-yb-h, w, h); };
      const ER=(x,yb,w,h,v)=>{ const c=Math.round(255*clamp(v,0,1));
        ge.fillStyle='rgb('+c+','+c+','+c+')'; ge.fillRect(curOX+x, curOY+S-yb-h, w, h); };
      function tile(type, draw){
        const t=FACADE_TILES[type], ox=t[0]*S, oy=(1-t[1])*S;
        curOX=ox; curOY=oy;
        // R(x, yb, w, h, style): yb = height above the tile's street level
        const R=(x,yb,w,h,style)=>{ g.fillStyle=style; g.fillRect(ox+x, oy+S-yb-h, w, h); };
        draw(R);
        for(let i=0;i<1500;i++){ // concrete grain
          g.fillStyle='rgba('+(Math.random()<0.5?'80,78,70':'255,255,250')+','+(Math.random()*0.06)+')';
          g.fillRect(ox+Math.random()*S, oy+Math.random()*S, 1.8, 1.8);
        }
        const gr=g.createLinearGradient(0,oy+S-90,0,oy+S); // age grime near the ground
        gr.addColorStop(0,'rgba(52,50,44,0)'); gr.addColorStop(1,'rgba(52,50,44,.20)');
        g.fillStyle=gr; g.fillRect(ox,oy+S-90,S,90);
      }
      function pane(R,x,yb,w,h,seed){
        const lit=hash(seed)>0.84, sh=0.8+hash(seed*1.7)*0.45;
        R(x-2,yb-2,w+4,h+4,'#b9b6ae');
        // C1: lit windows are plain glass in the diffuse atlas; the lit
        // state is recorded only in the emissive canvas (and the glass
        // rect in the mask), so daylight shows normal glass.
        R(x,yb,w,h,'rgb('+Math.round(46*sh)+','+Math.round(62*sh)+','+Math.round(74*sh)+')');
        MR(x,yb,w,h);
        if(lit) ER(x,yb,w,h, 0.55+hash(seed*3.1)*0.45);
        R(x,yb+h-8,w,8,'rgba(255,255,255,.35)'); // sky reflection band
        R(x+w/2-1,yb,2,h,'rgba(40,40,44,.3)');   // mullion
        R(x,yb-5,w,5,'rgba(30,30,28,.16)');      // grime under sill
      }
      tile('office', R=>{
        R(0,0,512,512,'#ccd1d2');
        for(let r=0;r<5;r++) for(let c=0;c<5;c++){ // glass curtain wall
          const x=34+c*92, yb=26+r*96, seed=r*13+c*7+3, sh=0.75+hash(seed)*0.6;
          R(x,yb,76,80,'rgb('+Math.round(88*sh)+','+Math.round(112*sh)+','+Math.round(128*sh)+')');
          MR(x,yb,76,80); // curtain-wall glass
          R(x,yb+50,76,30,'rgba(255,255,255,.26)'); // reflected sky gradient
          if(hash(seed*3)>0.86) ER(x,yb,76,80, 0.55+hash(seed*3.7)*0.45); // lit office floor (emissive only)
        }
        for(let c=0;c<=5;c++) R(28+c*92,16,3,480,'rgba(80,84,86,.5)'); // mullions
        for(let r=0;r<=5;r++) R(24,22+r*96,464,3,'rgba(80,84,86,.45)');
      });
      tile('commercial', R=>{
        R(0,0,512,512,'#d9d2c6');
        for(let r=0;r<3;r++) for(let c=0;c<3;c++) pane(R, 44+c*150, 306+r*64, 104, 42, r*17+c*29+11);
        R(30,240,452,46,'#a33327'); // sign band (generic signage, no real brands)
        R(48,251,120,24,'rgba(255,240,210,.85)'); R(190,251,90,24,'rgba(255,240,210,.6)'); R(302,251,148,24,'rgba(255,240,210,.75)');
        R(30,228,452,9,'rgba(60,55,48,.4)');
        for(let c=0;c<3;c++){ // storefront glass at street level
          R(44+c*150,56,118,156,'rgb(52,66,74)');
          MR(44+c*150,56,118,156);
          R(44+c*150,176,118,36,'rgba(255,255,255,.3)');
          R(44+c*150,56,118,10,'rgba(20,20,20,.35)');
        }
      });
      tile('residential', R=>{
        R(0,0,512,512,'#ded7cb');
        for(let r=0;r<4;r++) for(let c=0;c<3;c++){
          const x=48+c*148, yb=40+r*114;
          pane(R, x, yb+24, 84, 56, r*19+c*23+5);
          R(x-9, yb, 102, 10, '#b3aa9c');             // balcony slab
          R(x-9, yb+10, 102, 3, 'rgba(70,70,74,.55)'); // railing
          for(let k=0;k<6;k++) R(x-5+k*17, yb+2, 2, 9, 'rgba(70,70,74,.4)');
          if(hash(r*41+c*3)>0.7) R(x+8, yb+30, 26, 20, '#c8c2b4'); // AC unit on some balconies
        }
      });
      tile('shop', R=>{
        R(0,0,512,512,'#d6d0c2');
        for(let c=0;c<3;c++) pane(R, 48+c*148, 398, 92, 62, c*31+7);
        R(28,320,456,42,'#2e6e5e'); // awning
        for(let k=0;k<12;k++) R(28+k*38, 308, 34, 12, '#2e6e5e'); // scalloped edge
        R(28,300,456,6,'rgba(40,40,40,.25)');
        R(40,44,200,238,'#a9a49a'); // shutter storefront
        for(let yb=54; yb<276; yb+=9) R(40,yb,200,2,'rgba(60,58,54,.45)');
        R(272,44,200,238,'rgb(54,68,76)'); // open glass bay
        MR(272,44,200,238);
        R(272,206,200,38,'rgba(255,255,255,.3)');
        R(258,44,10,238,'#8a8378'); R(36,282,440,8,'#8a8378');
      });
      /* C1: derive the auxiliary maps from the finished atlas.
         normalMap — Sobel over diffuse luminance, so window frames,
         sashes, shutter slats and balconies gain relief. Strength is
         moderate so normalScale 0.85 stays well-behaved.
         roughnessMap — from the glass mask: glass is smooth (70),
         everything else is rough wall (235). */
      const W=1024;
      const srcPx=g.getImageData(0,0,W,W).data;
      const lum=new Float32Array(W*W);
      for(let i=0;i<W*W;i++){ const o=i*4;
        lum[i]=(srcPx[o]*0.299+srcPx[o+1]*0.587+srcPx[o+2]*0.114)/255; }
      const nCv=document.createElement('canvas'); nCv.width=nCv.height=W;
      const ng=nCv.getContext('2d'), nImg=ng.createImageData(W,W), nd=nImg.data;
      const NSTR=2.0;
      for(let y=0;y<W;y++){
        const ym=((y+W-1)%W)*W, y0=y*W, yp=((y+1)%W)*W;
        for(let x=0;x<W;x++){
          const xm=(x+W-1)%W, xp=(x+1)%W;
          const tl=lum[ym+xm], tc=lum[ym+x], tr=lum[ym+xp];
          const ml=lum[y0+xm], mr=lum[y0+xp];
          const bl=lum[yp+xm], bc=lum[yp+x], br=lum[yp+xp];
          const dx=(tr+2*mr+br)-(tl+2*ml+bl);
          const dy=(bl+2*bc+br)-(tl+2*tc+tr);
          // canvas y runs downward while texture v (flipY) runs upward,
          // so the v slope keeps the canvas Sobel sign
          let nx=-dx*NSTR, ny=dy*NSTR, nz=1;
          const il=1/Math.sqrt(nx*nx+ny*ny+nz*nz);
          const o=(y0+x)*4;
          nd[o]=(nx*il*0.5+0.5)*255; nd[o+1]=(ny*il*0.5+0.5)*255;
          nd[o+2]=(nz*il*0.5+0.5)*255; nd[o+3]=255;
        }
      }
      ng.putImageData(nImg,0,0);
      const maskPx=gm.getImageData(0,0,W,W).data;
      const rCv=document.createElement('canvas'); rCv.width=rCv.height=W;
      const rg=rCv.getContext('2d'), rImg=rg.createImageData(W,W), rd=rImg.data;
      for(let i=0;i<W*W;i++){
        const v=maskPx[i*4]>127?70:235, o=i*4;
        rd[o]=rd[o+1]=rd[o+2]=v; rd[o+3]=255;
      }
      rg.putImageData(rImg,0,0);
      const nTex=new THREE.CanvasTexture(nCv); // linear data: no sRGB
      nTex.wrapS=nTex.wrapT=THREE.RepeatWrapping; nTex.anisotropy=8;
      const rTex=new THREE.CanvasTexture(rCv); // linear data: no sRGB
      rTex.wrapS=rTex.wrapT=THREE.RepeatWrapping; rTex.anisotropy=8;
      const eTex=new THREE.CanvasTexture(emisCv);
      eTex.wrapS=eTex.wrapT=THREE.RepeatWrapping;
      eTex.encoding=THREE.sRGBEncoding; eTex.anisotropy=8;
      facadeNormalTex=nTex; facadeRoughTex=rTex; facadeEmissiveTex=eTex;
      const tex=new THREE.CanvasTexture(cv);
      tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
      tex.encoding=THREE.sRGBEncoding; tex.anisotropy=8;
      return tex;
    }
    const facadeTex=makeFacadeAtlas();
    const rooftopItems=[]; // {x,y,z,sx,sy,sz,rot}
    const signItems=[];    // rooftop advertising towers (coloured)

    function buildCity(){
      /* B6 (Issue #10): the per-building extrusion (walls, winding fix,
         roof triangulation) is precomputed at build time. Only the
         position attribute is embedded (window.CITYGEO: Int16 decimetres,
         base64, plus a Uint32 per-building vertex count); normal / color /
         uv are recomputed from position below with the same formulas the
         old push() used. The per-building side data (buildingsAABB /
         buildingVertRanges / rooftopItems / signItems / perchPoints /
         ledgePoints) is regenerated from CITY with the old loop's own
         calculations, unchanged and in the same order. */
      const _b64buf=s=>{ const bin=atob(s); const bytes=new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return bytes.buffer; };
      const posI16=new Int16Array(_b64buf(window.CITYGEO.pos));
      const geoCounts=new Uint32Array(_b64buf(window.CITYGEO.counts));
      const totalVerts=posI16.length/3;
      const pos64=new Float64Array(posI16.length);
      for(let i=0;i<posI16.length;i++) pos64[i]=posI16[i]/10;
      const col=new Float32Array(totalVerts*3), nor=new Float32Array(totalVerts*3), uv=new Float32Array(totalVerts*2);
      const bld=new Float32Array(totalVerts); // C1: per-building seed attribute (aBld)
      const cTop=new THREE.Color(), cWall=new THREE.Color();
      let tileU=0, tileV=0; // facade-atlas tile of the building being emitted
      let geoStart=0; // running vertex offset, replaces pos.length/3
      const B=CITY.buildings;
      for(let bi=0; bi<B.length; bi++){
        const vStart=geoStart;
        const count=geoCounts[bi];
        geoStart+=count;
        const seedB=hash(bi*7+3);
        for(let t=0;t<count;t++) bld[vStart+t]=seedB;
        const h=B[bi][0]/10, flat=B[bi][2], n=flat.length/2;
        const pts=[];
        let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9, cx=0, cn=0;
        for(let i=0;i<n;i++){
          const x=flat[i*2]/10, zn=flat[i*2+1]/10, z=-zn;
          pts.push([x,z]); cx+=x; cn+=zn;
          if(x<x0)x0=x; if(x>x1)x1=x; if(z<z0)z0=z; if(z>z1)z1=z;
        }
        cx/=n; cn/=n;
        const tall=h>34, mid=h>15;
        const kind=hash(bi*3+1);
        if(kind<0.52){ // concrete / white-gray
          cWall.setHSL(0.1+hash(bi*5)*0.04, 0.03+hash(bi)*0.05, tall?0.6+hash(bi)*0.12:(mid?0.62+hash(bi)*0.14:0.64+hash(bi*7)*0.16));
        } else if(kind<0.78){ // cool glass / blue-gray
          cWall.setHSL(0.58, 0.08+hash(bi*5)*0.08, tall?0.5+hash(bi)*0.14:0.55+hash(bi)*0.13);
        } else { // brick / tan
          cWall.setHSL(0.05+hash(bi*5)*0.04, 0.2+hash(bi)*0.12, 0.48+hash(bi*7)*0.13);
        }
        cTop.setHSL(0.08+hash(bi*13)*0.04, 0.06+hash(bi)*0.08, 0.3+hash(bi*13)*0.12);
        if(hash(bi*19)>0.9) cTop.setHSL(0.02,0.25,0.36);
        // facade type by height (tall = office / residential tower,
        // mid = commercial / residential, low = shopfront)
        const btype = h>=26 ? (hash(bi*23)<0.6?'office':'residential')
          : h>=11 ? (hash(bi*23)<0.55?'commercial':'residential')
          : (hash(bi*23)<0.6?'shop':'commercial');
        tileU=FACADE_TILES[btype][0]; tileV=FACADE_TILES[btype][1];
        // walls are the first 6n vertices of this building's range, the
        // roof triangles follow; normals / uv use the old push() formulas
        // on the final (post-winding-fix) positions, colours are cWall
        // for the wall range and cTop for the roof range
        const wallVerts=6*n;
        for(let t=0;t<count;t+=3){
          const o=(vStart+t)*3;
          const ax=pos64[o], ay=pos64[o+1], az=pos64[o+2];
          const bx=pos64[o+3], by=pos64[o+4], bz=pos64[o+5];
          const qx=pos64[o+6], qy=pos64[o+7], qz=pos64[o+8];
          const ux=bx-ax, uy=by-ay, uz=bz-az, vx=qx-ax, vy=qy-ay, vz=qz-az;
          let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
          const l=Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l;
          const vs=[[ax,ay,az],[bx,by,bz],[qx,qy,qz]];
          for(let vi=0;vi<3;vi++){
            const gi=vStart+t+vi, go=gi*3, color=(t+vi<wallVerts)?cWall:cTop;
            col[go]=color.r; col[go+1]=color.g; col[go+2]=color.b;
            nor[go]=nx; nor[go+1]=ny; nor[go+2]=nz;
            if(ny>0.7){ uv[gi*2]=tileU*0.5+0.015; uv[gi*2+1]=tileV*0.5+0.015; } // roof: flat texel inside this building's tile
            else{
              const u=(Math.abs(nx)>Math.abs(nz)? vs[vi][2] : vs[vi][0])*0.1;
              const v=vs[vi][1]*0.1;
              uv[gi*2]=tileU*0.5+(u-Math.floor(u))*0.5; uv[gi*2+1]=tileV*0.5+(v-Math.floor(v))*0.5;
            }
          }
        }
        buildingsAABB.push({x0,x1,z0,z1,h});
        buildingVertRanges.push({start:vStart, count:count});
        // rooftop clutter on larger roofs (stairwell housing, tanks, AC units)
        const rw=x1-x0, rd=z1-z0;
        if(h>=13 && rw>9 && rd>9 && hash(bi*41)>0.35 && Math.abs(cx)<880 && Math.abs(cn)<880){
          const nBox=hash(bi*43)>0.6?2:1;
          for(let k=0;k<nBox;k++){
            rooftopItems.push({
              x:lerp(x0+2.5,x1-2.5,hash(bi*47+k*3)), z:lerp(z0+2.5,z1-2.5,hash(bi*53+k*5)), y:h,
              sx:rand(2.2,4.6), sy:rand(1.1,2.6), sz:rand(2.2,4.2), rot:hash(bi*59+k)*0.6-0.3
            });
          }
          if(h>30 && hash(bi*61)>0.5){ // antenna mast
            rooftopItems.push({x:cx, z:-cn, y:h, sx:0.35, sy:rand(4,8), sz:0.35, rot:0});
          }
          if((btype==='commercial'||btype==='office') && h>20 && hash(bi*67)>0.45 && Math.abs(cx)<620 && Math.abs(cn)<620){
            // rooftop advertising tower — part of the Nipponbashi skyline
            signItems.push({x:cx, z:-cn, y:h, sx:rand(5,9.5), sy:rand(1.8,3.2), sz:1.1, rot:hash(bi*71)*0.8-0.4, hue:hash(bi*73)});
          }
        }
        // perch candidates: roof edge midpoints
        if(h>=5 && h<=70 && Math.abs(cx)<850 && Math.abs(cn)<850){
          for(let i=0;i<n;i+= (n>6?2:1)){
            const a=pts[i], b=pts[(i+1)%n];
            const mx=(a[0]+b[0])/2, mz=(a[1]+b[1])/2;
            if(Math.hypot(mx,mz)<820) perchPoints.push({p:V3(mx,h+0.02,mz), popular:hash(bi*31+i)>0.62, kind:'roof'});
          }
          // artificial ledge band (report §H): eaves at 3.2m on one wall
          const a=pts[0], b=pts[1];
          ledgePoints.push({p:V3((a[0]+b[0])/2, Math.min(3.2,h-0.4), (a[1]+b[1])/2), popular:hash(bi*17)>0.7, kind:'ledge'});
        }
      }
      /* X1 (Issue #28): split the merged city geometry into the
         legacy fade mesh plus spatial chunks. The attribute arrays
         above (position / color / normal / uv / aBld) and
         buildingVertRanges are still generated for all 9,079
         buildings in CITYGEO order, exactly as before; the split
         only copies per-building ranges out of those arrays, so
         the union of the fade mesh and every chunk reproduces the
         old merged geometry building by building (the equivalence
         invariant for this unit, replacing the single-geometry
         form used by earlier units).
         Fade-candidate line (specified in the Issue #28 claim
         before implementation): the occlusion fade only runs in
         orbit / follow mode against the camera -> watched-bird
         sight line (findOccludersFrom gathers buildings from an
         8 m corridor around that line), so candidacy is defined
         from the watched bird's activity anchors in this file --
         a building is a fade candidate when its AABB rectangle is
         within X1_FADE_RADIUS (60 m) of a FORAGE site centre
         (plus that site's radius), a DRINK point, or any segment
         of the closed CIRCUIT flight polyline. 60 m exceeds the
         follow camera distance (~11 m), the default orbit radius
         (30 m), the 8 m corridor half-width and the largest site
         radius (16 m) combined, i.e. it encloses the buildings
         that can fall into the near-camera corridor around the
         anchors. Candidates stay in the legacy mesh below and
         their fade path (geometry groups over buildingVertRanges)
         is unchanged. As a second line of defence the chunk
         geometries also keep per-building ranges and
         applyOcclGroups() rebuilds groups on every city geometry,
         so a building outside the line that nevertheless becomes
         an occluder at runtime still fades on its own.
         Non-candidate buildings are assigned to 240 m cells by
         their AABB centre; positions stay in world coordinates,
         so each chunk geometry's bounding sphere gives the
         renderer an independent frustum-culling unit. */
      const x1RectPt=(x0,x1,z0,z1,px,pz)=>{ const dx=Math.max(x0-px,0,px-x1), dz=Math.max(z0-pz,0,pz-z1); return Math.hypot(dx,dz); };
      const x1PtSeg=(px,pz,ax,az,bx,bz)=>{ const vx=bx-ax, vz=bz-az, L2=vx*vx+vz*vz; let t=L2?((px-ax)*vx+(pz-az)*vz)/L2:0; t=t<0?0:(t>1?1:t); return Math.hypot(px-(ax+vx*t), pz-(az+vz*t)); };
      const x1SegInt=(ax,az,bx,bz,cx,cz,dx,dz)=>{ const d1=(dx-cx)*(az-cz)-(dz-cz)*(ax-cx), d2=(dx-cx)*(bz-cz)-(dz-cz)*(bx-cx), d3=(bx-ax)*(cz-az)-(bz-az)*(cx-ax), d4=(bx-ax)*(dz-az)-(bz-az)*(dx-ax); return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0)); };
      const x1RectSeg=(x0,x1,z0,z1,ax,az,bx,bz)=>{
        if(x1RectPt(x0,x1,z0,z1,ax,az)===0||x1RectPt(x0,x1,z0,z1,bx,bz)===0) return 0;
        const cs=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
        for(let e=0;e<4;e++){ const c=cs[e], d=cs[(e+1)%4]; if(x1SegInt(ax,az,bx,bz,c[0],c[1],d[0],d[1])) return 0; }
        let m=Math.min(x1RectPt(x0,x1,z0,z1,ax,az), x1RectPt(x0,x1,z0,z1,bx,bz));
        for(const c of cs) m=Math.min(m, x1PtSeg(c[0],c[1],ax,az,bx,bz));
        return m;
      };
      const x1IsFadeCandidate=bi=>{
        const bb=buildingsAABB[bi];
        for(const f of FORAGE) if(x1RectPt(bb.x0,bb.x1,bb.z0,bb.z1,f.p.x,f.p.z)<=X1_FADE_RADIUS+f.r) return true;
        for(const d of DRINK) if(x1RectPt(bb.x0,bb.x1,bb.z0,bb.z1,d.x,d.z)<=X1_FADE_RADIUS) return true;
        for(let i=0;i<CIRCUIT.length;i++){ const a=CIRCUIT[i], b=CIRCUIT[(i+1)%CIRCUIT.length];
          if(x1RectSeg(bb.x0,bb.x1,bb.z0,bb.z1,a.x,a.z,b.x,b.z)<=X1_FADE_RADIUS) return true; }
        return false;
      };
      const x1SliceGeo=bis=>{
        let tot=0; for(const bi of bis) tot+=buildingVertRanges[bi].count;
        const sp=new Float64Array(tot*3), sc=new Float32Array(tot*3), sn=new Float32Array(tot*3), su=new Float32Array(tot*2), sb=new Float32Array(tot);
        const list=[]; let cur=0;
        for(const bi of bis){ const r=buildingVertRanges[bi];
          sp.set(pos64.subarray(r.start*3,(r.start+r.count)*3), cur*3);
          sc.set(col.subarray(r.start*3,(r.start+r.count)*3), cur*3);
          sn.set(nor.subarray(r.start*3,(r.start+r.count)*3), cur*3);
          su.set(uv.subarray(r.start*2,(r.start+r.count)*2), cur*2);
          sb.set(bld.subarray(r.start,r.start+r.count), cur);
          list.push({bi, start:cur, count:r.count}); cur+=r.count; }
        const gg=new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.Float32BufferAttribute(sp,3));
        gg.setAttribute('color', new THREE.Float32BufferAttribute(sc,3));
        gg.setAttribute('normal', new THREE.Float32BufferAttribute(sn,3));
        gg.setAttribute('uv', new THREE.Float32BufferAttribute(su,2));
        gg.setAttribute('aBld', new THREE.Float32BufferAttribute(sb,1));
        gg.clearGroups(); gg.addGroup(0, tot, 0);
        return {geo:gg, list};
      };
      const x1FadeBis=[], x1ChunkMap=new Map();
      for(let bi=0; bi<B.length; bi++){
        if(x1IsFadeCandidate(bi)){ x1FadeBis.push(bi); continue; }
        const bb=buildingsAABB[bi];
        const k=Math.floor((bb.x0+bb.x1)/2/X1_CELL)+','+Math.floor((bb.z0+bb.z1)/2/X1_CELL);
        if(!x1ChunkMap.has(k)) x1ChunkMap.set(k,[]);
        x1ChunkMap.get(k).push(bi);
      }
      const x1Fade=x1SliceGeo(x1FadeBis);
      const x1Chunks=[]; for(const bis of x1ChunkMap.values()) x1Chunks.push(x1SliceGeo(bis));
      x1State.chunks=x1Chunks.length;
      x1State.fadeBuildings=x1FadeBis.length;
      x1State.chunkedBuildings=B.length-x1FadeBis.length;
      x1State.fadeVerts=x1Fade.geo.attributes.position.count;
      let x1ChunkVerts=0; for(const rec of x1Chunks) x1ChunkVerts+=rec.geo.attributes.position.count;
      x1State.chunkVerts=x1ChunkVerts;
      /* C1: PBR facade material. One shared onBeforeCompile modulates
         the stock MeshStandardMaterial per building via aBld:
         - vertex: wall vertices (normal.y < 0.7) get their vUv.y
           remapped inside the tile row, giving each building its own
           floor height (roofs, whose uv is a flat texel, are excluded);
         - fragment: a per-building brightness / warm-cool tint on the
           diffuse, and a per-building gain on the emissive windows.
         Both city materials share the function and a constant cache
         key so they compile a single program.
         C7 (Issue #26): the same modulation also darkens the building
         base with an AO-like gradient driven by the vertex height
         (position.y, 0-4.5 m). The issue text assigns this to vertex
         colours, but the merged geometry's colour array is a verified
         invariant of the CITYGEO equivalence checks in earlier units;
         doing it here keeps the visual result while leaving CITYGEO,
         the colour array, the vertex count, uv and aBld untouched. */
      const facadeShaderMod=shader=>{
        shader.vertexShader=('attribute float aBld;\nvarying float vBSeed;\nvarying float vC7BaseY;\n'+shader.vertexShader)
          .replace('#include <uv_vertex>', `#include <uv_vertex>
            vBSeed = aBld;
            vC7BaseY = position.y;
            if(normal.y < 0.7){
              float tileRow = floor(vUv.y * 2.0);
              float fv = fract(vUv.y * 2.0);
              float fScale = 0.86 + 0.30 * fract(vBSeed * 7.13);
              float fOff = fract(vBSeed * 13.7) * 0.61;
              vUv.y = (tileRow + fract(fv * fScale + fOff)) * 0.5;
            }`);
        shader.fragmentShader=('varying float vBSeed;\nvarying float vC7BaseY;\n'+shader.fragmentShader)
          .replace('#include <map_fragment>', `#include <map_fragment>
            float bs1 = fract(vBSeed * 7.13);
            float bs2 = fract(vBSeed * 13.7);
            diffuseColor.rgb *= (0.90 + 0.18 * bs1);
            diffuseColor.rgb *= vec3(0.97 + 0.05 * bs2, 1.0, 1.03 - 0.05 * bs2);
            /* C7 (Issue #26): AO-like base gradient, 0.72 at ground
               level rising to 1.0 at 4.5 m (shader-side; the vertex
               colour array is not modified). */
            diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 4.5, vC7BaseY));`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance *= (0.45 + 1.10 * fract(vBSeed * 29.3));`);
      };
      const facadeParams={vertexColors:true, map:facadeTex,
        normalMap:facadeNormalTex, normalScale:new THREE.Vector2(0.85,0.85),
        roughnessMap:facadeRoughTex, roughness:1.0, metalness:0.0,
        emissive:0xffbe78, emissiveMap:facadeEmissiveTex, emissiveIntensity:0};
      const m=new THREE.MeshStandardMaterial(facadeParams);
      m.onBeforeCompile=facadeShaderMod;
      m.customProgramCacheKey=()=>'facade-c1';
      cityMeshMat=m;
      // ghost material (index 1) is assigned per-building via geometry
      // groups when a building blocks the view of the watched pigeon
      cityGhostMat=new THREE.MeshStandardMaterial(Object.assign({}, facadeParams,
        {transparent:true, opacity:1, depthWrite:false}));
      cityGhostMat.onBeforeCompile=facadeShaderMod;
      cityGhostMat.customProgramCacheKey=()=>'facade-c1';
      const mesh=new THREE.Mesh(x1Fade.geo,[m, cityGhostMat]);
      cityMeshRef=mesh;
      cityFadeRecs.push(x1Fade);
      c6Tag(mesh); // C6: buildings enter the planar reflection
      mesh.castShadow=false; mesh.receiveShadow=true;
      scene.add(mesh);
      /* X1 (Issue #28): one mesh per spatial chunk, sharing the
         same two materials as the fade mesh (no new program), the
         same shadow flags (castShadow stays false -- the B5 shadow
         gate is untouched) and a c6Tag each, so every chunk is in
         the C6 reflection layer and frustum-culls independently. */
      for(const rec of x1Chunks){
        const cm=new THREE.Mesh(rec.geo,[m, cityGhostMat]);
        cityFadeRecs.push(rec);
        c6Tag(cm); // C6: chunked buildings also enter the reflection
        cm.castShadow=false; cm.receiveShadow=true;
        scene.add(cm);
      }
      // ledge points were collected separately; merge them into the perch
      // pool so 'ledge' lookups (shelters, two-stage landings) actually hit
      for(const lp of ledgePoints) perchPoints.push(lp);
      // rooftop structures as one instanced mesh
      if(rooftopItems.length){
        const rg=new THREE.BoxGeometry(1,1,1);
        const rm=new THREE.MeshLambertMaterial({color:0x8f8d86});
        const inst=new THREE.InstancedMesh(rg, rm, rooftopItems.length);
        const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(), pv=new THREE.Vector3();
        rooftopItems.forEach((it,i)=>{
          e.set(0,it.rot,0); q.setFromEuler(e); s.set(it.sx,it.sy,it.sz); pv.set(it.x, it.y+it.sy/2, it.z);
          mtx.compose(pv,q,s); inst.setMatrixAt(i,mtx);
        });
        inst.castShadow=false; inst.receiveShadow=true;
        scene.add(inst);
      }
      if(signItems.length){
        const sg=new THREE.BoxGeometry(1,1,1);
        const sm=new THREE.MeshLambertMaterial({color:0xffffff});
        const sinst=new THREE.InstancedMesh(sg, sm, signItems.length);
        const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(), pv=new THREE.Vector3();
        const sc=new THREE.Color();
        signItems.forEach((it,i)=>{
          e.set(0,it.rot,0); q.setFromEuler(e); s.set(it.sx,it.sy,it.sz); pv.set(it.x, it.y+it.sy/2+0.5, it.z);
          mtx.compose(pv,q,s); sinst.setMatrixAt(i,mtx);
          sc.setHSL(it.hue, 0.62, 0.48); sinst.setColorAt(i, sc);
        });
        sinst.castShadow=false;
        scene.add(sinst);
      }
    }


    function ribbon(flat, width, y, color, out){
      // out: {pos,col,nor,uv?} accumulators; pts are [x,north] dm pairs.
      // When out.uv is present (roads geometry only, C4), each vertex
      // also gets a world-planar uv (x/4, z/4) — one texture tile = 4 m.
      const pts=[];
      for(let i=0;i<flat.length;i+=2) pts.push([flat[i]/10, -flat[i+1]/10]);
      const c=new THREE.Color(color);
      for(let i=0;i<pts.length-1;i++){
        const a=pts[i], b=pts[i+1];
        let dx=b[0]-a[0], dz=b[1]-a[1]; const l=Math.hypot(dx,dz)||1; dx/=l; dz/=l;
        const px=-dz*width/2, pz=dx*width/2;
        const quad=[[a[0]+px,a[1]+pz],[b[0]+px,b[1]+pz],[b[0]-px,b[1]-pz],[a[0]-px,a[1]-pz]];
        const tris=[[0,1,2],[0,2,3]];
        for(const t of tris){
          for(const k of t){ out.pos.push(quad[k][0], y, quad[k][1]); out.col.push(c.r,c.g,c.b); out.nor.push(0,1,0);
            if(out.uv) out.uv.push(quad[k][0]/4, quad[k][1]/4); }
        }
      }
    }
    /* C4 (Issue #18): procedural road-surface textures, 256x256, one
       tile = 4 m (matching the world-planar uv (x/4, z/4) ribbon()
       emits for the roads geometry). Fully deterministic hash noise
       (no random calls): an aggregate height field carries 3 px seam
       grooves at the tile edge and centre (128 px); the normal map is
       derived from that height by Sobel with the same formula and sign
       convention as C1's makeFacadeAtlas derivation, and the roughness
       map is base 218, +/-22 of aggregate variation, +18 on the seams. */
    function makeRoadTextures(){
      const S=256;
      const lat=(ix,iy)=>hash(ix*127.1+iy*311.7);
      const vnoise=(x,y)=>{
        const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
        const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
        const a=lat(ix,iy), b=lat(ix+1,iy), c=lat(ix,iy+1), d=lat(ix+1,iy+1);
        return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
      };
      const height=new Float32Array(S*S), rough=new Float32Array(S*S), seam=new Uint8Array(S*S);
      for(let y=0;y<S;y++) for(let x=0;x<S;x++){
        const agg=0.55*vnoise(x/7,y/7)+0.30*vnoise(x/23,y/23)+0.15*lat(x,y);
        const isSeam=(x%128)<3||(y%128)<3;
        const i=y*S+x;
        seam[i]=isSeam?1:0;
        height[i]=clamp(agg-(isSeam?0.5:0), 0, 1);
        rough[i]=clamp(218+(agg-0.5)*44+(isSeam?18:0), 0, 255);
      }
      // normal map: Sobel over the height field (same way and sign
      // convention as the C1 facade derivation)
      const nCv=document.createElement('canvas'); nCv.width=nCv.height=S;
      const ng=nCv.getContext('2d'), nImg=ng.createImageData(S,S), nd=nImg.data;
      const NSTR=2.0;
      for(let y=0;y<S;y++){
        const ym=((y+S-1)%S)*S, y0=y*S, yp=((y+1)%S)*S;
        for(let x=0;x<S;x++){
          const xm=(x+S-1)%S, xp=(x+1)%S;
          const tl=height[ym+xm], tc=height[ym+x], tr=height[ym+xp];
          const ml=height[y0+xm], mr=height[y0+xp];
          const bl=height[yp+xm], bc=height[yp+x], br=height[yp+xp];
          const dx=(tr+2*mr+br)-(tl+2*ml+bl);
          const dy=(bl+2*bc+br)-(tl+2*tc+tr);
          // canvas y runs downward while texture v (flipY) runs upward,
          // so the v slope keeps the canvas Sobel sign
          let nx=-dx*NSTR, ny=dy*NSTR, nz=1;
          const il=1/Math.sqrt(nx*nx+ny*ny+nz*nz);
          const o=(y0+x)*4;
          nd[o]=(nx*il*0.5+0.5)*255; nd[o+1]=(ny*il*0.5+0.5)*255;
          nd[o+2]=(nz*il*0.5+0.5)*255; nd[o+3]=255;
        }
      }
      ng.putImageData(nImg,0,0);
      const rCv=document.createElement('canvas'); rCv.width=rCv.height=S;
      const rg=rCv.getContext('2d'), rImg=rg.createImageData(S,S), rd=rImg.data;
      for(let i=0;i<S*S;i++){
        const v=Math.round(rough[i]), o=i*4;
        rd[o]=rd[o+1]=rd[o+2]=v; rd[o+3]=255;
      }
      rg.putImageData(rImg,0,0);
      const normalTex=new THREE.CanvasTexture(nCv); // linear data: no sRGB
      normalTex.wrapS=normalTex.wrapT=THREE.RepeatWrapping; normalTex.anisotropy=8;
      const roughnessTex=new THREE.CanvasTexture(rCv); // linear data: no sRGB
      roughnessTex.wrapS=roughnessTex.wrapT=THREE.RepeatWrapping; roughnessTex.anisotropy=8;
      return {normalTex, roughnessTex};
    }
    function buildRoadsWater(){
      const acc={pos:[],col:[],nor:[],uv:[]};
      for(const r of CITY.roads) ribbon(r[2], r[0], r[1]?0.09:0.06, r[1]?0x77685a:0x3c4145, acc);
      const g=new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos,3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col,3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor,3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv,2));
      const roadTex=makeRoadTextures();
      roadsMat=new THREE.MeshStandardMaterial({vertexColors:true,
        normalMap:roadTex.normalTex, normalScale:new THREE.Vector2(0.55,0.55),
        roughnessMap:roadTex.roughnessTex, roughness:1.0, metalness:0.0,
        envMapIntensity:0.25});
      const mesh=new THREE.Mesh(g, roadsMat);
      mesh.receiveShadow=true; scene.add(mesh);
      /* C4: curbs as real geometry — for every segment of every
         sidewalk polyline, one BoxGeometry(1, 0.15, 0.24) instance per
         offset side (the ribbon normal (-dz,dx) x width/2, both
         signs), centred on the offset segment midpoint at y 0.105
         (top 0.18, about 9 cm above the 0.09 sidewalk surface),
         oriented and scaled along the segment, all in a single
         InstancedMesh. */
      const curbXforms=[];
      for(const r of CITY.roads){
        if(!r[1]) continue;
        const flat=r[2], width=r[0], pts=[];
        for(let i=0;i<flat.length;i+=2) pts.push([flat[i]/10, -flat[i+1]/10]);
        for(let i=0;i<pts.length-1;i++){
          const a=pts[i], b=pts[i+1];
          let dx=b[0]-a[0], dz=b[1]-a[1];
          const len=Math.hypot(dx,dz); if(len<0.01) continue;
          dx/=len; dz/=len;
          const px=-dz, pz=dx, yaw=Math.atan2(-dz, dx);
          for(const side of [-1,1]){
            curbXforms.push({x:(a[0]+b[0])/2+px*width/2*side,
              z:(a[1]+b[1])/2+pz*width/2*side, yaw, len});
          }
        }
      }
      roadSurface.curbSegments=curbXforms.length;
      if(curbXforms.length){
        const curbInst=new THREE.InstancedMesh(new THREE.BoxGeometry(1,0.15,0.24),
          new THREE.MeshStandardMaterial({color:0x9a9d97, roughness:0.9, envMapIntensity:0.25}),
          curbXforms.length);
        const cm4=new THREE.Matrix4(), cq=new THREE.Quaternion(), ce=new THREE.Euler(),
          cs=new THREE.Vector3(), cpv=new THREE.Vector3();
        curbXforms.forEach((ct,i)=>{
          ce.set(0,ct.yaw,0); cq.setFromEuler(ce);
          cs.set(ct.len,1,1); cpv.set(ct.x,0.105,ct.z);
          cm4.compose(cpv,cq,cs); curbInst.setMatrixAt(i,cm4);
        });
        curbInst.castShadow=false; curbInst.receiveShadow=true;
        scene.add(curbInst);
      }
      // elevated expressway
      const acc2={pos:[],col:[],nor:[]};
      const pillarPts=[];
      for(const e of CITY.elevated){
        ribbon(e[0], 13, 11.5, 0x8b8d89, acc2);
        const f=e[0];
        for(let i=0;i<f.length;i+=2){
          if(i%6===0) pillarPts.push([f[i]/10, -f[i+1]/10]);
        }
      }
      const g2=new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(acc2.pos,3));
      g2.setAttribute('color', new THREE.Float32BufferAttribute(acc2.col,3));
      g2.setAttribute('normal', new THREE.Float32BufferAttribute(acc2.nor,3));
      const mesh2=new THREE.Mesh(g2, new THREE.MeshLambertMaterial({vertexColors:true, side:THREE.DoubleSide}));
      c6Tag(mesh2); // C6: elevated deck enters the planar reflection
      mesh2.castShadow=true; scene.add(mesh2);
      if(pillarPts.length){
        const pg=new THREE.CylinderGeometry(1.1,1.3,11.5,7);
        const pm=new THREE.MeshLambertMaterial({color:0x7c7e7a});
        const inst=new THREE.InstancedMesh(pg, pm, pillarPts.length);
        const mtx=new THREE.Matrix4();
        pillarPts.forEach((p,i)=>{ mtx.makeTranslation(p[0], 5.75, p[1]); inst.setMatrixAt(i, mtx); });
        c6Tag(inst); // C6: elevated pillars enter the planar reflection
        inst.castShadow=false; scene.add(inst);
        // roost points under the expressway (report: 高架下 = communal roost)
        for(let i=0;i<pillarPts.length;i+=2){
          const p=pillarPts[i];
          if(Math.hypot(p[0],p[1])<800) perchPoints.push({p:V3(p[0]+rand(-2,2), 10.6, p[1]+rand(-2,2)), popular:true, kind:'girder'});
        }
      }
      // expressway girder band (deck depth) + translucent sound barriers
      const acc3={pos:[],col:[],nor:[]};
      for(const e of CITY.elevated) ribbon(e[0], 14.2, 10.4, 0x62645e, acc3);
      const g3=new THREE.BufferGeometry();
      g3.setAttribute('position', new THREE.Float32BufferAttribute(acc3.pos,3));
      g3.setAttribute('color', new THREE.Float32BufferAttribute(acc3.col,3));
      g3.setAttribute('normal', new THREE.Float32BufferAttribute(acc3.nor,3));
      const girderMesh=new THREE.Mesh(g3, new THREE.MeshLambertMaterial({vertexColors:true}));
      c6Tag(girderMesh); // C6: elevated girder band enters the planar reflection
      scene.add(girderMesh);
      /* translucent sound barriers: tall (deck 11.5 m → top ≈14.3 m),
         clearly see-through acrylic-style panels — light blue tint,
         low opacity, visible panel seams, steel posts and top/mid rails
         so the wall reads as a barrier (not a solid deck) from street
         level and from the side. The deck behind it stays visible
         through the panels. */
      const bpos=[], bnor=[], framePos=[], postPts=[];
      for(const e of CITY.elevated){
        const f=e[0], pts=[];
        for(let i=0;i<f.length;i+=2) pts.push([f[i]/10, -f[i+1]/10]);
        for(const side of [-1,1]){
          for(let i=0;i<pts.length-1;i++){
            const a=pts[i], b=pts[i+1];
            let dx=b[0]-a[0], dz=b[1]-a[1]; const l=Math.hypot(dx,dz)||1; dx/=l; dz/=l;
            const px=-dz*side, pz=dx*side, ox=px*6.8, oz=pz*6.8;
            const ax=a[0]+ox, az=a[1]+oz, bx=b[0]+ox, bz=b[1]+oz;
            // panel, split at a mid seam (two stacked panes per segment)
            for(const [y0,y1] of [[11.45,12.85],[12.92,14.3]]){
              bpos.push(ax,y0,az, bx,y0,bz, bx,y1,bz, ax,y0,az, bx,y1,bz, ax,y1,az);
              for(let k=0;k<6;k++) bnor.push(px,0,pz);
            }
            // opaque frame bands: bottom rail, mid rail, top rail
            for(const [y0,y1] of [[11.45,11.62],[12.85,12.94],[14.22,14.34]]){
              framePos.push(ax,y0,az, bx,y0,bz, bx,y1,bz, ax,y0,az, bx,y1,bz, ax,y1,az);
            }
            if(i%2===0) postPts.push({x:ax, y:12.9, z:az});
          }
          const last=pts[pts.length-1];
          let dx2=last[0]-pts[pts.length-2][0], dz2=last[1]-pts[pts.length-2][1]; const l2=Math.hypot(dx2,dz2)||1; dx2/=l2; dz2/=l2;
          postPts.push({x:last[0]+(-dz2*side)*6.8, y:12.9, z:last[1]+(dx2*side)*6.8});
        }
      }
      const bg=new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos,3));
      bg.setAttribute('normal', new THREE.Float32BufferAttribute(bnor,3));
      const barrierMesh=new THREE.Mesh(bg, new THREE.MeshPhongMaterial({color:0x9fd4e2, transparent:true, opacity:0.30, shininess:120, specular:0xeaf7ff, side:THREE.DoubleSide, depthWrite:false}));
      barrierMesh.renderOrder=3;
      scene.add(barrierMesh);
      const fg=new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(framePos,3));
      fg.computeVertexNormals();
      const frameMesh=new THREE.Mesh(fg, new THREE.MeshLambertMaterial({color:0x4d565e, side:THREE.DoubleSide}));
      c6Tag(frameMesh); // C6: barrier frame enters the reflection (the translucent panels do not)
      scene.add(frameMesh);
      if(postPts.length){
        const postInst=new THREE.InstancedMesh(new THREE.BoxGeometry(0.2,2.95,0.2), new THREE.MeshLambertMaterial({color:0x424a51}), postPts.length);
        const pm4=new THREE.Matrix4();
        postPts.forEach((p,i)=>{ pm4.makeTranslation(p.x,p.y,p.z); postInst.setMatrixAt(i,pm4); });
        c6Tag(postInst); // C6: barrier posts enter the planar reflection
        postInst.castShadow=false; scene.add(postInst);
      }
      // water: high-contrast flow texture — deep teal base, long bright
      // current streaks, dark troughs and white sun-glints — scrolled in
      // the main loop, plus a second transparent ripple layer scrolling
      // at a different rate so the surface visibly flows and shimmers
      // instead of reading as a flat blue band
      const wcv=document.createElement('canvas'); wcv.width=wcv.height=512;
      const wg2=wcv.getContext('2d');
      const wgrad=wg2.createLinearGradient(0,0,0,512);
      wgrad.addColorStop(0,'#256a84'); wgrad.addColorStop(0.5,'#1d5a75'); wgrad.addColorStop(1,'#276e89');
      wg2.fillStyle=wgrad; wg2.fillRect(0,0,512,512);
      for(let i=0;i<26;i++){ // broad darker current lanes
        wg2.fillStyle='rgba(10,38,52,'+(0.10+Math.random()*0.13)+')';
        wg2.fillRect(0, Math.random()*512, 512, 6+Math.random()*20);
      }
      for(let i=0;i<340;i++){ // bright flow streaks (long, thin, directional)
        wg2.fillStyle='rgba(178,226,242,'+(0.16+Math.random()*0.30)+')';
        wg2.fillRect(Math.random()*512, Math.random()*512, 30+Math.random()*120, 1.6+Math.random()*1.6);
      }
      for(let i=0;i<150;i++){ // dark trough streaks
        wg2.fillStyle='rgba(8,32,44,'+(0.14+Math.random()*0.22)+')';
        wg2.fillRect(Math.random()*512, Math.random()*512, 36+Math.random()*110, 2+Math.random()*2.4);
      }
      for(let i=0;i<210;i++){ // white sun glints (short dashes)
        wg2.fillStyle='rgba(255,255,255,'+(0.35+Math.random()*0.45)+')';
        wg2.fillRect(Math.random()*512, Math.random()*512, 5+Math.random()*16, 1.6);
      }
      waterTex=new THREE.CanvasTexture(wcv);
      waterTex.wrapS=waterTex.wrapT=THREE.RepeatWrapping;
      waterTex.repeat.set(0.085,0.085); waterTex.encoding=THREE.sRGBEncoding;
      waterTex.anisotropy=8;
      // C2: Standard so the river receives scene.environment (sky
      // reflection); roughness below replaces the Phong shininess.
      const wmat=new THREE.MeshStandardMaterial({map:waterTex, roughness:0.34, metalness:0.0, envMapIntensity:1.0});
      waterMatRef=wmat;
      // ripple overlay: wavy light lines on a transparent canvas
      const rcv=document.createElement('canvas'); rcv.width=rcv.height=512;
      const rg2=rcv.getContext('2d');
      rg2.clearRect(0,0,512,512);
      for(let row=0; row<16; row++){
        const y0=row*32+10;
        for(let x=-20;x<512;x+=34){
          rg2.beginPath();
          rg2.strokeStyle='rgba(230,248,255,'+(0.35+Math.random()*0.3)+')';
          rg2.lineWidth=2.2;
          rg2.arc(x+((row%2)*17), y0, 13, Math.PI*1.12, Math.PI*1.88);
          rg2.stroke();
        }
      }
      rippleTex=new THREE.CanvasTexture(rcv);
      rippleTex.wrapS=rippleTex.wrapT=THREE.RepeatWrapping;
      rippleTex.repeat.set(0.085,0.085); rippleTex.encoding=THREE.sRGBEncoding;
      const rmat=new THREE.MeshBasicMaterial({map:rippleTex, transparent:true, opacity:0.5, depthWrite:false});
      /* C6: share the ripple texture (and its live scroll offset) with
         the reflection overlay material */
      c6ReflMat.uniforms.tRipple.value=rippleTex;
      c6ReflMat.uniforms.uRippleOff.value=rippleTex.offset;
      for(const w of CITY.water){
        const shape=new THREE.Shape();
        for(let i=0;i<w.length;i+=2){
          const x=w[i]/10, nn=w[i+1]/10;
          if(i===0) shape.moveTo(x, nn); else shape.lineTo(x, nn);
        }
        shape.closePath();
        const wg=new THREE.ShapeGeometry(shape);
        const wm=new THREE.Mesh(wg, wmat);
        wm.rotation.x=-Math.PI/2; wm.position.y=0.35;
        scene.add(wm);
        const rm=new THREE.Mesh(wg, rmat);
        rm.rotation.x=-Math.PI/2; rm.position.y=0.44; rm.renderOrder=2;
        scene.add(rm);
        /* C6: reflection overlay — same geometry as the water polygon,
           between the water surface and the ripple layer; visibility
           follows the quality-linked reflection state */
        const om=new THREE.Mesh(wg, c6ReflMat);
        om.rotation.x=-Math.PI/2; om.position.y=0.40; om.renderOrder=1;
        om.visible=false;
        scene.add(om); c6Overlays.push(om);
        if(!c6WaterBase) c6WaterBase=wm;
      }
      // ground
      groundMat=new THREE.MeshLambertMaterial({color:0x585c52});
      const ground=new THREE.Mesh(new THREE.CircleGeometry(2400, 40), groundMat);
      ground.rotation.x=-Math.PI/2; ground.position.y=-0.05; ground.receiveShadow=true;
      scene.add(ground);
      // street trees: river walk + main avenues (instanced trunk + canopy)
      const treePts=[];
      for(let x=-430;x<=330;x+=27){ treePts.push([x+rand(-3,3), -228+rand(-2,2)]); treePts.push([x+rand(-3,3), -256+rand(-2,2)]); }
      for(let z=-420;z<=430;z+=34){ treePts.push([44+rand(-2,2), z]); treePts.push([-484+rand(-2,2), z+rand(-4,4)]); }
      for(let x=-520;x<=420;x+=38){ treePts.push([x, 44+rand(-2,2)]); }
      const trunkG=new THREE.CylinderGeometry(0.14,0.2,2.6,5);
      const trunkM=new THREE.MeshLambertMaterial({color:0x5a4632});
      const canG=new THREE.IcosahedronGeometry(1.9,1);
      const canM=new THREE.MeshLambertMaterial({color:0x4d7038});
      const trunks=new THREE.InstancedMesh(trunkG,trunkM,treePts.length);
      const cans=new THREE.InstancedMesh(canG,canM,treePts.length);
      canopyMesh=cans;
      const mtx=new THREE.Matrix4(), qI=new THREE.Quaternion(), sc=new THREE.Vector3(), pv=new THREE.Vector3();
      const cc=new THREE.Color();
      treePts.forEach((tp,i)=>{
        const s=rand(0.8,1.35);
        pv.set(tp[0],1.3*s,tp[1]); sc.set(s,s,s); mtx.compose(pv,qI,sc); trunks.setMatrixAt(i,mtx);
        pv.set(tp[0],(2.6+1.5)*s,tp[1]); sc.set(s*rand(0.9,1.2),s*rand(0.8,1.05),s*rand(0.9,1.2)); mtx.compose(pv,qI,sc); cans.setMatrixAt(i,mtx);
        canopyBase.push({x:tp[0], y:pv.y, z:tp[1], sx:sc.x, sy:sc.y, sz:sc.z});
        cc.setHSL(0.29+hash(i*7)*0.05, 0.32, 0.3+hash(i*11)*0.1); cans.setColorAt(i,cc);
      });
      cans.castShadow=false;
      scene.add(trunks); scene.add(cans);
    }

    /* street-level props: lamps, utility poles + wires, vending machines,
       manholes, zebra crossings, projecting shop signs — the layer that
       makes the city read as real when the camera comes down to the street */
    function buildStreetProps(){
      const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), eu=new THREE.Euler(), sv=new THREE.Vector3(), pv=new THREE.Vector3();
      const cc=new THREE.Color();
      function inst(geo, mat, items, colored){
        if(!items.length) return;
        const im=new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((it,i)=>{
          eu.set(0, it.rot||0, 0); q.setFromEuler(eu);
          sv.set(it.sx||1, it.sy||1, it.sz||1); pv.set(it.x, it.y, it.z);
          mtx.compose(pv,q,sv); im.setMatrixAt(i,mtx);
          if(colored) im.setColorAt(i, cc.set(it.c));
        });
        im.castShadow=false; im.receiveShadow=true; scene.add(im);
      }
      // street lamps along Sakaisuji (x≈30) and Sennichimae-dori (z≈26)
      const lampPoles=[], lampHeads=[];
      for(let z=-400; z<=420; z+=46){
        lampPoles.push({x:40,y:3,z}); lampHeads.push({x:40,y:6.05,z});
        lampPoles.push({x:20,y:3,z:z+23}); lampHeads.push({x:20,y:6.05,z:z+23});
      }
      for(let x=-440; x<=400; x+=52){ lampPoles.push({x,y:3,z:16}); lampHeads.push({x,y:6.05,z:16}); }
      inst(new THREE.CylinderGeometry(0.09,0.12,6,6), new THREE.MeshLambertMaterial({color:0x3f4448}), lampPoles);
      inst(new THREE.SphereGeometry(0.17,8,6), new THREE.MeshBasicMaterial({color:0xffe9b8}), lampHeads);
      /* ---- utility poles + overhead wires ----
         Thicker 11 m poles on the main sidewalks as well as the back
         streets, two crossarm levels, transformer cans on some poles,
         and wires drawn as real tube segments (instanced cylinders,
         3 sub-segments per span with a visible sag, 4 wires per span in
         a bundle) — 1 px line segments were not discriminable at
         street level, tubes are. */
      const poles=[], arms=[], trans=[];
      const wireSegs=[]; // {mx,my,mz, len, qx,qy,qz,qw}
      const upAxis=new THREE.Vector3(0,1,0), tmpDir=new THREE.Vector3(), tmpQ=new THREE.Quaternion();
      function addWireBundle(ax,ay,az, bx,by,bz, px,pz){
        // 4 wires: three across the main crossarm, one on the lower arm
        // C3: bundle spacing widened via the shared WIRE_OFFS table
        const offs=WIRE_OFFS;
        for(const [off,dy] of offs){
          const x0=ax+px*off, z0=az+pz*off, x1=bx+px*off, z1=bz+pz*off, y0=ay+dy, y1=by+dy;
          let prevP=new THREE.Vector3(x0,y0,z0);
          for(let sIdx=1;sIdx<=3;sIdx++){
            const t=sIdx/3, sag=Math.sin(t*Math.PI)*0.55;
            const cur=new THREE.Vector3(lerp(x0,x1,t), lerp(y0,y1,t)-sag, lerp(z0,z1,t));
            tmpDir.copy(cur).sub(prevP);
            const len=tmpDir.length();
            if(len>0.01){
              tmpQ.setFromUnitVectors(upAxis, tmpDir.normalize());
              wireSegs.push({mx:(prevP.x+cur.x)/2, my:(prevP.y+cur.y)/2, mz:(prevP.z+cur.z)/2,
                len:len, qx:tmpQ.x, qy:tmpQ.y, qz:tmpQ.z, qw:tmpQ.w});
            }
            prevP=cur;
          }
        }
      }
      const runs=[
        {x0:-64,z0:60,x1:-64,z1:420,step:40}, {x0:-380,z0:470,x1:300,z1:470,step:44},
        {x0:43,z0:-140,x1:43,z1:430,step:38},           // Sakaisuji east sidewalk
        {x0:16.5,z0:-60,x1:16.5,z1:330,step:39},        // Sakaisuji west sidewalk
        {x0:-360,z0:44,x1:300,z1:44,step:42},           // Sennichimae south side
        {x0:-420,z0:452,x1:240,z1:452,step:44},         // Nansan-dori
      ];
      for(const r of runs){
        const n=Math.max(1, Math.round(Math.hypot(r.x1-r.x0, r.z1-r.z0)/r.step));
        const rdx=(r.x1-r.x0)/(Math.hypot(r.x1-r.x0, r.z1-r.z0)||1), rdz=(r.z1-r.z0)/(Math.hypot(r.x1-r.x0, r.z1-r.z0)||1);
        const px=-rdz, pz=rdx; // perpendicular (crossarm direction)
        let prev=null;
        for(let i=0;i<=n;i++){
          const t=i/n, x=lerp(r.x0,r.x1,t), z=lerp(r.z0,r.z1,t);
          poles.push({x, y:5.5, z});
          polePlacements.push({x, z, px, pz});
          arms.push({x, y:10.55, z, sx:Math.abs(px)*2.6+0.14, sy:0.14, sz:Math.abs(pz)*2.6+0.14});
          arms.push({x, y:9.6, z, sx:Math.abs(px)*1.9+0.12, sy:0.12, sz:Math.abs(pz)*1.9+0.12});
          if(hash(x*0.37+z*0.91)>0.62) trans.push({x:x+px*0.55, y:9.7, z:z+pz*0.55});
          if(prev) addWireBundle(prev[0],10.62,prev[1], x,10.62,z, px,pz);
          prev=[x,z];
        }
      }
      inst(new THREE.CylinderGeometry(0.17,0.24,11,9), new THREE.MeshLambertMaterial({color:0x3e382e}), poles);
      inst(new THREE.BoxGeometry(1,1,1), new THREE.MeshLambertMaterial({color:0x3e382e}), arms);
      inst(new THREE.CylinderGeometry(0.34,0.34,0.95,10), new THREE.MeshLambertMaterial({color:0x707880}), trans);
      streetPropCounts.poles=poles.length;
      if(wireSegs.length){
        const wim=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035,0.035,1,5),
          new THREE.MeshBasicMaterial({color:0x14161a}), wireSegs.length);
        const wm4=new THREE.Matrix4(), wq=new THREE.Quaternion(), wsv=new THREE.Vector3(), wpv=new THREE.Vector3();
        wireSegs.forEach((s,i)=>{
          wq.set(s.qx,s.qy,s.qz,s.qw); wsv.set(1,s.len,1); wpv.set(s.mx,s.my,s.mz);
          wm4.compose(wpv,wq,wsv); wim.setMatrixAt(i,wm4);
        });
        wim.castShadow=false; scene.add(wim);
        streetPropCounts.wires=wireSegs.length;
      }
      /* ---- vending machines ----
         A coloured box alone did not read as a vending machine. Each
         machine now carries a lit front panel (canvas texture): brand-
         free drink window with two rows of cans, price strips, selector
         buttons, coin / bill slots and a pickup flap — drawn unlit
         (MeshBasicMaterial) so it stays readable in shade. */
      function vendingTexture(main, label){
        const cv=document.createElement('canvas'); cv.width=256; cv.height=432;
        const c=cv.getContext('2d');
        c.fillStyle=main; c.fillRect(0,0,256,432);
        c.fillStyle='rgba(255,255,255,.96)'; c.fillRect(10,10,236,52); // lit header
        c.fillStyle='#17303c'; c.font='900 30px "Zen Kaku Gothic New", sans-serif';
        c.textAlign='center'; c.textBaseline='middle';
        c.fillText(label, 128, 37);
        c.fillStyle='#10222c'; c.fillRect(14,74,168,196); // display window
        c.fillStyle='rgba(160,210,235,.28)'; c.fillRect(14,74,168,196);
        const canCols=['#d23b2e','#2456a8','#2e9e6e','#e8a713','#e8e8e8','#7a5fb0','#e07b26','#3aa6c9'];
        for(let row=0;row<2;row++) for(let k=0;k<6;k++){
          const x=22+k*27, y=88+row*88;
          c.fillStyle=canCols[(k+row*3)%8]; c.fillRect(x,y,19,52);
          c.fillStyle='rgba(255,255,255,.85)'; c.fillRect(x,y+8,19,12);
          c.fillStyle='#f5f2e8'; c.fillRect(x-2,y+60,23,13); // price strip
          c.fillStyle='#333'; c.font='700 10px sans-serif'; c.fillText('120', x+9, y+67);
        }
        c.font='900 30px "Zen Kaku Gothic New", sans-serif';
        c.fillStyle='#20262b'; c.fillRect(192,74,50,196); // control column
        c.fillStyle='#ffd94d'; c.beginPath(); c.arc(217,104,13,0,Math.PI*2); c.fill(); // coin slot glow
        c.fillStyle='#0c0e10'; c.fillRect(211,98,12,3);
        c.fillStyle='#cfd6da'; c.fillRect(200,132,34,10); // bill slot
        c.fillStyle='#0c0e10'; c.fillRect(203,135,28,3);
        for(let k=0;k<4;k++){ c.fillStyle=k%2?'#8f979e':'#d8dde0'; c.beginPath(); c.arc(217,168+k*24,8,0,Math.PI*2); c.fill(); }
        c.fillStyle='#14181c'; c.fillRect(14,292,228,104); // pickup flap
        c.fillStyle='rgba(255,255,255,.16)'; c.fillRect(14,292,228,10);
        c.fillStyle='#e8eef2'; c.font='700 21px "Zen Kaku Gothic New", sans-serif';
        c.fillText('お受け取り口', 128, 352);
        c.fillStyle='rgba(0,0,0,.25)'; c.fillRect(0,420,256,12);
        const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=8;
        return t;
      }
      const vendDefs=[
        {main:'#c22e22', label:'ドリンク'}, {main:'#1d4f9c', label:'DRINK'}, {main:'#e8e8e8', label:'つめた〜い'},
        {main:'#1e7a46', label:'ドリンク'}, {main:'#d96c1e', label:'DRINK'},
      ];
      const vendTex=vendDefs.map(d=>vendingTexture(d.main, d.label));
      const vendSideMats=vendDefs.map(d=>new THREE.MeshLambertMaterial({color:new THREE.Color(d.main)}));
      let vendCount=0;
      function addVending(x, z, faceRotY, vi){
        vendPlacements.push({x, z, rot:faceRotY});
        const grp=new THREE.Group(); grp.position.set(x,0,z); grp.rotation.y=faceRotY;
        const body=new THREE.Mesh(new THREE.BoxGeometry(1.18,1.92,0.74), vendSideMats[vi%5]);
        body.position.y=0.98; body.castShadow=true; grp.add(body);
        const front=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.86),
          new THREE.MeshBasicMaterial({map:vendTex[vi%5]}));
        front.position.set(0,0.98,0.375); grp.add(front);
        const base=new THREE.Mesh(new THREE.BoxGeometry(1.22,0.1,0.78), new THREE.MeshLambertMaterial({color:0x232629}));
        base.position.y=0.05; grp.add(base);
        scene.add(grp); vendCount++;
      }
      // Sakaisuji west side: fronts face the street (+x)
      const vendZ=[-96,-38,22,86,148,214,286,338];
      vendZ.forEach((z,i)=>addVending(17.6, z, Math.PI/2, i));
      // Nansan-dori (z≈452 street): fronts face the street (-z)
      [-120,-52,36,118,196].forEach((x,i)=>addVending(x, 446, Math.PI, i+2));
      // by the station / market entrances
      addVending(-14, 58, -Math.PI/2, 1); addVending(96, -52, Math.PI/2, 3);
      streetPropCounts.vending=vendCount;
      /* ---- manholes ----
         Larger (ø1.1 m) textured covers: raised rim ring, concentric
         pattern, dot grid and a 下水道 legend in the canvas texture, so
         a cover reads as a manhole — not a dark smudge — at street
         level. Denser placement, including beside the foraging sites
         and the main crossings. */
      const holeTex=(()=>{ 
        const cv=document.createElement('canvas'); cv.width=cv.height=256;
        const c=cv.getContext('2d');
        c.fillStyle='#26292d'; c.fillRect(0,0,256,256);
        c.beginPath(); c.arc(128,128,124,0,Math.PI*2); c.fillStyle='#3a3f45'; c.fill();
        c.beginPath(); c.arc(128,128,110,0,Math.PI*2); c.fillStyle='#2e3237'; c.fill();
        c.lineWidth=5; c.strokeStyle='#585f66';
        c.beginPath(); c.arc(128,128,96,0,Math.PI*2); c.stroke();
        c.beginPath(); c.arc(128,128,58,0,Math.PI*2); c.stroke();
        c.fillStyle='#4a5057';
        for(let ry=0;ry<7;ry++) for(let rx=0;rx<7;rx++){
          const dx=rx*26-78, dy=ry*26-78;
          if(dx*dx+dy*dy<8100 && dx*dx+dy*dy>3400){ c.beginPath(); c.arc(128+dx,128+dy,6,0,Math.PI*2); c.fill(); }
        }
        c.fillStyle='#c9ced3'; c.font='900 30px "Zen Kaku Gothic New", sans-serif';
        c.textAlign='center'; c.textBaseline='middle'; c.fillText('下水道', 128, 128);
        const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=8; return t;
      })();
      const holes=[];
      for(let z=-390; z<=420; z+=29) holes.push({x:26.5+(hash(z)*7-3.5), y:0.125, z});
      for(let z=-390; z<=420; z+=34) holes.push({x:36+(hash(z*1.7)*6-3), y:0.125, z:z+14});
      for(let x=-420; x<=380; x+=33) holes.push({x:x+(hash(x)*6-3), y:0.125, z:20.5});
      holes.push({x:22,y:0.125,z:-6},{x:12,y:0.125,z:288},{x:-104,y:0.125,z:-228},{x:104,y:0.125,z:-58});
      const holeGeo=new THREE.CircleGeometry(0.56,24); holeGeo.rotateX(-Math.PI/2);
      inst(holeGeo, new THREE.MeshBasicMaterial({map:holeTex}), holes);
      const rims=[];
      for(const h of holes) rims.push({x:h.x, y:0.12, z:h.z});
      const rimGeo=new THREE.RingGeometry(0.56,0.66,24); rimGeo.rotateX(-Math.PI/2);
      inst(rimGeo, new THREE.MeshLambertMaterial({color:0x565c62}), rims);
      streetPropCounts.manholes=holes.length;
      /* ---- zebra crossings + road markings ----
         Bigger, brighter zebra bars (unlit white) at the main
         intersections, plus stop lines, dashed centre lines on the
         two main avenues and white direction arrows, so the carriage-
         way reads as a marked Japanese road from street level. */
      const stripes=[];
      function crosswalk(cx, cz, alongZ){
        for(let k=-4;k<=4;k++){
          if(alongZ) stripes.push({x:cx+k*1.5, y:0.13, z:cz, sx:0.62, sy:0.03, sz:4.6});
          else stripes.push({x:cx, y:0.13, z:cz+k*1.5, sx:4.6, sy:0.03, sz:0.62});
        }
        // stop line just before the crossing
        if(alongZ) stripes.push({x:cx, y:0.13, z:cz-4.4, sx:11.5, sy:0.03, sz:0.55});
        else stripes.push({x:cx-4.4, y:0.13, z:cz, sx:0.55, sy:0.03, sz:11.5});
      }
      crosswalk(30,40,true); crosswalk(44,26,false);
      crosswalk(-498,40,true); crosswalk(-484,26,false);
      crosswalk(30,452,true); crosswalk(44,438,false);
      crosswalk(30,-232,true); crosswalk(44,-246,false);
      // dashed centre lines (skip the crossing zones)
      for(let z=-400; z<=430; z+=9){
        if(Math.abs(z-33)<13 || Math.abs(z-445)<13 || Math.abs(z+239)<13) continue;
        stripes.push({x:30, y:0.125, z, sx:0.2, sy:0.025, sz:3.4});
      }
      for(let x=-430; x<=390; x+=9){
        if(Math.abs(x-37)<13 || Math.abs(x+491)<13) continue;
        stripes.push({x, y:0.125, z:26, sx:3.4, sy:0.025, sz:0.2});
      }
      inst(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xf4f4ee}), stripes);
      streetPropCounts.stripes=stripes.length;
      // direction arrows painted on the lanes
      const arrowTex=(()=>{ 
        const cv=document.createElement('canvas'); cv.width=128; cv.height=256;
        const c=cv.getContext('2d'); c.clearRect(0,0,128,256);
        c.fillStyle='rgba(245,245,240,.95)';
        c.beginPath(); c.moveTo(64,8); c.lineTo(116,96); c.lineTo(80,96); c.lineTo(80,248); c.lineTo(48,248); c.lineTo(48,96); c.lineTo(12,96); c.closePath(); c.fill();
        const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; return t;
      })();
      const arrowGeo=new THREE.PlaneGeometry(1.7,3.4); arrowGeo.rotateX(-Math.PI/2);
      const arrowMat=new THREE.MeshBasicMaterial({map:arrowTex, transparent:true, depthWrite:false});
      for(const [ax,az,arot] of [[24,120,0],[36,-80,Math.PI],[24,300,0],[-140,20,Math.PI/2],[160,32,-Math.PI/2],[-300,20,Math.PI/2]]){
        const am=new THREE.Mesh(arrowGeo, arrowMat);
        am.position.set(ax,0.135,az); am.rotation.y=arot; am.renderOrder=1; scene.add(am);
      }
      /* ---- projecting shop signs (sode-kanban) ----
         Coloured boxes alone did not read. Each sign now protrudes on
         a steel arm and carries vertical Japanese lettering (generic
         shop categories, no real brands) as an unlit canvas texture
         on both broad faces, so the text is legible from the street. */
      function sleeveTexture(bg, fg, word, sub){
        const cv=document.createElement('canvas'); cv.width=192; cv.height=512;
        const c=cv.getContext('2d');
        c.fillStyle=bg; c.fillRect(0,0,192,512);
        c.lineWidth=8; c.strokeStyle=fg; c.strokeRect(12,12,168,488);
        c.fillStyle=fg; c.textAlign='center'; c.textBaseline='middle';
        c.beginPath(); c.arc(96,60,27,0,Math.PI*2); c.lineWidth=5; c.stroke();
        c.beginPath(); c.arc(96,60,7,0,Math.PI*2); c.fill();
        c.font='900 62px "Zen Kaku Gothic New", serif';
        const chars=word.split('');
        chars.forEach((ch,i)=>{ c.fillText(ch, 96, 148+i*74); });
        c.font='700 24px "Zen Kaku Gothic New", sans-serif'; c.fillText(sub, 96, 472);
        const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.anisotropy=8; return t;
      }
      const sleeveDefs=[
        {bg:'#c22e22', fg:'#ffffff', word:'薬局', sub:'くすり'},
        {bg:'#f2ede2', fg:'#8c2f22', word:'喫茶', sub:'コーヒー'},
        {bg:'#1d4f9c', fg:'#ffffff', word:'電器店', sub:'でんき'},
        {bg:'#e8a713', fg:'#26221a', word:'古本', sub:'ブック'},
        {bg:'#1e7a46', fg:'#ffffff', word:'そば', sub:'手打ち'},
        {bg:'#7a3fa0', fg:'#ffffff', word:'カラオケ', sub:'うた'},
        {bg:'#f2ede2', fg:'#1d4f9c', word:'眼鏡', sub:'めがね'},
        {bg:'#26262b', fg:'#f2c14e', word:'洋食', sub:'グリル'},
        {bg:'#c22e22', fg:'#ffffff', word:'ゲーム', sub:'あそび'},
        {bg:'#f2ede2', fg:'#26221a', word:'質屋', sub:'おかね'},
      ];
      const sleeveTex=sleeveDefs.map(d=>sleeveTexture(d.bg, d.fg, d.word, d.sub));
      const sleeveSideMats=sleeveDefs.map(d=>new THREE.MeshLambertMaterial({color:new THREE.Color(d.bg)}));
      let sleeveCount=0;
      function addSleeveSign(wallX, z, dirX, di){
        // dirX=+1: sign protrudes toward +x from a wall at wallX
        const cy=3.6+hash(z*1.31+wallX)*1.1;
        sleevePlacements.push({x:wallX+dirX*0.62, y:cy, z, dirX, di:di%10});
        const grp=new THREE.Group(); grp.position.set(wallX+dirX*0.62, cy, z);
        const body=new THREE.Mesh(new THREE.BoxGeometry(1.05,2.35,0.17), sleeveSideMats[di%10]);
        grp.add(body);
        for(const s of [-1,1]){
          const face=new THREE.Mesh(new THREE.PlaneGeometry(0.95,2.25),
            new THREE.MeshBasicMaterial({map:sleeveTex[di%10]}));
          face.position.z=s*0.088; if(s<0) face.rotation.y=Math.PI;
          grp.add(face);
        }
        const arm=new THREE.Mesh(new THREE.BoxGeometry(1.35,0.09,0.09),
          new THREE.MeshLambertMaterial({color:0x33383d}));
        arm.position.set(-dirX*0.55, 1.02, 0); grp.add(arm);
        const arm2=arm.clone(); arm2.position.y=0.55; grp.add(arm2);
        scene.add(grp); sleeveCount++;
      }
      let sdi=0;
      for(let z=-120; z<=420; z+=34){ if(hash(z*0.7)>0.25) addSleeveSign(18.6, z+rand(-3,3), 1, sdi++); }
      for(let z=-320; z<=-40; z+=32){ if(hash(z*1.9)>0.4) addSleeveSign(-398, z, 1, sdi++); }
      streetPropCounts.sleeveSigns=sleeveCount;
    }

    /* ================= C3 near-distance layer (Issue #17) =================
       Five close-range detail sets that only need to resolve at
       5–20 m (barrier: from the expressway viewpoint). Everything is
       a separate mesh added on top of the existing scene — the merged
       CITYGEO vertex data, C1 facade shader, B5 shadow gate and C2
       environment are untouched. Budget: +3 canvas textures, +7 nodes
       (instanced / merged geometry only), castShadow=false throughout,
       new MeshStandardMaterials carry envMapIntensity 0.7 (C2 rule),
       materials are module-shared instances (B3 rule). */
    const nearDarkMetalMat=new THREE.MeshStandardMaterial({color:0x2e343a, metalness:0.65, roughness:0.45, envMapIntensity:0.7});
    const nearRailMat=new THREE.MeshStandardMaterial({color:0x3a4249, metalness:0.6, roughness:0.5, envMapIntensity:0.7});
    function buildNearLayerC3(){
      const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), eu=new THREE.Euler(),
        sv=new THREE.Vector3(), pv=new THREE.Vector3();
      function instanced(geo, mat, items){
        if(!items.length) return null;
        const im=new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((it,i)=>{
          eu.set(it.rx||0, it.rot||0, it.rz||0); q.setFromEuler(eu);
          sv.set(it.sx||1, it.sy||1, it.sz||1); pv.set(it.x, it.y, it.z);
          mtx.compose(pv,q,sv); im.setMatrixAt(i,mtx);
        });
        im.castShadow=false; im.receiveShadow=true; scene.add(im);
        return im;
      }
      /* merged-quad accumulator: pos/nor/uv arrays, one geometry out */
      function quadSink(){
        return {pos:[], nor:[], uv:[],
          push(verts, normal, uvs){
            // verts: 4 corners [x,y,z] in order BL,BR,TR,TL (outward)
            const idx=[[0,1,2],[0,2,3]];
            for(const t of idx) for(const k of t){
              this.pos.push(verts[k][0], verts[k][1], verts[k][2]);
              this.nor.push(normal[0], normal[1], normal[2]);
              this.uv.push(uvs[k][0], uvs[k][1]);
            }
          },
          build(mat, renderOrder){
            const g=new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos,3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor,3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv,2));
            const mesh=new THREE.Mesh(g, mat);
            mesh.castShadow=false; mesh.receiveShadow=false;
            if(renderOrder!==undefined) mesh.renderOrder=renderOrder;
            scene.add(mesh); return mesh;
          }};
      }

      /* ---- 1. sound-barrier posts + top/bottom rails (expressway) ----
         Seam positions are recomputed from CITY.elevated with the same
         offset math buildRoadsWater() uses for the translucent panels
         (panels themselves are untouched). Posts stand at every panel
         joint over the full 11.45–14.30 m height; rails run per segment
         along the top and bottom edges. */
      {
        const posts=[], rails=[];
        for(const e of CITY.elevated){
          const f=e[0], pts=[];
          for(let i=0;i<f.length;i+=2) pts.push([f[i]/10, -f[i+1]/10]);
          for(const side of [-1,1]){
            for(let i=0;i<pts.length;i++){
              const a=pts[i];
              const b=pts[Math.min(i+1, pts.length-1)], pb=pts[Math.max(i-1,0)];
              let dx=(i<pts.length-1? b[0]-a[0] : a[0]-pb[0]), dz=(i<pts.length-1? b[1]-a[1] : a[1]-pb[1]);
              const l=Math.hypot(dx,dz)||1; dx/=l; dz/=l;
              posts.push({x:a[0]+(-dz*side)*6.8, y:12.875, z:a[1]+(dx*side)*6.8});
            }
            for(let i=0;i<pts.length-1;i++){
              const a=pts[i], b=pts[i+1];
              let dx=b[0]-a[0], dz=b[1]-a[1]; const l=Math.hypot(dx,dz)||1; dx/=l; dz/=l;
              const ox=(-dz*side)*6.8, oz=(dx*side)*6.8;
              const mx=(a[0]+b[0])/2+ox, mz=(a[1]+b[1])/2+oz, rot=Math.atan2(-dz,dx);
              rails.push({x:mx, y:14.26, z:mz, sx:l, sy:0.1, sz:0.09, rot});
              rails.push({x:mx, y:11.52, z:mz, sx:l, sy:0.12, sz:0.09, rot});
            }
          }
        }
        instanced(new THREE.BoxGeometry(0.17,2.85,0.17), nearDarkMetalMat, posts);
        instanced(new THREE.BoxGeometry(1,1,1), nearRailMat, rails);
        nearLayerCounts.barrierPosts=posts.length;
        nearLayerCounts.barrierRails=rails.length;
      }

      /* ---- 2. vending-machine price tags ----
         One shared canvas (3×2 price cells, plain numerals only), one
         merged geometry of small unlit planes on every machine front,
         each plane UV-baked to its own cell. */
      {
        const prices=['110','120','130','150','180','200'];
        const cv=document.createElement('canvas'); cv.width=384; cv.height=128;
        const c=cv.getContext('2d');
        prices.forEach((p,i)=>{
          const cx=(i%3)*128, cy=Math.floor(i/3)*64;
          c.fillStyle=i%2?'#fdf6d8':'#eaf4ff'; c.fillRect(cx,cy,128,64);
          c.strokeStyle='#8a8f96'; c.lineWidth=3; c.strokeRect(cx+2,cy+2,124,60);
          c.fillStyle='#1c2733'; c.font='900 40px "Zen Kaku Gothic New", sans-serif';
          c.textAlign='center'; c.textBaseline='middle';
          c.fillText(p, cx+64, cy+34);
        });
        const tex=new THREE.CanvasTexture(cv); tex.encoding=THREE.sRGBEncoding; tex.anisotropy=8;
        const mat=new THREE.MeshBasicMaterial({map:tex});
        const sink=quadSink(); let n=0;
        for(const v of vendPlacements){
          const fx=Math.sin(v.rot), fz=Math.cos(v.rot);   // front direction
          const rx=Math.cos(v.rot), rz=-Math.sin(v.rot);  // right direction
          for(let k=0;k<6;k++){
            const lx=-0.44+k*0.176, cy=1.32, hw=0.078, hh=0.055, d=0.386;
            const cxp=v.x+rx*lx+fx*d, czp=v.z+rz*lx+fz*d;
            const col=k%3, row=Math.floor(k/3);
            const u0=col/3, u1=(col+1)/3, v1=1-row/2, v0=1-(row+1)/2;
            sink.push([
              [cxp-rx*hw, cy-hh, czp-rz*hw], [cxp+rx*hw, cy-hh, czp+rz*hw],
              [cxp+rx*hw, cy+hh, czp+rz*hw], [cxp-rx*hw, cy+hh, czp-rz*hw]],
              [fx,0,fz], [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);
            n++;
          }
        }
        if(n) sink.build(mat);
        nearLayerCounts.pricePlanes=n;
      }

      /* ---- 3. sleeve signs: dedicated atlas cells + support arms ----
         One atlas canvas (6×5 portrait cells); every sign gets its own
         cell with a distinct generic trade word in vertical lettering.
         Overlay planes sit just proud of both broad faces, UV-baked to
         the sign's cell and wound so the text reads correctly from
         both sides. Support arms are one InstancedMesh. */
      {
        const words=['食堂','喫茶','薬局','本屋','理髪','酒店','花屋','時計','眼鏡','写真',
          '電器','洋食','そば','古本','質屋','靴屋','文具','パン','寿司','菓子'];
        const bgs=['#c22e22','#f2ede2','#1d4f9c','#e8a713','#1e7a46','#7a3fa0','#26262b','#0f766e'];
        const COLS=6, ROWS=5, CW=128, CH=256;
        const cv=document.createElement('canvas'); cv.width=COLS*CW; cv.height=ROWS*CH;
        const c=cv.getContext('2d');
        const nCells=Math.min(sleevePlacements.length, COLS*ROWS);
        for(let i=0;i<nCells;i++){
          const cx=(i%COLS)*CW, cy=Math.floor(i/COLS)*CH;
          const bg=bgs[i%bgs.length], fg=(i%bgs.length===1||i%bgs.length===3)?'#26221a':'#ffffff';
          c.fillStyle=bg; c.fillRect(cx,cy,CW,CH);
          c.lineWidth=6; c.strokeStyle=fg; c.strokeRect(cx+8,cy+8,CW-16,CH-16);
          c.fillStyle=fg; c.textAlign='center'; c.textBaseline='middle';
          c.font='900 56px "Zen Kaku Gothic New", serif';
          const chars=words[i%words.length].split('');
          chars.forEach((ch,k)=>{ c.fillText(ch, cx+CW/2, cy+62+k*66); });
        }
        const tex=new THREE.CanvasTexture(cv); tex.encoding=THREE.sRGBEncoding; tex.anisotropy=8;
        const mat=new THREE.MeshBasicMaterial({map:tex});
        const sink=quadSink();
        for(let i=0;i<nCells;i++){
          const s=sleevePlacements[i];
          const col=i%COLS, row=Math.floor(i/COLS);
          const u0=col/COLS, u1=(col+1)/COLS, v1=1-row/ROWS, v0=1-(row+1)/ROWS;
          const hw=0.475, hh=1.125, d=0.098;
          // +z face (wound CCW seen from +z), then −z face (from −z)
          sink.push([
            [s.x-hw,s.y-hh,s.z+d],[s.x+hw,s.y-hh,s.z+d],[s.x+hw,s.y+hh,s.z+d],[s.x-hw,s.y+hh,s.z+d]],
            [0,0,1], [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);
          sink.push([
            [s.x+hw,s.y-hh,s.z-d],[s.x-hw,s.y-hh,s.z-d],[s.x-hw,s.y+hh,s.z-d],[s.x+hw,s.y+hh,s.z-d]],
            [0,0,-1], [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);
        }
        if(nCells) sink.build(mat);
        nearLayerCounts.sleeveCells=nCells;
        const armItems=[];
        for(const s of sleevePlacements){
          for(const dy of [1.02,0.55])
            armItems.push({x:s.x-s.dirX*0.6, y:s.y+dy, z:s.z, sx:1.3, sy:0.07, sz:0.07});
        }
        instanced(new THREE.BoxGeometry(1,1,1), nearDarkMetalMat, armItems);
        nearLayerCounts.sleeveArms=armItems.length;
      }

      /* ---- 4. high-resolution intersection decals (max 4) ----
         One shared 2048 canvas (2×2 cells). Each cell draws crisp
         zebra bands on all four approaches, stop lines and straight /
         left / right arrows. One merged geometry, floated just above
         the existing painted stripes, polygonOffset against flicker. */
      {
        const spots=[{x:37,z:33},{x:-491,z:33},{x:37,z:445},{x:37,z:-239}];
        const S=1024;
        const cv=document.createElement('canvas'); cv.width=S*2; cv.height=S*2;
        const c=cv.getContext('2d');
        function arrow(cx,cy,len,ang){
          c.save(); c.translate(cx,cy); c.rotate(ang);
          c.beginPath();
          c.moveTo(0,-len/2); c.lineTo(len*0.30,-len*0.08); c.lineTo(len*0.11,-len*0.08);
          c.lineTo(len*0.11,len/2); c.lineTo(-len*0.11,len/2); c.lineTo(-len*0.11,-len*0.08);
          c.lineTo(-len*0.30,-len*0.08); c.closePath(); c.fill(); c.restore();
        }
        spots.forEach((sp,ci)=>{
          const ox=(ci%2)*S, oy=Math.floor(ci/2)*S;
          c.save(); c.beginPath(); c.rect(ox,oy,S,S); c.clip();
          c.translate(ox,oy);
          c.fillStyle='rgba(246,246,240,0.96)';
          // zebra bands: horizontal crossings (top & bottom), bars along x
          for(const zy of [70, S-190]){
            for(let bx=90; bx<=S-150; bx+=86) c.fillRect(bx, zy, 52, 120);
          }
          // zebra bands: vertical crossings (left & right), bars along z
          for(const zx of [70, S-190]){
            for(let bz=90; bz<=S-150; bz+=86) c.fillRect(zx, bz, 120, 52);
          }
          // stop lines inside each approach
          c.fillRect(300, 216, 424, 22); c.fillRect(300, S-238, 424, 22);
          c.fillRect(216, 300, 22, 424); c.fillRect(S-238, 300, 22, 424);
          // lane arrows near the centre: straight / right / left
          arrow(S/2, S/2+215, 190, 0);
          arrow(S/2-215, S/2, 170, Math.PI/2);
          arrow(S/2+215, S/2, 170, -Math.PI/2);
          c.restore();
        });
        const tex=new THREE.CanvasTexture(cv); tex.encoding=THREE.sRGBEncoding; tex.anisotropy=8;
        const mat=new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false,
          polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
        const sink=quadSink();
        spots.forEach((sp,ci)=>{
          const col=ci%2, row=Math.floor(ci/2), H=8.5, y=0.175;
          const u0=col/2, u1=(col+1)/2, v1=1-row/2, v0=1-(row+1)/2;
          // ground plane wound CCW seen from above (+y normal)
          sink.push([
            [sp.x-H,y,sp.z+H],[sp.x+H,y,sp.z+H],[sp.x+H,y,sp.z-H],[sp.x-H,y,sp.z-H]],
            [0,1,0], [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);
        });
        sink.build(mat, 2);
        nearLayerCounts.decalIntersections=spots.length;
      }

      /* ---- 5. crossarms for the widened wire bundles ----
         Pole positions / perpendiculars recorded from the existing
         runs; two instanced arms per pole (upper at the 10.62 m wire
         height, lower at 9.6 m), sized to the widened WIRE_OFFS span
         so the wires visibly hang from the arms. */
      {
        const items=[];
        for(const p of polePlacements){
          items.push({x:p.x, y:10.68, z:p.z, sx:Math.abs(p.px)*3.9+0.16, sy:0.13, sz:Math.abs(p.pz)*3.9+0.16});
          items.push({x:p.x, y:9.62, z:p.z, sx:Math.abs(p.px)*2.5+0.14, sy:0.12, sz:Math.abs(p.pz)*2.5+0.14});
        }
        instanced(new THREE.BoxGeometry(1,1,1), nearDarkMetalMat, items);
        nearLayerCounts.crossarms=items.length;
      }
    }

    /* ================= C5 rooftop layer (Issue #19) =================
       A separate layer over the merged city geometry — CITYGEO vertex
       data, buildingsAABB / buildingVertRanges, the C1 facade shader,
       C2 environment, C4 road material and B5 shadow gate are all
       untouched. Three additions, all deterministic (hash only, no
       Math.random):
       1. Roof surfaces: every building with a footprint >= 6x6 m and
          height >= 3 m gets a textured roof plane 3 cm above its flat
          roof, in one of 4 procedural types (membrane / asphalt panels
          / gravel / sheet), assigned by hash(bi). Each type carries a
          procedural diffuse + Sobel normal map (256x256, 6 m tile,
          world-planar uv) — 8 canvas textures total, 4 merged meshes.
       2. Parapets: buildings h >= 10 m with footprint >= 14x14 m (inside
          the same |c| < 880 m range as the existing rooftop clutter)
          get a real rim following the footprint perimeter — outer band
          flush with the wall + top ring, 0.30 m thick, 0.45–1.20 m
          high — merged into a single geometry (4 tris per edge,
          sub-1.5 m footprint jogs skipped).
       3. Equipment density by scale class (AABB footprint area /
          height): S (<120 m2 or h<8) none, M (<400 m2) a 40% chance of
          one AC unit when the roof is still empty, L (<1200 m2) up to
          3 items total, XL up to 5 — penthouse (stairwell housing)
          first, then a water tank on XL, then AC units, all placed on
          fixed roof slots that keep clearance from the existing
          rooftopItems / signItems, so the layer never doubles or
          contradicts the existing clutter. Penthouse / tank / AC are
          three InstancedMeshes sharing Lambert materials (no new
          program beyond the roof-surface Standard material).
       Roof planes and parapets follow the real footprint polygon;
       only the AABB-fraction equipment slots skip footprints whose
       polygon area is < 80% of their AABB.
       Budget: +8 nodes / +8 draw calls / +8 textures / +8 geometries,
       castShadow=false throughout. */
    function makeRoofTexturesC5(){
      const S=256;
      const lat=(ix,iy)=>hash(ix*127.1+iy*311.7);
      const vnoise=(x,y)=>{
        const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
        const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
        const a=lat(ix,iy), b=lat(ix+1,iy), c=lat(ix,iy+1), d=lat(ix+1,iy+1);
        return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
      };
      // per type: base RGB, normal strength, height/shade field
      const types=[
        { base:[141,145,143], nstr:1.1, field:(x,y)=>{ // coated membrane, joint seams every 128 px
            let h=0.5+0.25*(vnoise(x/70,y/70)-0.5)+0.12*(vnoise(x/13,y/13)-0.5);
            if(x%128<2||y%128<2) h-=0.35; return h; } },
        { base:[133,129,122], nstr:1.9, field:(x,y)=>{ // asphalt + protection panels, 64 px grid
            let h=0.45+0.30*(vnoise(x/9,y/9)-0.5)+0.22*(lat(x,y)-0.5);
            if(x%64<2||y%64<2) h-=0.4; return h; } },
        { base:[156,151,141], nstr:3.2, field:(x,y)=> // gravel bed, strong fine grain
            0.5+0.55*(vnoise(x/3,y/3)-0.5)+0.35*(lat(x*3+7,y*3+3)-0.5) },
        { base:[110,117,124], nstr:1.4, field:(x,y)=>{ // sheet membrane, overlap ridges every 85 px
            let h=0.5+0.16*(vnoise(x/40,y/40)-0.5)+((Math.floor(y/85)%2)?0.04:-0.04);
            if(y%85<3) h+=0.3; return h; } },
      ];
      return types.map(tp=>{
        const height=new Float32Array(S*S);
        for(let y=0;y<S;y++) for(let x=0;x<S;x++) height[y*S+x]=clamp(tp.field(x,y),0,1);
        const dCv=document.createElement('canvas'); dCv.width=dCv.height=S;
        const dg=dCv.getContext('2d'), dImg=dg.createImageData(S,S), dd=dImg.data;
        for(let i=0;i<S*S;i++){
          const f=0.80+0.40*height[i], o=i*4;
          dd[o]=clamp(tp.base[0]*f,0,255); dd[o+1]=clamp(tp.base[1]*f,0,255);
          dd[o+2]=clamp(tp.base[2]*f,0,255); dd[o+3]=255;
        }
        dg.putImageData(dImg,0,0);
        // normal map: Sobel over the height field (same way and sign
        // convention as the C1 facade / C4 road derivations)
        const nCv=document.createElement('canvas'); nCv.width=nCv.height=S;
        const ng=nCv.getContext('2d'), nImg=ng.createImageData(S,S), nd=nImg.data;
        for(let y=0;y<S;y++){
          const ym=((y+S-1)%S)*S, y0=y*S, yp=((y+1)%S)*S;
          for(let x=0;x<S;x++){
            const xm=(x+S-1)%S, xp=(x+1)%S;
            const tl=height[ym+xm], tc=height[ym+x], tr=height[ym+xp];
            const ml=height[y0+xm], mr=height[y0+xp];
            const bl=height[yp+xm], bc=height[yp+x], br=height[yp+xp];
            const dx=(tr+2*mr+br)-(tl+2*ml+bl);
            const dy=(bl+2*bc+br)-(tl+2*tc+tr);
            let nx=-dx*tp.nstr, ny=dy*tp.nstr, nz=1;
            const il=1/Math.sqrt(nx*nx+ny*ny+nz*nz);
            const o=(y0+x)*4;
            nd[o]=(nx*il*0.5+0.5)*255; nd[o+1]=(ny*il*0.5+0.5)*255;
            nd[o+2]=(nz*il*0.5+0.5)*255; nd[o+3]=255;
          }
        }
        ng.putImageData(nImg,0,0);
        const map=new THREE.CanvasTexture(dCv); map.encoding=THREE.sRGBEncoding;
        map.wrapS=map.wrapT=THREE.RepeatWrapping; map.anisotropy=8;
        const normalMap=new THREE.CanvasTexture(nCv); // linear data: no sRGB
        normalMap.wrapS=normalMap.wrapT=THREE.RepeatWrapping; normalMap.anisotropy=8;
        return {map, normalMap};
      });
    }
    function buildRoofLayerC5(){
      const texes=makeRoofTexturesC5();
      roofLayerCounts.addedTextures=texes.length*2;
      const roofMats=texes.map(t=>new THREE.MeshStandardMaterial({map:t.map,
        normalMap:t.normalMap, normalScale:new THREE.Vector2(0.7,0.7),
        roughness:0.94, metalness:0.0, envMapIntensity:0.7}));
      const parapetMat=new THREE.MeshLambertMaterial({color:0xa3a49c});
      const penthouseMat=new THREE.MeshLambertMaterial({color:0x8f8d86});
      const tankMat=new THREE.MeshLambertMaterial({color:0x87919a});
      const acMat=new THREE.MeshLambertMaterial({color:0xb4b7b2});
      let nodes=0;
      const planeSink=[[],[],[],[]]; // per type: {pos,nor,uv}
      for(let t=0;t<4;t++) planeSink[t]={pos:[],nor:[],uv:[]};
      const parSink={pos:[],nor:[]};
      const pentItems=[], tankItems=[], acItems=[];
      let parMin=1e9, parMax=0;
      // obstacles: existing rooftop clutter + sign towers, by position
      const obstacles=[];
      for(const it of rooftopItems) obstacles.push(it);
      for(const it of signItems) obstacles.push(it);
      roofLayerCounts.existingRooftopItems=rooftopItems.length;
      const pushQuad=(sink,a,b,c,d,n)=>{
        const tris=[[a,b,c],[a,c,d]];
        for(const t of tris) for(const k of t){
          sink.pos.push(k[0],k[1],k[2]); sink.nor.push(n[0],n[1],n[2]);
          if(sink.uv) sink.uv.push(k[0]/6, k[2]/6); // world-planar uv, 6 m tile
        }
      };
      // PR #49 review fix (triangle budget): drop ring points that
      // sit within 10 cm of the segment joining their neighbours.
      // Footprints carry many nearly collinear points, and every
      // kept point costs triangles in the roof triangulation and
      // in the parapet edge loop. The original ring stays in use
      // for the area/equipment decisions below; only the drawn
      // outline (roof plane + parapet) uses the simplified ring.
      const simplifyRingC5=(ring)=>{
        const n=ring.length; if(n<=3) return ring;
        const out=[];
        for(let i=0;i<n;i++){
          const a=ring[(i+n-1)%n], p=ring[i], c=ring[(i+1)%n];
          const abx=p[0]-a[0], abz=p[1]-a[1];
          const acx=c[0]-a[0], acz=c[1]-a[1];
          const acl=Math.hypot(acx,acz);
          const dot=abx*acx+abz*acz;
          const dist=acl>1e-9? Math.abs(abx*acz-abz*acx)/acl : 0;
          if(!(dot>0 && dot<acl*acl && dist<=0.10)) out.push(p);
        }
        return out.length>=3? out : ring;
      };
      for(let bi=0; bi<buildingsAABB.length; bi++){
        const b=buildingsAABB[bi];
        const rw=b.x1-b.x0, rd=b.z1-b.z0, h=b.h;
        const cx=(b.x0+b.x1)/2, cn=-(b.z0+b.z1)/2;
        const inRange=Math.abs(cx)<880 && Math.abs(cn)<880;
        const type=Math.floor(hash(bi*101+7)*4);
        // footprint polygon (world x/z, from CITY data): the roof
        // plane and the parapet follow the real outline, so
        // non-rectangular buildings are covered exactly
        const flat=CITY.buildings[bi][2], np=flat.length/2;
        const pts=[];
        for(let i=0;i<np;i++) pts.push([flat[i*2]/10, -flat[i*2+1]/10]);
        let pa=0;
        for(let i=0;i<np;i++){ const j=(i+1)%np; pa+=pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1]; }
        const polyArea=Math.abs(pa/2);
        const spts=simplifyRingC5(pts), sn=spts.length;
        const hasParapet=inRange && h>=10 && rw>=14 && rd>=14;
        // 1. textured roof surface: the footprint polygon triangulated
        //    (ShapeUtils earcut), 3 cm above the flat roof, world-planar
        //    uv from pushQuad's sink convention (x/6, z/6)
        if(rw>=6 && rd>=6 && h>=3 && np>=3){
          const sink=planeSink[type], Y=h+0.03;
          const contour=spts.map(p=>new THREE.Vector2(p[0], -p[1]));
          const faces=THREE.ShapeUtils.triangulateShape(contour, []);
          for(const f of faces){
            let A=spts[f[0]], Bp=spts[f[1]], C=spts[f[2]];
            // world winding must face +y: with pts as [x,z], the
            // (B-A)x(C-A) y-component is dz1*dx2-dx1*dz2, i.e. the
            // negative of the expression below — swap when it is > 0
            if((Bp[0]-A[0])*(C[1]-A[1])-(Bp[1]-A[1])*(C[0]-A[0])>0){ const t=Bp; Bp=C; C=t; }
            for(const P of [A,Bp,C]){
              sink.pos.push(P[0], Y, P[1]); sink.nor.push(0,1,0);
              sink.uv.push(P[0]/6, P[1]/6);
            }
          }
          roofLayerCounts.buildings++;
          roofLayerCounts.byTexture[type]++;
        }
        // 2. parapet rim along the footprint edges: outer band flush with the wall, real height. PR #49 review fix: the top ring is omitted and segments under 3 m are left as rim openings — with band + ring the layer exceeded the phase-2 overhead triangle ceiling; the raised outer band is what reads as the roof step at the 30-200 m acceptance range. See Issue #19 record.
        if(hasParapet){
          const ph=0.45+hash(bi*103)*0.5+(h>30?0.25:0);
          const y0=h-0.03, y1=y0+ph;
          const cenx=cx, cenz=(b.z0+b.z1)/2;
          for(let i=0;i<sn;i++){
            const j=(i+1)%sn;
            let ax=spts[i][0], az=spts[i][1], bx=spts[j][0], bz=spts[j][1];
            let dx=bx-ax, dz=bz-az;
            if(Math.hypot(dx,dz)<3.0) continue; // rim opening (budget, see above)
            // geometric normal of the (aB,bB,bT) winding is (-dz,0,dx);
            // flip the edge so it points away from the building centre
            let gx=-dz, gz=dx;
            if(gx*((ax+bx)/2-cenx)+gz*((az+bz)/2-cenz)<0){
              const tx=ax, tz=az; ax=bx; az=bz; bx=tx; bz=tz; dx=-dx; dz=-dz; gx=-dz; gz=dx;
            }
            const gl=Math.hypot(gx,gz)||1, nx=gx/gl, nz=gz/gl;
            const aB=[ax,y0,az], bB=[bx,y0,bz], aT=[ax,y1,az], bT=[bx,y1,bz];
            pushQuad(parSink, aB, bB, bT, aT, [nx,0,nz]);
          }
          roofLayerCounts.parapets++;
          if(ph<parMin)parMin=ph; if(ph>parMax)parMax=ph;
        }
        // 3. scale-class equipment density (existing clutter counts
        //    toward the class quota; slots keep clearance from it).
        //    Slots are AABB fractions, so strongly non-rectangular
        //    footprints (polygon < 80% of AABB) are skipped here —
        //    their slot positions could fall outside the real roof.
        if(!inRange || !(rw*rd>0 && polyArea/(rw*rd)>=0.80)) continue;
        const area=rw*rd;
        const cls=(area<120||h<8)?'S':area<400?'M':area<1200?'L':'XL';
        roofLayerCounts.classBuildings[cls]++;
        const ex=[];
        for(const it of obstacles){
          if(it.y===h && it.x>=b.x0-0.5 && it.x<=b.x1+0.5 && it.z>=b.z0-0.5 && it.z<=b.z1+0.5)
            ex.push(it);
        }
        let quota=0, wantPH=false, wantTank=false;
        if(cls==='M'){ quota=(ex.length===0 && hash(bi*83)<0.4)?1:0; }
        else if(cls==='L'){ quota=Math.max(0,3-ex.length); wantPH=quota>0; }
        else if(cls==='XL'){ quota=Math.max(0,5-ex.length); wantPH=quota>0; wantTank=quota>1; }
        if(!quota) continue;
        const placed=[];
        const clear=(x,z,r)=>{
          for(const q of ex) if(Math.hypot(q.x-x,q.z-z)<r) return false;
          for(const q of placed) if(Math.hypot(q[0]-x,q[1]-z)<r) return false;
          return true;
        };
        const addHere=(clsKey)=>{ roofLayerCounts.addedByClass[cls]++; roofLayerCounts.addedItems[clsKey]++; roofLayerCounts.addedItems.total++; };
        if(wantPH){
          const sx=clamp(rw*0.30,3.0,7.5), sz=clamp(rd*0.30,2.6,6.5);
          let px=b.x0+rw*0.30, pz=b.z0+rd*0.30;
          px=clamp(px, b.x0+0.7+sx/2, b.x1-0.7-sx/2); pz=clamp(pz, b.z0+0.7+sz/2, b.z1-0.7-sz/2);
          if(rw>=sx+1.4 && rd>=sz+1.4 && clear(px,pz,4.2)){
            pentItems.push({x:px, y:h+0.03, z:pz, sx, sy:2.4+hash(bi*107)*1.2, sz, base:true});
            placed.push([px,pz]); quota--; addHere('penthouse');
          }
        }
        if(wantTank && quota>0){
          const r=clamp(Math.min(rw,rd)*0.10,1.1,2.0);
          const px=b.x0+rw*0.72, pz=b.z0+rd*0.30;
          if(clear(px,pz,3.6)){
            tankItems.push({x:px, y:h+0.03, z:pz, sx:r, sy:2.2+hash(bi*109)*1.0, sz:r});
            placed.push([px,pz]); quota--; addHere('tank');
          }
        }
        const acSlots=[[0.70,0.68],[0.28,0.70],[0.52,0.50],[0.84,0.52],[0.16,0.48]];
        for(const sl of acSlots){
          if(quota<=0) break;
          const px=b.x0+rw*sl[0], pz=b.z0+rd*sl[1];
          if(!clear(px,pz,3.0)) continue;
          acItems.push({x:px, y:h+0.03, z:pz, sx:1.7+hash(bi*113+sl[0]*10)*0.7,
            sy:0.85+hash(bi*127)*0.35, sz:1.2+hash(bi*131)*0.5, rot:hash(bi*137)*0.6-0.3});
          placed.push([px,pz]); quota--; addHere('ac');
        }
      }
      // merged roof planes, one mesh per texture type
      let tris=0;
      for(let t=0;t<4;t++){
        const sink=planeSink[t];
        if(!sink.pos.length) continue;
        const g=new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(sink.pos,3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(sink.nor,3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(sink.uv,2));
        const mesh=new THREE.Mesh(g, roofMats[t]);
        mesh.castShadow=false; mesh.receiveShadow=true; scene.add(mesh); nodes++;
        tris+=sink.pos.length/9;
      }
      // merged parapets, one mesh
      if(parSink.pos.length){
        const g=new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(parSink.pos,3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(parSink.nor,3));
        const mesh=new THREE.Mesh(g, parapetMat);
        mesh.castShadow=false; mesh.receiveShadow=true; scene.add(mesh); nodes++;
        tris+=parSink.pos.length/9;
      }
      // instanced equipment (base:true items sit on the roof plane,
      // so their y is the base, not the centre)
      const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), eu=new THREE.Euler(),
        sv=new THREE.Vector3(), pv=new THREE.Vector3();
      function instancedC5(geo, mat, items, baseY){
        if(!items.length) return;
        const im=new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((it,i)=>{
          eu.set(0, it.rot||0, 0); q.setFromEuler(eu);
          sv.set(it.sx, it.sy, it.sz); pv.set(it.x, baseY? it.y+it.sy/2 : it.y, it.z);
          mtx.compose(pv,q,sv); im.setMatrixAt(i,mtx);
        });
        im.castShadow=false; im.receiveShadow=true; scene.add(im); nodes++;
        tris+=items.length*(geo.index? geo.index.count : geo.attributes.position.count)/3;
      }
      // PR #49 review fix: equipment geometries without the
      // never-visible bottom face (penthouse/AC boxes 12 -> 10
      // triangles) and a 6-segment tank with a top fan but no
      // bottom cap (32 -> 18). Unit size, centred, same
      // instancing convention as the geometries they replace.
      const openBoxGeoC5=()=>{
        const pos=[], nor=[];
        const quad=(a,bb,c,d,n)=>{ for(const t of [[a,bb,c],[a,c,d]])
          for(const k of t){ pos.push(k[0],k[1],k[2]); nor.push(n[0],n[1],n[2]); } };
        const h=0.5;
        quad([-h,h,-h],[-h,h,h],[h,h,h],[h,h,-h],[0,1,0]);
        quad([h,-h,h],[h,-h,-h],[h,h,-h],[h,h,h],[1,0,0]);
        quad([-h,-h,-h],[-h,-h,h],[-h,h,h],[-h,h,-h],[-1,0,0]);
        quad([-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h],[0,0,1]);
        quad([h,-h,-h],[-h,-h,-h],[-h,h,-h],[h,h,-h],[0,0,-1]);
        const g=new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
        return g;
      };
      const tankGeoC5=()=>{
        const pos=[], nor=[], SEG=6;
        const P=(k,y)=>[Math.cos(k/SEG*Math.PI*2), y, Math.sin(k/SEG*Math.PI*2)];
        for(let k=0;k<SEG;k++){
          const m=(k+0.5)/SEG*Math.PI*2, n=[Math.cos(m),0,Math.sin(m)];
          const B=P(k,-0.5), B1=P(k+1,-0.5), T=P(k,0.5), T1=P(k+1,0.5);
          for(const v of [B,T1,B1, B,T,T1]){ pos.push(v[0],v[1],v[2]); nor.push(n[0],n[1],n[2]); }
          const C=[0,0.5,0];
          for(const v of [C,T1,T]){ pos.push(v[0],v[1],v[2]); nor.push(0,1,0); }
        }
        const g=new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
        return g;
      };
      const boxGeo=openBoxGeoC5();
      instancedC5(boxGeo, penthouseMat, pentItems, true);
      instancedC5(tankGeoC5(), tankMat,
        tankItems.map(it=>({x:it.x, y:it.y+it.sy/2, z:it.z, sx:it.sx, sy:it.sy, sz:it.sz})), false);
      instancedC5(boxGeo, acMat, acItems, true);
      roofLayerCounts.parapetHeightMin=roofLayerCounts.parapets?+parMin.toFixed(2):0;
      roofLayerCounts.parapetHeightMax=roofLayerCounts.parapets?+parMax.toFixed(2):0;
      roofLayerCounts.addedNodes=nodes;
      roofLayerCounts.addedCalls=nodes;
      roofLayerCounts.addedTriangles=Math.round(tris);
    }

    /* place labels (canvas sprites) */
    const LABELS=[['堺筋',30,-40,26],['千日前通',-150,26,20],['御堂筋',-498,-70,26],['長堀通',15,-905,24],
      ['道頓堀川',90,-252,22],['東横堀川',408,-1330,20],['阪神高速1号環状線',-430,-16,20],
      ['とんぼりリバーウォーク',-170,-238,15],['戎橋筋商店街',-404,-40,15],['黒門市場',120,-95,15],
      ['なんさん通り',-6,438,16],['国道25号',-560,300,18],['でんでんタウン',26,330,15],['日本橋駅',-24,66,15]];
    function makeLabels(){
      for(const [name,x,z,s] of LABELS){
        const cv=document.createElement('canvas'); cv.width=512; cv.height=112;
        const c2=cv.getContext('2d');
        c2.font='700 50px "Zen Kaku Gothic New", sans-serif';
        c2.textAlign='center'; c2.textBaseline='middle';
        const tw=c2.measureText(name).width;
        const pw=tw+56, ph=76, px=(512-pw)/2, py=(112-ph)/2;
        c2.beginPath();
        c2.moveTo(px+18,py); c2.lineTo(px+pw-18,py); c2.quadraticCurveTo(px+pw,py,px+pw,py+18);
        c2.lineTo(px+pw,py+ph-18); c2.quadraticCurveTo(px+pw,py+ph,px+pw-18,py+ph);
        c2.lineTo(px+18,py+ph); c2.quadraticCurveTo(px,py+ph,px,py+ph-18);
        c2.lineTo(px,py+18); c2.quadraticCurveTo(px,py,px+18,py); c2.closePath();
        c2.fillStyle='rgba(10,22,17,.62)'; c2.fill();
        c2.fillStyle='rgba(255,255,255,.96)'; c2.fillText(name, 256, 58);
        const tex=new THREE.CanvasTexture(cv); tex.encoding=THREE.sRGBEncoding;
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false}));
        const wpx=s* (512/112) *0.42;
        sp.scale.set(wpx, s*0.42, 1); sp.position.set(x, s*0.55, z);
        scene.add(sp);
      }
    }

    /* sites (report-grounded anchor points) */
    const FORAGE=[
      {name:'日本橋駅前', p:V3(6,0,-14), r:13},
      {name:'でんでんタウン前', p:V3(14,0,300), r:15},
      {name:'道頓堀リバーウォーク', p:V3(-120,0,-238), r:16},
      {name:'黒門市場入口', p:V3(112,0,-70), r:11},
      {name:'なんば駅前', p:V3(-330,0,330), r:15},
    ];
    const DRINK=[V3(-95,0.4,-246), V3(150,0.4,-248), V3(-215,0.4,-240)];
    const CIRCUIT=[ // flight circuit over streets / river (x, alt, z)
      [0,34,-255],[-260,38,-230],[-420,42,-40],[-360,36,300],[-120,30,430],[60,32,300],
      [240,36,120],[430,40,-60],[300,44,-260],[120,38,-330]
    ].map(a=>V3(a[0],a[1],a[2]));

    buildCity(); __boot.cityBuilt=performance.now(); setLoad(0.45,'道路・高架・川を描画中…');
    for(let i=0;i<buildingsAABB.length;i++){
      const b=buildingsAABB[i];
      const cx0=Math.floor(b.x0/80), cx1=Math.floor(b.x1/80), cz0=Math.floor(b.z0/80), cz1=Math.floor(b.z1/80);
      for(let cx=cx0;cx<=cx1;cx++) for(let cz=cz0;cz<=cz1;cz++){
        const k=cx+','+cz;
        if(!aabbGrid.has(k)) aabbGrid.set(k,[]);
        aabbGrid.get(k).push(i);
      }
    }
    buildRoadsWater(); buildStreetProps(); buildNearLayerC3(); buildRoofLayerC5(); makeLabels();
