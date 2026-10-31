    'use strict';
    /* ================= simulation clock & director ================= */
    /* ---------- season & weather system ----------
       Solar geometry for Osaka (lat 34.67 N): sunrise/sunset come from the
       real declination + hour-angle equations, so the pigeons' day is
       driven by the season's actual day length (solstice checks:
       summer 4:50/19:10, winter 7:10/16:50 — see research notes).
       Season/weather numbers are design parameters grounded in Osaka's
       climate normals (labelled 設計案 in the notes). */
    const LAT_RAD=34.67*Math.PI/180;
    const SEASONS={
      spring:{label:'春', doy:105, tMin:9,  tMax:21, court:2.4,  drink:1.0, sky:0xa5cde2},
      summer:{label:'夏', doy:196, tMin:25, tMax:34, court:1.9,  drink:2.3, sky:0x8fc0e8},
      autumn:{label:'秋', doy:297, tMin:11, tMax:24, court:0.8,  drink:1.0, sky:0x9fc3d8},
      winter:{label:'冬', doy:15,  tMin:1,  tMax:10, court:0.25, drink:0.7, sky:0xaebfc9},
    };
    const WEATHERS={
      clear:    {label:'晴れ', cloud:0.08, rain:0,    snow:0,    wind:0.12, temp:1},
      cloudy:   {label:'曇り', cloud:0.80, rain:0,    snow:0,    wind:0.25, temp:0},
      rain:     {label:'雨',   cloud:0.95, rain:0.55, snow:0,    wind:0.35, temp:-2},
      heavyrain:{label:'強雨', cloud:1.0,  rain:1.0,  snow:0,    wind:0.55, temp:-2},
      snow:     {label:'雪',   cloud:0.90, rain:0,    snow:0.85, wind:0.30, temp:-3},
      wind:     {label:'強風', cloud:0.35, rain:0,    snow:0,    wind:1.0,  temp:-1},
    };
    function doyOf(d){ return Math.floor((d-new Date(d.getFullYear(),0,0))/86400000); }
    function seasonFromDate(d){ const m=d.getMonth()+1; return m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter'; }
    let seasonMode='auto', weatherMode='auto';
    let seasonKey=seasonFromDate(new Date());
    let weatherKey='clear';
    const ENV={ doy:doyOf(new Date()), cloud:0.08, rain:0, snow:0, wind:0.12,
      wet:0, snowCover:0, postRain:0, temp:18, court:1, drink:1, cohesion:1,
      forageScale:1, windX:0.7, windZ:0.7, wxT:45, _prevRain:0,
      skyTint:new THREE.Color(SEASONS[seasonKey].sky) };
    let SUN={rise:367, set:1035, decl:-0.18};
    function solarTimes(doy){
      const decl=-23.44*Math.PI/180*Math.cos(TAU*(doy+10)/365);
      // sunrise / sunset at the standard 90.833 deg zenith (refraction + solar disc)
      const cosH=(Math.cos(90.833*Math.PI/180)-Math.sin(LAT_RAD)*Math.sin(decl))/(Math.cos(LAT_RAD)*Math.cos(decl));
      const dayLen=2*Math.acos(clamp(cosH,-1,1))*180/Math.PI/15*60; // minutes
      // clock time of solar noon for Osaka (lon 135.51 E vs JST meridian 135 E),
      // including the equation of time — checks: solstices 4:45/19:13, 7:02/16:51
      const B=TAU*(doy-81)/364;
      const eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B);
      const noon=720-eot-(135.51-135)*4;
      return {rise:noon-dayLen/2, set:noon+dayLen/2, decl};
    }
    function sunPos(minOfDay, decl){
      const H=(minOfDay/60-12)*15*Math.PI/180;
      const sinEl=Math.sin(LAT_RAD)*Math.sin(decl)+Math.cos(LAT_RAD)*Math.cos(decl)*Math.cos(H);
      const el=Math.asin(clamp(sinEl,-1,1));
      const cosA=(Math.sin(decl)-Math.sin(el)*Math.sin(LAT_RAD))/(Math.cos(el)*Math.cos(LAT_RAD)+1e-6);
      let az=Math.acos(clamp(cosA,-1,1)); if(H>0) az=TAU-az;
      return {el, az, sinEl:Math.sin(el)};
    }
    const fmtMin=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(Math.floor(m%60)).padStart(2,'0');

    /* window lights: warm emissive panes scattered over real building
       facades, fading in as the sun drops (the dusk-window leftover) */
    const winLightMat=new THREE.MeshBasicMaterial({color:0xffc978, transparent:true, opacity:0, depthWrite:false});
    const winLightMesh=(()=>{
      let items=[];
      for(let bi=0; bi<buildingsAABB.length; bi++){
        const b=buildingsAABB[bi];
        if(b.h<7 || Math.abs((b.x0+b.x1)/2)>720 || Math.abs((b.z0+b.z1)/2)>720) continue;
        if(hash(bi*37)<0.45) continue;
        const n=1+Math.floor(hash(bi*41)*Math.min(7, b.h/3));
        for(let k=0;k<n;k++){
          const side=randi(0,3), y=rand(1.6, Math.max(2.4, b.h-1.2));
          let x,z,rot;
          if(side===0){ x=b.x0-0.14; z=rand(b.z0+0.9,b.z1-0.9); rot=-Math.PI/2; }
          else if(side===1){ x=b.x1+0.14; z=rand(b.z0+0.9,b.z1-0.9); rot=Math.PI/2; }
          else if(side===2){ z=b.z0-0.14; x=rand(b.x0+0.9,b.x1-0.9); rot=Math.PI; }
          else { z=b.z1+0.14; x=rand(b.x0+0.9,b.x1-0.9); rot=0; }
          if(z<b.z0||z>b.z1||x<b.x0||x>b.x1){ if(side<2){ if(z<b.z0||z>b.z1) continue; } else if(x<b.x0||x>b.x1) continue; }
          items.push({x,y,z,rot});
        }
      }
      if(items.length>2400) items=items.filter(()=>Math.random()<2400/items.length);
      const im=new THREE.InstancedMesh(new THREE.PlaneGeometry(0.85,1.15), winLightMat, items.length);
      const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), one=new THREE.Vector3(1,1,1), pv=new THREE.Vector3();
      items.forEach((it,i)=>{ e.set(0,it.rot,0); q.setFromEuler(e); pv.set(it.x,it.y,it.z); m4.compose(pv,q,one); im.setMatrixAt(i,m4); });
      im.visible=false; scene.add(im);
      return im;
    })();

    /* clouds: soft sprites drifting with the wind */
    const cloudMat=new THREE.SpriteMaterial({map:(()=>{ const cv=document.createElement('canvas'); cv.width=256; cv.height=128;
      const g=cv.getContext('2d'); g.translate(128,64); g.scale(1,0.5);
      const gr=g.createRadialGradient(0,0,8,0,0,120); gr.addColorStop(0,'rgba(255,255,255,.85)'); gr.addColorStop(0.55,'rgba(255,255,255,.42)'); gr.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=gr; g.fillRect(-128,-128,256,256); return new THREE.CanvasTexture(cv); })(),
      transparent:true, opacity:0.07, depthWrite:false});
    const cloudSprites=[];
    for(let i=0;i<16;i++){
      const sp=new THREE.Sprite(cloudMat);
      const w=rand(280,540);
      sp.scale.set(w, w*0.36, 1);
      sp.position.set(rand(-1000,1000), rand(135,205), rand(-1000,1000));
      sp.userData.sp=rand(0.6,1.4);
      cloudSprites.push(sp); scene.add(sp);
    }

    /* precipitation particles around the watched bird */
    const precipGroup=new THREE.Group(); scene.add(precipGroup);
    function makePrecip(n, size, color, opacity){
      const geo=new THREE.BufferGeometry();
      const arr=new Float32Array(n*3), spd=new Float32Array(n);
      for(let i=0;i<n;i++){ arr[i*3]=rand(-62,62); arr[i*3+1]=rand(0,62); arr[i*3+2]=rand(-62,62); spd[i]=rand(0.7,1.3); }
      geo.setAttribute('position', new THREE.BufferAttribute(arr,3));
      const mat=new THREE.PointsMaterial({color, size, transparent:true, opacity:0, depthWrite:false});
      const pts=new THREE.Points(geo, mat); pts.visible=false; precipGroup.add(pts);
      return {pts, geo, mat, spd, n};
    }
    const rainFx=makePrecip(1500, 0.5, 0xaec6d6, 0);
    const snowFx=makePrecip(1100, 0.62, 0xffffff, 0);

    /* puddles that appear as the ground gets wet (and host post-rain bathing) */
    const puddleMat=new THREE.MeshPhongMaterial({color:0x9db9c6, transparent:true, opacity:0, shininess:180, specular:0xe8f4fa, depthWrite:false});
    const puddleMeshes=[];
    for(const [px,pz] of [[8,-6],[20,292],[-108,-230],[104,-62],[-322,322],[30,44],[-60,-246],[150,-240],[60,180],[-200,60]]){
      const pm=new THREE.Mesh(new THREE.CircleGeometry(rand(1.3,2.8), 20), puddleMat);
      pm.rotation.x=-Math.PI/2; pm.position.set(px,0.13,pz); pm.visible=false;
      puddleMeshes.push(pm); scene.add(pm);
    }

    const _c1=new THREE.Color(), _c2=new THREE.Color();
    const _m4=new THREE.Matrix4(), _q0=new THREE.Quaternion(), _pv=new THREE.Vector3(), _sv=new THREE.Vector3();
    function applySeasonVisuals(){
      const S=SEASONS[seasonKey];
      ENV.court=S.court; ENV.drink=S.drink;
      ENV.cohesion = seasonKey==='winter'?0.72 : seasonKey==='summer'?1.06 : 1.0;
      ENV.skyTint.set(S.sky);
      if(canopyMesh){
        canopyMesh.visible = seasonKey!=='winter'; // winter: bare branches only
        const cc=new THREE.Color();
        for(let i=0;i<canopyBase.length;i++){
          const h1=hash(i*13+3);
          if(seasonKey==='spring'){ if(h1>0.8) cc.setHSL(0.96,0.45,0.80); else cc.setHSL(0.25+h1*0.05, 0.5, 0.52+h1*0.1); }
          else if(seasonKey==='summer') cc.setHSL(0.27+h1*0.04, 0.52, 0.27+h1*0.07);
          else if(seasonKey==='autumn'){ const pal=[0.05,0.08,0.11,0.13]; cc.setHSL(pal[i%4]+h1*0.02, 0.72, 0.42+h1*0.08); }
          else cc.setHSL(0.08, 0.3, 0.3);
          canopyMesh.setColorAt(i, cc);
        }
        if(canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate=true;
      }
      // winter fluff: feathers held loose, body reads rounder and lower
      const f = seasonKey==='winter'?1.14:1;
      for(const p of pigeons) p.mesh.body.scale.set(1*f, 0.86*f, 1.38*Math.sqrt(f));
    }
    function pickWeather(){
      const w={clear:0.36, cloudy:0.30, wind:0.10, rain:0.16, heavyrain:0.03, snow:0};
      if(seasonKey==='summer'){ w.clear=0.30; w.rain=0.20; w.heavyrain=0.09; }
      if(seasonKey==='winter'){ w.clear=0.30; w.rain=0.06; w.snow=0.24; }
      if(seasonKey==='spring'){ w.wind=0.14; }
      let r=Math.random(), acc=0;
      for(const k in w){ acc+=w[k]; if(r<acc) return k; }
      return 'clear';
    }
    function shelterNow(){
      if(flockFlying || phaseOf(simMin)==='roost') return;
      const grounded=pigeons.some(p=>!p.player&&(p.state==='forage'||p.state==='drink'||p.state==='bathe'));
      if(grounded) startFlockFlight({fraction:0.75, landPerches:nearestPerches(V3(0,0,0),24,['girder','ledge'])});
    }
    function updatePrecip(dt){
      const fp=focus();
      precipGroup.position.set(fp.pos.x, 0, fp.pos.z);
      const now=performance.now();
      rainFx.pts.visible=ENV.rain>0.03;
      if(rainFx.pts.visible){
        rainFx.mat.opacity=ENV.rain*0.7;
        const arr=rainFx.geo.attributes.position.array;
        for(let i=0;i<rainFx.n;i++){
          let y=arr[i*3+1]-52*rainFx.spd[i]*dt;
          arr[i*3]+=ENV.windX*ENV.wind*9*dt;
          if(arr[i*3]>62) arr[i*3]=-62; if(arr[i*3]<-62) arr[i*3]=62;
          if(y<0){ y=62; arr[i*3]=rand(-62,62); arr[i*3+2]=rand(-62,62); }
          arr[i*3+1]=y;
        }
        rainFx.geo.attributes.position.needsUpdate=true;
      }
      snowFx.pts.visible=ENV.snow>0.03;
      if(snowFx.pts.visible){
        snowFx.mat.opacity=ENV.snow*0.9;
        const arr=snowFx.geo.attributes.position.array;
        for(let i=0;i<snowFx.n;i++){
          let y=arr[i*3+1]-(1.3+1.3*snowFx.spd[i])*dt;
          arr[i*3]+=(Math.sin(now*0.0012+i*1.7)*0.9+ENV.windX*ENV.wind*2.2)*dt;
          if(arr[i*3]>62) arr[i*3]=-62; if(arr[i*3]<-62) arr[i*3]=62;
          if(y<0){ y=58; arr[i*3]=rand(-62,62); arr[i*3+2]=rand(-62,62); }
          arr[i*3+1]=y;
        }
        snowFx.geo.attributes.position.needsUpdate=true;
      }
    }
    function updateEnvironment(dt){
      const W=WEATHERS[weatherKey];
      const k=1-Math.exp(-dt*0.45);
      ENV.cloud+=(W.cloud-ENV.cloud)*k;
      ENV.rain+=(W.rain-ENV.rain)*k;
      ENV.snow+=(W.snow-ENV.snow)*k;
      ENV.wind+=(W.wind-ENV.wind)*k;
      const simDt=dt*timeScale/60;
      if(weatherMode==='auto'){ ENV.wxT-=simDt; if(ENV.wxT<=0){ ENV.wxT=rand(35,80); weatherKey=pickWeather(); } }
      if(ENV.rain>0.12) ENV.wet=Math.min(1, ENV.wet+dt*0.05); else ENV.wet=Math.max(0, ENV.wet-dt*0.008);
      if(ENV.snow>0.12) ENV.snowCover=Math.min(1, ENV.snowCover+dt*0.045);
      else if(ENV.temp>3) ENV.snowCover=Math.max(0, ENV.snowCover-dt*0.01);
      if(ENV._prevRain>0.15 && ENV.rain<=0.15) ENV.postRain=90; // bathing window after the rain stops
      ENV._prevRain=ENV.rain;
      if(ENV.postRain>0) ENV.postRain=Math.max(0, ENV.postRain-simDt);
      ENV.forageScale=1-Math.max(ENV.snow>0.1?0.55:0, ENV.snowCover*0.5, ENV.rain>0.3?0.3:0);
      const wa=2.35+Math.sin(performance.now()*0.00003)*0.6;
      ENV.windX=Math.sin(wa); ENV.windZ=Math.cos(wa);
      // temperature estimate: seasonal range x diurnal curve x weather offset
      const S=SEASONS[seasonKey];
      const dayProg=clamp((simMin-SUN.rise)/Math.max(60, SUN.set-SUN.rise), 0, 1);
      const inDay=simMin>=SUN.rise && simMin<=SUN.set;
      let t=S.tMin+(S.tMax-S.tMin)*Math.pow(Math.sin(dayProg*Math.PI), 0.8);
      if(!inDay) t=S.tMin+1;
      // weather offset applies inside the season's stated range (notes)
      ENV.temp=clamp(Math.round(t + W.temp*(0.4+0.6*Math.sin(dayProg*Math.PI))), S.tMin-3, S.tMax);
      // clouds
      cloudMat.opacity=ENV.cloud*0.85;
      cloudMat.color.copy(_c1.set(0xffffff)).lerp(_c2.set(0x565d63), ENV.cloud*0.75);
      for(const c of cloudSprites){ c.position.x+=(1.5+ENV.wind*7)*c.userData.sp*dt; if(c.position.x>1050) c.position.x=-1050; }
      updatePrecip(dt);
      // street-tree sway in the wind (canopy instances re-composed)
      if(canopyMesh && canopyMesh.visible){
        const tt=performance.now()/1000, amp=0.04+ENV.wind*0.5;
        for(let i=0;i<canopyBase.length;i++){
          const b=canopyBase[i];
          _m4.compose(_pv.set(b.x+Math.sin(tt*1.9+i*1.7)*amp, b.y, b.z+Math.cos(tt*1.6+i*2.3)*amp*0.7), _q0, _sv.set(b.sx,b.sy,b.sz));
          canopyMesh.setMatrixAt(i, _m4);
        }
        canopyMesh.instanceMatrix.needsUpdate=true;
      }
      // puddles + wet / snow-covered ground and roads
      const po=ENV.wet*0.85*(1-ENV.snowCover);
      puddleMat.opacity=po;
      for(const pm of puddleMeshes) pm.visible=po>0.03;
      if(groundMat){ groundMat.color.copy(_c1.set(0x585c52)).lerp(_c2.set(0x43463e), ENV.wet*0.7).lerp(_c2.set(0xe2e6e9), ENV.snowCover); }
      if(roadsMat){ roadsMat.color.copy(_c1.set(0xffffff)).lerp(_c2.set(0x9aa0a4), ENV.wet*0.55).lerp(_c2.set(0xdfe4e8), ENV.snowCover*0.5); }
      if(roadsMat){ roadsMat.roughness=1-ENV.wet*0.58; roadsMat.envMapIntensity=0.25+ENV.wet*0.75;
        roadSurface.roughnessFactor=roadsMat.roughness; roadSurface.envMapIntensity=roadsMat.envMapIntensity; }
      if(waterMatRef){ waterMatRef.roughness=clamp(0.40-ENV.rain*0.22, 0.14, 0.60); } // C2: rain smooths the surface (was Phong shininess 140+rain*160)
    }
    applySeasonVisuals();

    let simMin=640;               // 10:40 start (late-morning foraging build-up)
    let timeScale=60;             // sim-seconds per real second
    const PHASES={
      roost:{label:'ねぐらで就寝', chip:'#5a6b8c'},
      wake:{label:'目覚め・朝の採餌', chip:'#c07f13'},
      forage:{label:'午前の採餌', chip:'#12755c'},
      peak:{label:'採餌ピーク（午前遅く〜午後）', chip:'#12755c'},
      loaf:{label:'休息 loafing・羽づくろい', chip:'#7a6a3a'},
      evening:{label:'水飲み → ねぐらへ帰還', chip:'#b35c2e'},
    };
    function phaseOf(m){
      // the whole day is anchored to the season's sunrise / sunset:
      // winter's short day stretches the roost, summer's long day the foraging
      const r=SUN.rise, s=SUN.set, dl=Math.max(120, s-r);
      if(m<r-15||m>=s+35) return 'roost';
      if(m<r+90) return 'wake';
      if(m<r+dl*0.46) return 'forage';
      if(m<r+dl*0.77) return 'peak';
      if(m<s-50) return 'loaf';
      return 'evening';
    }
    let curPhase=phaseOf(simMin), directorT=25, eveningStep=0, shelterT=8;
    /* flight_time_ratio_cap: a DESIGN value for this app (the share of the
       day spent airborne is capped at 2%) — not a field measurement.
       When the flock runs over it, flight *duration* is trimmed first;
       the interval between flights is only stretched as a last resort. */
    const FLIGHT_TIME_RATIO_CAP=0.02;
    function flockFlightRatio(){
      const elapsed=Math.max(900, simMin*60);
      let s=0; for(const p of pigeons) s+=p.flightSecToday;
      return (s/pigeons.length)/elapsed;
    }
    function director(dt){
      const ph=phaseOf(simMin);
      if(ph!==curPhase){
        curPhase=ph; eveningStep=0;
        if(ph==='wake'||ph==='forage'){
          if(!flockFlying) startFlockFlight({loops:1, landSite:FORAGE[randi(0,FORAGE.length-1)]});
        } else if(ph==='loaf'){
          if(!flockFlying) startFlockFlight({loops:1, landPerches:nearestPerches(V3(0,0,0),24,['roof'])});
        } else if(ph==='evening'){
          if(!flockFlying) startFlockFlight({loops:1, landSite:FORAGE[2]}); // river walk: drink before roost
        } else if(ph==='roost'){
          if(!flockFlying) startFlockFlight({loops:1, landPerches:roostPerches.slice(0,24)});
        }
        directorT=rand(120,220);
      }
      if(ph==='evening' && !flockFlying && eveningStep===0){
        eveningStep=1; directorT=26; // after drinking, head home
      }
      if(ph==='evening' && eveningStep===1){
        directorT-=dt;
        if(directorT<=0 && !flockFlying){ startFlockFlight({loops:1, landPerches:roostPerches.slice(0,24)}); eveningStep=2; }
        return;
      }
      // rain shelter: grounded birds are periodically moved under the
      // expressway girders / eaves until the rain passes
      if(ENV.rain>0.4 && ph!=='roost' && !flockFlying && !playerControl.active){
        shelterT-=dt*timeScale/60;
        if(shelterT<=0){
          shelterT=14;
          const grounded=pigeons.filter(p=>!p.player&&(p.state==='forage'||p.state==='drink'||p.state==='bathe')).length;
          if(grounded>3) startFlockFlight({fraction:0.55, landPerches:nearestPerches(V3(0,0,0),24,['girder','ledge'])});
        }
      }
      if((ph==='forage'||ph==='peak'||ph==='loaf') && !playerControl.active){
        // timers run in sim-minutes, so the flight duty cycle (a small
        // fraction of the day) holds at any time scale — at ×60 a routine
        // relocation comes every 80–170 sim-min and lasts well under a
        // minute of flight, instead of back-to-back full-flock circuits
        directorT-=dt*timeScale/60;
        if(flockFlying) directorT=Math.max(directorT, 20); // never chain flights back-to-back
        if(directorT<=0 && !flockFlying && !falcon.active){
          directorT=rand(80,170)*(1+ENV.wind*1.8); // strong wind stretches the gap between flights
          const r=Math.random();
          const fr=flockFlightRatio(), overCap=fr>FLIGHT_TIME_RATIO_CAP;
          if(ENV.rain>0.4 || (ENV.wind>0.65 && Math.random()<0.7)){
            // bad weather: the flock stays down / under cover this tick
          } else if(fr>FLIGHT_TIME_RATIO_CAP*2){
            // well over the design cap: no routine flight this tick
          } else if(r<0.5){
            // short hop by a subgroup to another feeding site; the rest stay down
            // (over cap → duration is cut to a single segment first)
            startFlockFlight({segments:overCap?1:randi(2,4), fraction:rand(0.3,0.55), landSite:FORAGE[randi(0,FORAGE.length-1)]});
          } else if(r<0.75){
            startFlockFlight({segments:overCap?1:randi(2,3), fraction:rand(0.25,0.45), landPerches:nearestPerches(V3(rand(-200,200),0,rand(-200,200)),24,['roof'])});
          }
          // else: no flight this tick — the flock simply keeps foraging / loafing
        }
      }
    }

    /* daylight — solar position from the season's declination (Osaka lat) */
    const SKY={ night:new THREE.Color(0x141e2a), dawn:new THREE.Color(0xd9a878), dusk:new THREE.Color(0xdd8f5e), gray:new THREE.Color(0x878e94) };
    const SUN_LOW=new THREE.Color(0xff9a4d), SUN_HIGH=new THREE.Color(0xfff3e2);
    const _skyC=new THREE.Color();
    /* B5: the 10 m shadow-centre cell updateDaylight() picks each
       frame, mirrored to module scope so the shadow update
       controller can detect cell moves without recomputing focus. */
    let shadowCellX=null, shadowCellZ=null;
( function () {

	/**
	 * Based on "A Practical Analytic Model for Daylight"
	 * aka The Preetham Model, the de facto standard analytic skydome model
	 * https://www.researchgate.net/publication/220720443_A_Practical_Analytic_Model_for_Daylight
	 *
	 * First implemented by Simon Wallner
	 * http://www.simonwallner.at/projects/atmospheric-scattering
	 *
	 * Improved by Martin Upitis
	 * http://blenderartists.org/forum/showthread.php?245954-preethams-sky-impementation-HDR
	 *
	 * Three.js integration by zz85 http://twitter.com/blurspline
	 */

	class Sky extends THREE.Mesh {

		constructor() {

			const shader = Sky.SkyShader;
			const material = new THREE.ShaderMaterial( {
				name: 'SkyShader',
				fragmentShader: shader.fragmentShader,
				vertexShader: shader.vertexShader,
				uniforms: THREE.UniformsUtils.clone( shader.uniforms ),
				side: THREE.BackSide,
				depthWrite: false
			} );
			super( new THREE.BoxGeometry( 1, 1, 1 ), material );

		}

	}

	Sky.prototype.isSky = true;
	Sky.SkyShader = {
		uniforms: {
			'turbidity': { value: 2 },
			'rayleigh': { value: 1 },
			'mieCoefficient': { value: 0.005 },
			'mieDirectionalG': { value: 0.8 },
			'sunPosition': { value: new THREE.Vector3() },
			'up': { value: new THREE.Vector3( 0, 1, 0 ) }
		},
		vertexShader:
  /* glsl */
  `
		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;
		uniform vec3 up;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		// constants for atmospheric scattering
		const float e = 2.71828182845904523536028747135266249775724709369995957;
		const float pi = 3.141592653589793238462643383279502884197169;

		// wavelength of used primaries, according to preetham
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		// this pre-calcuation replaces older TotalRayleigh(vec3 lambda) function:
		// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
		const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

		// mie stuff
		// K coefficient for the primaries
		const float v = 4.0;
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
		const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

		// earth shadow hack
		// cutoffAngle = pi / 1.95;
		const float cutoffAngle = 1.6110731556870734;
		const float steepness = 1.5;
		const float EE = 1000.0;

		float sunIntensity( float zenithAngleCos ) {
			zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
			return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
		}

		vec3 totalMie( float T ) {
			float c = ( 0.2 * T ) * 10E-18;
			return 0.434 * c * MieConst;
		}

		void main() {

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vSunDirection = normalize( sunPosition );

			vSunE = sunIntensity( dot( vSunDirection, up ) );

			vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

			float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

			// extinction (absorbtion + out scattering)
			// rayleigh coefficients
			vBetaR = totalRayleigh * rayleighCoefficient;

			// mie coefficients
			vBetaM = totalMie( turbidity ) * mieCoefficient;

		}`,
		fragmentShader:
  /* glsl */
  `
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		uniform float mieDirectionalG;
		uniform vec3 up;

		const vec3 cameraPos = vec3( 0.0, 0.0, 0.0 );

		// constants for atmospheric scattering
		const float pi = 3.141592653589793238462643383279502884197169;

		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

		// optical length at zenith for molecules
		const float rayleighZenithLength = 8.4E3;
		const float mieZenithLength = 1.25E3;
		// 66 arc seconds -> degrees, and the cosine of that
		const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

		// 3.0 / ( 16.0 * pi )
		const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
		// 1.0 / ( 4.0 * pi )
		const float ONE_OVER_FOURPI = 0.07957747154594767;

		float rayleighPhase( float cosTheta ) {
			return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
		}

		float hgPhase( float cosTheta, float g ) {
			float g2 = pow( g, 2.0 );
			float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
			return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
		}

		void main() {

			vec3 direction = normalize( vWorldPosition - cameraPos );

			// optical length
			// cutoff angle at 90 to avoid singularity in next formula.
			float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
			float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
			float sR = rayleighZenithLength * inverse;
			float sM = mieZenithLength * inverse;

			// combined extinction factor
			vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
			vec3 betaRTheta = vBetaR * rPhase;

			float mPhase = hgPhase( cosTheta, mieDirectionalG );
			vec3 betaMTheta = vBetaM * mPhase;

			vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
			Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

			// nightsky
			float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
			float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
			vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
			vec3 L0 = vec3( 0.1 ) * Fex;

			// composition + solar disc
			float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
			L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

			vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

			vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );

			gl_FragColor = vec4( retColor, 1.0 );

			#include <tonemapping_fragment>
			#include <encodings_fragment>

		}`
	};

	THREE.Sky = Sky;

} )();

    /* C2 (phase 2): PMREM environment from the Sky dome, regenerated
       only at milestones — when the quantised sun direction, the
       season / weather key, or the cloud bucket changes, and at most
       once per 300 ms of real time. One regeneration renders a
       one-mesh scene into a 256px cube target (sub-ms class on a
       typical GPU); the previous target is disposed each time. */
    const skyEnvScene=new THREE.Scene();
    const HORIZON_WHITE=new THREE.Color(0xeaf2f8);
    const _horC=new THREE.Color(), _sunDir=new THREE.Vector3(0,1,0);
    let skyDome=null, pmremGen=null, envRT=null, envRegenCount=0;
    let lastEnvKey='', lastEnvMs=-1e9, envTuned=false;
    function tuneEnvIntensity(){
      if(cityMeshMat) cityMeshMat.envMapIntensity=0.7;
      if(cityGhostMat) cityGhostMat.envMapIntensity=0.7;
      if(waterMatRef) waterMatRef.envMapIntensity=1.0;
      for(const p of pigeons){
        if(!p.mesh) continue;
        (p.mesh.g||p.mesh).traverse(o=>{ if(o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity=0.3; });
      }
    }
    function regenEnvironment(){
      skyEnvScene.add(skyDome); // moves the dome into the env-only scene
      const oldTM=renderer.toneMapping;
      renderer.toneMapping=THREE.NoToneMapping; // keep ACES out of the env capture (r128 PMREM does not switch it)
      const rt=pmremGen.fromScene(skyEnvScene, 0);
      renderer.toneMapping=oldTM;
      scene.add(skyDome); // move the dome back into the main scene
      if(envRT) envRT.dispose();
      envRT=rt; scene.environment=rt.texture;
      envRegenCount++;
      if(!envTuned){ envTuned=true; tuneEnvIntensity(); }
    }
    function updateSkyEnv(sa, sinEl){
      if(!skyDome){
        skyDome=new THREE.Sky();
        skyDome.scale.setScalar(450000);
        skyDome.frustumCulled=false;
        scene.add(skyDome);
        scene.background=null; // the dome replaces the flat background colour
        pmremGen=new THREE.PMREMGenerator(renderer);
      }
      const ce=Math.cos(sa.el);
      _sunDir.set(Math.sin(sa.az)*ce, sinEl, -Math.cos(sa.az)*ce).normalize();
      const u=skyDome.material.uniforms, cl=ENV.cloud;
      u.sunPosition.value.copy(_sunDir);
      u.turbidity.value=lerp(4, 16, cl);       // overcast: haze up
      u.rayleigh.value=lerp(2.0, 0.7, cl);     // overcast: blue down
      u.mieCoefficient.value=lerp(0.006, 0.014, cl);
      u.mieDirectionalG.value=0.8;
      const key=Math.round(sinEl/0.05)+':'+Math.round(sa.az/0.06)+':'+seasonKey+':'+weatherKey+':'+Math.round(cl/0.25);
      const now=performance.now();
      if(key!==lastEnvKey && now-lastEnvMs>=300){ lastEnvKey=key; lastEnvMs=now; regenEnvironment(); }
    }
    function updateDaylight(){
      const st=solarTimes(ENV.doy); SUN.rise=st.rise; SUN.set=st.set; SUN.decl=st.decl;
      const sa=sunPos(simMin, st.decl), sinEl=sa.sinEl;
      const dayF=clamp(sinEl*2.4,0,1);
      if(sinEl<-0.06) _skyC.copy(SKY.night);
      else if(sinEl<0.25) _skyC.copy(SKY.dawn).lerp(ENV.skyTint, clamp((sinEl+0.06)/0.31,0,1));
      else _skyC.copy(ENV.skyTint);
      const lowSun=clamp(1-Math.abs(sinEl)/0.28,0,1); // warm band around sunrise / sunset
      if(sinEl>-0.05) _skyC.lerp(SKY.dusk, lowSun*0.35*(simMin>SUN.rise?1:0.6));
      _skyC.lerp(SKY.gray, ENV.cloud*(0.25+0.45*dayF)); // overcast wash
      // C2: the background is the Sky dome; the fog colour tracks the
      // horizon — the existing sky palette lifted toward the pale
      // horizon band in daylight, damped by cloud cover.
      _horC.copy(_skyC).lerp(HORIZON_WHITE, 0.30*dayF*(1-ENV.cloud*0.65));
      scene.fog.color.copy(_horC);
      updateSkyEnv(sa, sinEl);
      let fNear=700, fFar=2600;
      fFar=lerp(fFar, 950, ENV.cloud*0.7); fNear=lerp(fNear, 260, ENV.cloud*0.7);
      if(ENV.rain>0.05){ fFar=lerp(fFar, 620, ENV.rain); fNear=lerp(fNear, 90, ENV.rain); }
      if(ENV.snow>0.05){ fFar=lerp(fFar, 700, ENV.snow); fNear=lerp(fNear, 110, ENV.snow); }
      scene.fog.near=fNear; scene.fog.far=fFar;
      const R=640, ce=Math.cos(sa.el);
      const fpS=focus(); // shadow camera rides along with the watched bird
      const txS=Math.round(fpS.pos.x/10)*10, tzS=Math.round(fpS.pos.z/10)*10;
      shadowCellX=txS; shadowCellZ=tzS;
      sun.target.position.set(txS, 0, tzS);
      sun.position.set(txS+Math.sin(sa.az)*ce*R, Math.max(sinEl,0.03)*R, tzS-Math.cos(sa.az)*ce*R);
      sun.intensity=(0.05+dayF*1.45)*(1-ENV.cloud*0.85);
      sun.color.copy(SUN_LOW).lerp(SUN_HIGH, clamp(sinEl*2.2,0,1)); // colour temperature follows elevation
      sun.castShadow=ENV.cloud<0.72 && sinEl>0.02; // overcast: shadows wash out
      hemi.intensity=(0.18+dayF*0.55)*(1-ENV.cloud*0.3);
      amb.intensity=0.1+dayF*0.06;
      // window lights come on as the sun drops below the horizon line
      const darkF=clamp((0.08-sinEl)/0.22,0,1);
      winLightMat.opacity=darkF*0.95;
      winLightMesh.visible=darkF>0.03;
      // C1: facade emissive windows have their own, slightly earlier
      // ramp, independent of the winLight instanced planes above
      const glowF=clamp((0.12-sinEl)/0.24,0,1);
      c7GlowF=glowF; // C7 (Issue #26): dusk/night gate for the post pass
      if(cityMeshMat) cityMeshMat.emissiveIntensity=glowF*1.3;
      if(cityGhostMat) cityGhostMat.emissiveIntensity=glowF*1.3;
    }

    /* ================= camera control ================= */
    let camMode='orbit';
    const orbit={az:0.7, el:0.55, r:30, tx:0, ty:2, tz:0, idle:0};
    { const fpI=focus(); orbit.tx=fpI.pos.x; orbit.ty=fpI.pos.y+0.4; orbit.tz=fpI.pos.z; }
    const followPos=V3(140,80,260);
    let povFov=55;
    const pointers={down:false, x:0, y:0, mx:0, my:0};
    const cv=renderer.domElement;
    cv.addEventListener('pointerdown', e=>{ pointers.down=true; pointers.x=e.clientX; pointers.y=e.clientY; orbit.idle=0; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e=>{
      pointers.mx=(e.clientX/innerWidth)*2-1; pointers.my=(e.clientY/innerHeight)*2-1;
      if(!pointers.down) return;
      const dx=e.clientX-pointers.x, dy=e.clientY-pointers.y; pointers.x=e.clientX; pointers.y=e.clientY; orbit.idle=0;
      if(camMode==='orbit'||camMode==='follow'){ orbit.az-=dx*0.005; orbit.el=clamp(orbit.el+dy*0.004, 0.06, 1.35); }
    });
    window.addEventListener('pointerup', ()=>{ pointers.down=false; });
    cv.addEventListener('wheel', e=>{ if(camMode==='orbit'){ orbit.r=clamp(orbit.r*Math.exp(e.deltaY*0.001), 1.2, 700); } }, {passive:true});

    function updateCamera(dt){
      orbit.idle+=dt;
      if(camMode==='orbit'){
        if(orbit.idle>4) orbit.az+=dt*0.018;
        // the orbit target tracks the watched bird (or the flock anchor in
        // flight) so observation stays close instead of framing empty city
        const fp0=focus();
        const flying0=flockFlying||fp0.state==='fly'||fp0.state==='takeoff'||fp0.state==='descend';
        const dx=(flying0?anchor.pos.x:fp0.pos.x), dy=(flying0?anchor.pos.y:fp0.pos.y)+0.4, dz=(flying0?anchor.pos.z:fp0.pos.z);
        const kk=clamp(dt*2.2,0,1);
        // a fixed viewpoint preset holds its target until it expires
        // (dragging still orbits around that target meanwhile)
        if(typeof viewpointHold!=='undefined' && viewpointHold>0){
          viewpointHold-=dt;
        } else {
          orbit.tx+=(dx-orbit.tx)*kk; orbit.ty+=(dy-orbit.ty)*kk; orbit.tz+=(dz-orbit.tz)*kk;
        }
        const t=_v1.set(orbit.tx, orbit.ty, orbit.tz);
        const cx=t.x+Math.sin(orbit.az)*Math.cos(orbit.el)*orbit.r;
        const cy=t.y+Math.sin(orbit.el)*orbit.r;
        const cz=t.z+Math.cos(orbit.az)*Math.cos(orbit.el)*orbit.r;
        camera.position.lerp(_v2.set(cx,cy,cz), clamp(dt*3,0,1));
        camera.lookAt(t);
        povFov=lerp(povFov,55,dt*3);
      } else if(camMode==='follow'){
        const fp=focus();
        const tgt=(flockFlying||fp.state==='fly'||fp.state==='takeoff'||fp.state==='descend')?
          _v1.copy(anchor.pos) : _v1.copy(fp.pos);
        if(flockFlying===false && fp.state!=='fly') tgt.copy(fp.pos);
        const hd=(fp.state==='fly')?anchor.heading:fp.heading;
        const back=_v2.set(Math.sin(hd),0,Math.cos(hd));
        const des=_v3.copy(tgt).addScaledVector(back,-11).add(_v4.set(0,3.2,0));
        if(followSide) des.addScaledVector(_v4.set(Math.cos(hd),0,-Math.sin(hd)), followSide); // occlusion-avoid offset
        followPos.lerp(des, clamp(dt*2.4,0,1));
        camera.position.copy(followPos);
        camera.lookAt(_v4.copy(tgt).addScaledVector(back,6).setY(tgt.y+0.4));
        povFov=lerp(povFov,55,dt*3);
      } else if(camMode==='pov'||(camMode==='play'&&playView==='pov')){
        const fp=focus();
        const hp=fp.headWorld(_v1);
        // flight: head is actively stabilised; walk: hold/thrust steps come through head world pos
        const k=fp.state==='fly'||fp.state==='takeoff'||fp.state==='descend'? clamp(dt*14,0,1):1;
        camera.position.lerp(hp, k);
        const hd=fp.heading + fp.mesh.headG.rotation.y;
        // sit just ahead of the beak so the bird's own head/breast stays out of frame
        camera.position.x+=Math.sin(hd)*0.13; camera.position.z+=Math.cos(hd)*0.13; camera.position.y+=0.02;
        const pitch=fp.mesh.headG.rotation.x*0.7 - fp.mesh.bodyG.rotation.x*0.4;
        _v2.set(hp.x+Math.sin(hd)*Math.cos(pitch), hp.y-Math.sin(pitch), hp.z+Math.cos(hd)*Math.cos(pitch));
        camera.lookAt(_v2);
        povFov=lerp(povFov, (camMode==='pov')?102:88, dt*3);
      } else if(camMode==='play'){
        const pp=playerPigeon;
        const back=_v1.set(Math.sin(pp.heading),0,Math.cos(pp.heading));
        const des=_v2.copy(pp.pos).addScaledVector(back,-8.2).add(_v3.set(0,2.8,0));
        des.y=Math.max(des.y, pp.pos.y+1.2);
        camera.position.lerp(des, clamp(dt*7,0,1));
        camera.lookAt(_v3.copy(pp.pos).addScaledVector(back,9).add(_v4.set(0,0.6,0)));
        povFov=lerp(povFov,62,dt*3);
      }
      if(camMode!=='pov') collideCamera();
      if(Math.abs(camera.fov-povFov)>0.1){ camera.fov=povFov; camera.updateProjectionMatrix(); }
    }
    function collideCamera(){
      if(camera.position.y<0.7) camera.position.y=0.7; // never below ground
      // at close range the camera must not end up inside a neighbouring
      // building: lift it just above that roof instead
      const cell=aabbGrid.get(Math.floor(camera.position.x/80)+','+Math.floor(camera.position.z/80));
      if(!cell) return;
      let lifted=false;
      for(let ci=0;ci<cell.length;ci++){
        const b=buildingsAABB[cell[ci]];
        if(camera.position.x>b.x0-0.4 && camera.position.x<b.x1+0.4 &&
           camera.position.z>b.z0-0.4 && camera.position.z<b.z1+0.4 &&
           camera.position.y<b.h+1.3){
          camera.position.y=b.h+1.3; lifted=true;
        }
      }
      if(lifted){ // keep the view direction after the lift
        const dir=camera.getWorldDirection(_v1);
        camera.lookAt(_v2.copy(camera.position).addScaledVector(dir,10));
      }
    }

    /* ================= occlusion handling （遮蔽対処） =================
       In orbit/follow, buildings that block the camera→watched-bird line
       are faded individually (per-building geometry groups on the merged
       city mesh) to opacity 0.12 over ~300 ms, keeping a wireframe
       outline. Candidates are gathered from an 8 m corridor around the
       sight line. Modes: on / auto / off (default auto). */
    let occlMode='auto';
    let followSide=0; // lateral camera offset used by the avoid action (follow)
    const occl={set:new Set(), wantEmpty:true, opacity:1, checkT:0};
    const occlEdgeMat=new THREE.LineBasicMaterial({color:0x12755c, transparent:true, opacity:0.9});
    const occlEdges=[];
    for(let i=0;i<5;i++){
      const eg=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)), occlEdgeMat);
      eg.visible=false; scene.add(eg); occlEdges.push(eg);
    }
    function segHitsBuilding(a, b, bi, pad){
      const bb=buildingsAABB[bi];
      let t0=0, t1=1;
      const axes=[[a.x,b.x-a.x,bb.x0-pad,bb.x1+pad],[a.y,b.y-a.y,-2,bb.h+0.3],[a.z,b.z-a.z,bb.z0-pad,bb.z1+pad]];
      for(const [o,d,mn,mx] of axes){
        if(Math.abs(d)<1e-8){ if(o<mn||o>mx) return false; }
        else{
          let ta=(mn-o)/d, tb=(mx-o)/d;
          if(ta>tb){ const t=ta; ta=tb; tb=t; }
          t0=Math.max(t0,ta); t1=Math.min(t1,tb);
          if(t0>t1) return false;
        }
      }
      return true;
    }
    function findOccludersFrom(a){
      const out=new Set();
      const b=focus().pos;
      const dist=a.distanceTo(b);
      if(dist<4) return out; // close-up range: nothing meaningful blocks
      const cand=new Set();
      const steps=Math.ceil(dist/4);
      let px=-(b.z-a.z)/dist, pz=(b.x-a.x)/dist; // horizontal perpendicular
      for(let i=0;i<=steps;i++){
        const t=i/steps;
        const x=a.x+(b.x-a.x)*t, z=a.z+(b.z-a.z)*t;
        for(const off of [0, 8, -8]){ // 8 m corridor around the sight line
          const cell=aabbGrid.get(Math.floor((x+px*off)/80)+','+Math.floor((z+pz*off)/80));
          if(cell) for(const bi of cell) cand.add(bi);
        }
      }
      for(const bi of cand){ if(segHitsBuilding(a, b, bi, 0.4)){ out.add(bi); if(out.size>=5) break; } }
      return out;
    }
    function applyOcclGroups(){
      /* X1 (Issue #28): the fade groups are rebuilt on every city
         geometry -- the legacy fade mesh (holding the
         fade-candidate buildings) and each spatial chunk. Each
         record's list carries that geometry's local per-building
         ranges, so a building in occl.set receives material index
         1 in exactly the one geometry that contains it, and every
         geometry without an occluded building collapses to a
         single material-0 group, as the pre-X1 single mesh did. */
      for(const rec of cityFadeRecs){
        const g=rec.geo, total=g.attributes.position.count;
        g.clearGroups();
        const hits=occl.set.size?rec.list.filter(r=>occl.set.has(r.bi)):[];
        if(!hits.length){ g.addGroup(0, total, 0); continue; }
        hits.sort((a,b)=>a.start-b.start);
        let cursor=0;
        for(const r of hits){
          if(r.start>cursor) g.addGroup(cursor, r.start-cursor, 0);
          g.addGroup(r.start, r.count, 1);
          cursor=r.start+r.count;
        }
        if(cursor<total) g.addGroup(cursor, total-cursor, 0);
      }
      if(occl.set.size){
        const sorted=[...occl.set].sort((x,y)=>buildingVertRanges[x].start-buildingVertRanges[y].start);
        occlEdges.forEach((eg,i)=>{
          const bi=sorted[i];
          if(bi===undefined){ eg.visible=false; return; }
          const bb=buildingsAABB[bi];
          eg.visible=true;
          eg.position.set((bb.x0+bb.x1)/2, bb.h/2, (bb.z0+bb.z1)/2);
          eg.scale.set(Math.max(0.1,bb.x1-bb.x0), Math.max(0.1,bb.h), Math.max(0.1,bb.z1-bb.z0));
        });
        return;
      }
      occlEdges.forEach(eg=>{ eg.visible=false; });
    }
    function updateOcclusion(dt){
      occl.checkT-=dt;
      if(occl.checkT<=0){
        occl.checkT=0.3;
        const active=(occlMode!=='off') && (camMode==='orbit'||camMode==='follow');
        const want=active?findOccludersFrom(camera.position):new Set();
        occl.wantEmpty=!want.size;
        if(want.size && (want.size!==occl.set.size || [...want].some(bi=>!occl.set.has(bi)))){
          occl.set=want; applyOcclGroups();
        }
        if(occl.wantEmpty) followSide=0;
      }
      const target=(occl.set.size && !occl.wantEmpty)?0.12:1;
      if(Math.abs(occl.opacity-target)>0.005){
        occl.opacity+=clamp(target-occl.opacity, -dt*3.2, dt*3.2); // ~300 ms fade
        cityGhostMat.opacity=occl.opacity;
      }
      if(occl.wantEmpty && occl.opacity>=0.995 && occl.set.size){
        occl.set=new Set(); applyOcclGroups(); occl.opacity=1; cityGhostMat.opacity=1;
      }
      const banner=document.getElementById('occl-banner');
      if(banner) banner.classList.toggle('show', occl.set.size>0 && occl.opacity<0.6);
    }
    function avoidOcclusion(){
      // try stepping the camera sideways (azimuth in orbit, lateral
      // offset up to 12 m in follow) until the sight line is clear
      if(camMode==='orbit'){
        const cur=orbit.az;
        for(const da of [0.55,-0.55,1.1,-1.1,1.7,-1.7]){
          const az=cur+da;
          const t=_v1.set(orbit.tx, orbit.ty, orbit.tz);
          const cand=_v2.set(t.x+Math.sin(az)*Math.cos(orbit.el)*orbit.r, t.y+Math.sin(orbit.el)*orbit.r, t.z+Math.cos(az)*Math.cos(orbit.el)*orbit.r);
          if(!findOccludersFrom(cand).size){ orbit.az=az; orbit.idle=0; toast('カメラを横に移して死角を回避した'); return; }
        }
        orbit.el=clamp(orbit.el+0.35, 0.06, 1.35); orbit.idle=0;
        toast('真横では抜けなかったので、少し上から見る角度にした');
      } else if(camMode==='follow'){
        for(const s of [6,-6,12,-12]){
          followSide=s;
          const fp=focus();
          const hd=(fp.state==='fly')?anchor.heading:fp.heading;
          const side=_v1.set(Math.cos(hd),0,-Math.sin(hd));
          const cand=_v2.copy(camera.position).addScaledVector(side, s);
          if(!findOccludersFrom(cand).size){ toast('カメラを '+Math.abs(s)+' m 横にずらして回避した'); return; }
        }
        toast('横移動では抜けなかった — 透かし表示のまま追跡する');
      } else {
        toast('カメラ回避は観察・追跡モードで使える');
      }
    }

    /* ================= render quality / dynamic resolution ================= */
    let qualityMode='high';
    let renderScale=1, frameEMA=16, slowT=0, fastT=0;
    let fpsFrames=0, fpsTime=0, fpsValue=0;
    function dprCap(){ return qualityMode==='ultra'?2.0:1.5; }
    /* ---- shadow-map throttling (B5) ----
       shadowMap.autoUpdate is false, so the shadow map is redrawn
       only on frames where updateShadowGate() sets
       renderer.shadowMap.needsUpdate. The gate remembers the state
       at the last redraw and fires when any trigger holds:
       (a) the sun key — each sun.position component rounded to 2 m —
           changed, (b) the 10 m shadow-centre cell moved,
       (c) the frame cadence cap since the last redraw was reached
           (timeScale<=2: 3 frames, <=10: 6, else 12),
       (d) a discrete environment change: season / weather key, or
           sun.castShadow flipping.
       framesSince starts huge so the first frame always redraws. */
    const shadowGate={
      sunKey:null, cellX:null, cellZ:null,
      envKey:null, cast:null,
      framesSince:1e9,
    };
    function shadowCadenceCap(){
      if(timeScale<=2) return 3;
      if(timeScale<=10) return 6;
      return 12;
    }
    function updateShadowGate(){
      shadowGate.framesSince++;
      const sunKey=Math.round(sun.position.x/2)+':'+Math.round(sun.position.y/2)+':'+Math.round(sun.position.z/2);
      const envKey=seasonKey+'|'+weatherKey;
      const cast=sun.castShadow;
      const due=
        shadowGate.framesSince>=shadowCadenceCap() ||
        sunKey!==shadowGate.sunKey ||
        shadowCellX!==shadowGate.cellX || shadowCellZ!==shadowGate.cellZ ||
        envKey!==shadowGate.envKey || cast!==shadowGate.cast;
      if(!due) return false;
      renderer.shadowMap.needsUpdate=true;
      shadowGate.sunKey=sunKey;
      shadowGate.cellX=shadowCellX; shadowGate.cellZ=shadowCellZ;
      shadowGate.envKey=envKey; shadowGate.cast=cast;
      shadowGate.framesSince=0;
      return true;
    }
    /* quality-linked shadow resolution: Ultra is always 2048; High
       is 2048 except while dynamic resolution sits at its deepest
       step (renderScale<=0.7), where it drops to 1024 and comes
       back on recovery. */
    function desiredShadowMapSize(){
      if(qualityMode==='ultra') return 2048;
      return renderScale<=0.7?1024:2048;
    }
    function applyShadowMapSize(){
      const size=desiredShadowMapSize();
      if(sun.shadow.mapSize.x===size) return;
      sun.shadow.mapSize.set(size, size);
      if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; }
      shadowGate.framesSince=1e9; // force a redraw at the new size on the next frame
    }
    function applyRenderScale(){
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, dprCap())*renderScale);
      renderer.setSize(innerWidth, innerHeight);
      applyShadowMapSize();
    }
    /* ---- C6 (Issue #25): planar-reflection state and render ----
       Mode comes from the reflection selector: 'auto' enables the
       reflection only in Ultra, 'on' forces it at any quality, 'off'
       always disables it (the quality-linked off switch the issue
       requires). The default is 'auto': the reflection pass redraws
       the tagged building + elevated geometry (about 6 calls /
       128k triangles) every frame, an estimated mid-to-large cost,
       so High keeps its current default behaviour until the
       post-release verification batch measures the real impact.
       The render target is 512 in Ultra and 256 otherwise (the
       issue's 256-512 range); resizing it reallocates the target. */
    function c6EffectiveEnabled(){
      if(c6State.mode==='off') return false;
      if(c6State.mode==='on') return true;
      return qualityMode==='ultra';
    }
    function applyReflectionC6(){
      c6State.enabled=c6EffectiveEnabled();
      for(const om of c6Overlays) om.visible=c6State.enabled;
      const size=qualityMode==='ultra'?512:256;
      if(size!==c6RtSize){ c6RtSize=size; c6RenderTarget.setSize(size, size); }
    }
    const _c6Tgt=new THREE.Vector3(), _c6Up=new THREE.Vector3();
    const _c6Bias=new THREE.Matrix4().set(
      0.5,0,0,0.5, 0,0.5,0,0.5, 0,0,0.5,0.5, 0,0,0,1);
    /* Mirror the main camera across the water plane, render only the
       reflection layer into the target, and rebuild the projective
       texture matrix from the base water mesh's transform (shared by
       every water polygon, so one matrix serves all overlays).
       Runs immediately before the main render: when the B5 shadow
       gate fires on this frame, the shadow map is drawn during this
       pass instead — its content depends only on the light, so the
       main render that follows uses the same, already-updated map.
       renderer.info auto-resets per render, so bench figures keep
       describing the main pass only. */
    function renderReflectionC6(){
      if(!c6State.enabled || !c6WaterBase) return;
      camera.getWorldDirection(_c6Tgt); _c6Tgt.add(camera.position);
      _c6Tgt.y=2*C6_REFL_Y-_c6Tgt.y;
      c6VirtualCamera.position.set(camera.position.x,
        2*C6_REFL_Y-camera.position.y, camera.position.z);
      _c6Up.copy(camera.up); _c6Up.y=-_c6Up.y;
      c6VirtualCamera.up.copy(_c6Up);
      c6VirtualCamera.lookAt(_c6Tgt);
      c6VirtualCamera.fov=camera.fov; c6VirtualCamera.aspect=camera.aspect;
      c6VirtualCamera.near=camera.near; c6VirtualCamera.far=camera.far;
      c6VirtualCamera.updateProjectionMatrix();
      c6VirtualCamera.updateMatrixWorld();
      c6WaterBase.updateMatrixWorld();
      c6TexMatrix.copy(_c6Bias)
        .multiply(c6VirtualCamera.projectionMatrix)
        .multiply(c6VirtualCamera.matrixWorldInverse)
        .multiply(c6WaterBase.matrixWorld);
      const prevTarget=renderer.getRenderTarget();
      renderer.setRenderTarget(c6RenderTarget);
      renderer.render(scene, c6VirtualCamera);
      renderer.setRenderTarget(prevTarget);
      c6State.renders++;
    }
    /* ---- C7 (Issue #26): post process, Ultra only, half resolution ----
       Hand-rolled on three r128 core only (no EffectComposer /
       UnrealBloomPass in this build). The pass runs only while the
       quality is Ultra AND the C1 lit-window ramp glowF is up
       (> 0.02), i.e. dusk to night; in every other state
       renderPostC7() returns before touching any target, so the
       default (non-Ultra) path is byte-for-byte the pre-C7 render.
       Pipeline, all at half the drawing-buffer resolution:
       (1) the scene is re-rendered into c7SrcRT, (2) a bright pass
       keeps only pixels whose luminance clears the 0.72 threshold
       (soft knee 0.25) -- at dusk/night those are the emissive
       parts: C1 lit windows (emissiveIntensity up to 1.3), the
       window-light planes and street lights, (3) two horizontal /
       vertical gaussian round trips blur the extraction, and
       (4) the result is additively composited over the main image,
       preceded by a grading pass (multiply blending: a slight warm
       shift plus vignette, both proportional to glowF). The main
       render itself still goes straight to the canvas (MSAA and
       draw order unchanged); the C6 reflection render and the B5
       shadow gate both run before it and are not touched -- the
       shadow map the post re-render consumes is the one the main
       render already updated. renderer.info is preserved across
       the post passes (autoReset off, main-pass calls / triangles
       restored) so the bench keeps describing the main pass.
       No SSAO (explicitly out of scope for this unit). */
    const C7_THRESHOLD=0.72, C7_KNEE=0.25, C7_BLOOM_STRENGTH=0.85, C7_AO_BASE_M=4.5;
    let c7GlowF=0; // written by updateDaylight() alongside emissiveIntensity
    function c7MakeRT(){
      const rt=new THREE.WebGLRenderTarget(2, 2,
        {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat});
      return rt;
    }
    const c7SrcRT=c7MakeRT(); c7SrcRT.depthBuffer=true; c7SrcRT.texture.encoding=THREE.sRGBEncoding;
    const c7BrightRT=c7MakeRT(), c7BlurRT=c7MakeRT();
    const C7_QUAD_VS='varying vec2 vUv;\nvoid main(){ vUv=uv; gl_Position=vec4(position.xy, 0.0, 1.0); }';
    const c7BrightMat=new THREE.ShaderMaterial({
      uniforms:{tDiffuse:{value:null}, uThreshold:{value:C7_THRESHOLD}, uKnee:{value:C7_KNEE}},
      vertexShader:C7_QUAD_VS,
      fragmentShader:[
        'uniform sampler2D tDiffuse; uniform float uThreshold; uniform float uKnee;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 c=texture2D(tDiffuse, vUv).rgb;',
        '  float lum=dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  float w=smoothstep(uThreshold, uThreshold+uKnee, lum);',
        '  gl_FragColor=vec4(c*w, 1.0);',
        '}',
      ].join('\n'),
      depthTest:false, depthWrite:false});
    const c7BlurMat=new THREE.ShaderMaterial({
      uniforms:{tDiffuse:{value:null}, uDir:{value:new THREE.Vector2(0,0)}},
      vertexShader:C7_QUAD_VS,
      fragmentShader:[
        'uniform sampler2D tDiffuse; uniform vec2 uDir;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 s=texture2D(tDiffuse, vUv).rgb*0.227027;',
        '  s+=texture2D(tDiffuse, vUv+uDir*1.3846).rgb*0.3162162;',
        '  s+=texture2D(tDiffuse, vUv-uDir*1.3846).rgb*0.3162162;',
        '  s+=texture2D(tDiffuse, vUv+uDir*3.2308).rgb*0.0702703;',
        '  s+=texture2D(tDiffuse, vUv-uDir*3.2308).rgb*0.0702703;',
        '  gl_FragColor=vec4(s, 1.0);',
        '}',
      ].join('\n'),
      depthTest:false, depthWrite:false});
    const c7GradeMat=new THREE.ShaderMaterial({
      uniforms:{uGrade:{value:0}},
      vertexShader:C7_QUAD_VS,
      fragmentShader:[
        'uniform float uGrade;',
        'varying vec2 vUv;',
        'void main(){',
        '  float d=distance(vUv, vec2(0.5, 0.42));',
        '  float vig=1.0-0.22*uGrade*smoothstep(0.45, 0.95, d);',
        '  vec3 mul=vec3(1.0, 1.0-0.03*uGrade, 1.0-0.10*uGrade)*vig;',
        '  gl_FragColor=vec4(mul, 1.0);',
        '}',
      ].join('\n'),
      blending:THREE.CustomBlending, blendEquation:THREE.AddEquation,
      blendSrc:THREE.DstColorFactor, blendDst:THREE.ZeroFactor,
      transparent:true, depthTest:false, depthWrite:false});
    const c7BloomMat=new THREE.ShaderMaterial({
      uniforms:{tBloom:{value:null}, uStrength:{value:0}},
      vertexShader:C7_QUAD_VS,
      fragmentShader:[
        'uniform sampler2D tBloom; uniform float uStrength;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 b=texture2D(tBloom, vUv).rgb;',
        '  gl_FragColor=vec4(b*uStrength, 1.0);',
        '}',
      ].join('\n'),
      blending:THREE.AdditiveBlending,
      transparent:true, depthTest:false, depthWrite:false});
    const c7QuadCam=new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const c7QuadGeo=new THREE.PlaneGeometry(2, 2);
    const c7PassScene=new THREE.Scene();
    const c7PassMesh=new THREE.Mesh(c7QuadGeo, c7BrightMat);
    c7PassMesh.frustumCulled=false; c7PassScene.add(c7PassMesh);
    const c7OverlayScene=new THREE.Scene();
    const c7GradeMesh=new THREE.Mesh(c7QuadGeo, c7GradeMat);
    c7GradeMesh.frustumCulled=false; c7GradeMesh.renderOrder=10; c7OverlayScene.add(c7GradeMesh);
    const c7BloomMesh=new THREE.Mesh(c7QuadGeo, c7BloomMat);
    c7BloomMesh.frustumCulled=false; c7BloomMesh.renderOrder=11; c7OverlayScene.add(c7BloomMesh);
    const c7State={enabled:false, renders:0, w:0, h:0};
    const _c7DbSize=new THREE.Vector2();
    function c7EffectiveEnabled(){ return qualityMode==='ultra' && c7GlowF>0.02; }
    function c7EnsureSize(){
      renderer.getDrawingBufferSize(_c7DbSize);
      const w=Math.max(2, Math.floor(_c7DbSize.x/2)), h=Math.max(2, Math.floor(_c7DbSize.y/2));
      if(w===c7State.w && h===c7State.h) return;
      c7State.w=w; c7State.h=h;
      c7SrcRT.setSize(w, h); c7BrightRT.setSize(w, h); c7BlurRT.setSize(w, h);
    }
    function renderPostC7(){
      c7State.enabled=c7EffectiveEnabled();
      if(!c7State.enabled) return;
      c7EnsureSize();
      const info=renderer.info;
      const savedCalls=info.render.calls, savedTris=info.render.triangles;
      info.autoReset=false;
      try{
        renderer.setRenderTarget(c7SrcRT);
        renderer.render(scene, camera);
        c7PassMesh.material=c7BrightMat;
        c7BrightMat.uniforms.tDiffuse.value=c7SrcRT.texture;
        renderer.setRenderTarget(c7BrightRT);
        renderer.render(c7PassScene, c7QuadCam);
        c7PassMesh.material=c7BlurMat;
        const tx=1/c7State.w, ty=1/c7State.h;
        for(let i=0;i<2;i++){
          c7BlurMat.uniforms.tDiffuse.value=c7BrightRT.texture;
          c7BlurMat.uniforms.uDir.value.set(tx, 0);
          renderer.setRenderTarget(c7BlurRT);
          renderer.render(c7PassScene, c7QuadCam);
          c7BlurMat.uniforms.tDiffuse.value=c7BlurRT.texture;
          c7BlurMat.uniforms.uDir.value.set(0, ty);
          renderer.setRenderTarget(c7BrightRT);
          renderer.render(c7PassScene, c7QuadCam);
        }
        c7GradeMat.uniforms.uGrade.value=c7GlowF;
        c7BloomMat.uniforms.tBloom.value=c7BrightRT.texture;
        c7BloomMat.uniforms.uStrength.value=C7_BLOOM_STRENGTH*c7GlowF;
        renderer.setRenderTarget(null);
        const prevAutoClear=renderer.autoClear;
        renderer.autoClear=false;
        renderer.render(c7OverlayScene, c7QuadCam);
        renderer.autoClear=prevAutoClear;
        c7State.renders++;
      } finally {
        renderer.setRenderTarget(null);
        info.autoReset=true;
        info.render.calls=savedCalls; info.render.triangles=savedTris;
      }
    }
    function updateDynamicResolution(dt){
      frameEMA=frameEMA*0.95+(dt*1000)*0.05;
      fpsFrames++; fpsTime+=dt;
      if(fpsTime>=0.5){ fpsValue=Math.round(fpsFrames/fpsTime); fpsFrames=0; fpsTime=0; }
      if(frameEMA>24){ slowT+=dt; fastT=0; } else if(frameEMA<11){ fastT+=dt; slowT=0; } else { slowT=0; fastT=0; }
      if(slowT>2 && renderScale>0.7){ renderScale=Math.max(0.7, renderScale-0.15); applyRenderScale(); slowT=0; }
      else if(fastT>10 && renderScale<1){ renderScale=Math.min(1, renderScale+0.15); applyRenderScale(); fastT=0; }
    }

    /* ================= player control ================= */
    const playerControl={active:false};
    let playerPigeon=null, playView='chase';
    const keys={};
    window.addEventListener('keydown', e=>{
      keys[e.code]=true;
      if(e.code==='Space'){ e.preventDefault(); onActionButton(); }
    });
    window.addEventListener('keyup', e=>{ keys[e.code]=false; });
    const stick={x:0,y:0,active:false};
    const stickEl=document.getElementById('stick'), knob=document.getElementById('stick-knob');
    function stickHandle(e){
      const r=stickEl.getBoundingClientRect();
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      stick.x=clamp((e.clientX-cx)/(r.width/2),-1,1);
      stick.y=clamp((e.clientY-cy)/(r.height/2),-1,1);
      knob.style.transform=`translate(calc(-50% + ${stick.x*32}px), calc(-50% + ${stick.y*32}px))`;
    }
    stickEl.addEventListener('pointerdown', e=>{ stick.active=true; stickEl.setPointerCapture(e.pointerId); stickHandle(e); });
    stickEl.addEventListener('pointermove', e=>{ if(stick.active) stickHandle(e); });
    stickEl.addEventListener('pointerup', ()=>{ stick.active=false; stick.x=0; stick.y=0; knob.style.transform='translate(-50%,-50%)'; });
    let touchFlap=false;
    const bf=document.getElementById('btn-flap');
    bf.addEventListener('pointerdown', e=>{ e.preventDefault(); touchFlap=true; });
    window.addEventListener('pointerup', ()=>{ touchFlap=false; });
    document.getElementById('btn-act').addEventListener('click', ()=>onActionButton());

    function onActionButton(){
      if(!playerControl.active||!playerPigeon) return;
      const p=playerPigeon;
      if(p.state==='fly'){ // land: nearest perch or ground below
        let best=null, bd=1e9;
        for(const pp of perchPoints){
          const d2=(pp.p.x-p.pos.x)**2+(pp.p.z-p.pos.z)**2;
          if(d2<bd && Math.abs(pp.p.y-p.pos.y)<26){ bd=d2; best=pp; }
        }
        p.landDelay=0; p.checked=false; p.checkPoint=null;
        if(best && bd<1600){ p.finalPoint=best.p; p.finalKind='perch'; p.perch=best; p.checkPoint=pickCheckPoint(best.p); p.checkFails=0; }
        else { p.finalPoint=V3(p.pos.x,0,p.pos.z); p.finalKind='ground'; p.site=FORAGE[0]; }
        p.setState('descend'); p.soloDescent=true;
        toast('着陸アプローチ — '+(p.finalKind==='perch'?'近くのレッジへ':'地上へ'));
      } else if(p.state==='perch'||p.state==='forage'||p.state==='roost'||p.state==='perchcheck'){
        p.setState('takeoff'); p.takeoffBeats=0; p.stateT=0;
        // nearby flockmates follow their leader (you)
        pigeons.forEach(q=>{
          if(q!==p && !q.player && q.pos.distanceTo(p.pos)<75 && (q.state==='perch'||q.state==='forage'||q.state==='roost')){
            q.setState('takeoff'); q.takeoffBeats=0; q.stateT=-rand(0.2,1.4); q.soloDescent=false;
          }
        });
        toast('離陸 — 群れがリーダー（あなた）に追随する');
      }
    }

    function updatePlayer(dt){
      if(!playerControl.active||!playerPigeon) return;
      const p=playerPigeon;
      const turnIn=(keys['ArrowLeft']||keys['KeyA']?-1:0)+(keys['ArrowRight']||keys['KeyD']?1:0)+stick.x+(pointers.down?pointers.mx*0.9:pointers.mx*0.55);
      const pitchIn=(keys['ArrowUp']||keys['KeyW']?1:0)+(keys['ArrowDown']||keys['KeyS']?-1:0)-stick.y-(pointers.down?pointers.my*0.7:0);
      if(p.state==='fly'||p.state==='takeoff'){
        p.heading+=clamp(turnIn,-1.4,1.4)*dt*1.35;
        const flap=keys['KeyW']||keys['ArrowUp']||touchFlap;
        const glide=keys['KeyS']||keys['ArrowDown'];
        p.glide=!!glide;
        p._vy=clamp(pitchIn,-1,1)*5.2 + (flap?2.6:0) + (glide?-1.8:-0.3);
        p._playerSpeed=flap?15.5:(glide?14.5:12.8);
        if(p.pos.y<4 && p._vy<0) p._vy=0;
      } else if(p.state==='forage'){
        p.heading+=clamp(turnIn,-1.4,1.4)*dt*2.4;
        const fwd=(keys['KeyW']||keys['ArrowUp']||touchFlap)?1:0;
        if(fwd>0){
          p.pos.addScaledVector(_v1.set(Math.sin(p.heading),0,Math.cos(p.heading)), 0.5*dt);
          p._walking=true; p._walkSpeed=0.5; p.bobPhase+=(0.5*dt)/HEADBOB.stride;
          if(Math.random()<dt*2) p.peckAnim=1;
        } else p._walking=false;
        p.pos.y=BODY_Y;
      }
      if(p.state==='fly') p.vel.y=clamp(p.vel.y,-7.5,7.5);
    }

    /* ================= UI wiring ================= */
    const $=id=>document.getElementById(id);
    let toastTimer=null;
    function toast(msg){
      const t=$('toast'); t.textContent=msg; t.classList.add('show');
      clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'), 3400);
    }
    const FACTS=[
      '巡航速度は 8–16 m/s。群れでは個体が最大 ±1.5 m/s 妥協して速度を揃える（Sankey & Portugal 2019）',
      '首振りの hold 相は歩行時間の約63%。視覚で駆動され、網膜像を安定させる（Frost 1978）',
      '視野は約320°、両眼の重なりは前方 約20°のみ。注視は頭の向きで決まる（Kano et al. 2024）',
      '羽ばたきは巡航 約6.6 Hz、離陸初動 8.9 Hz、着陸直前に 7.8 Hz へ再上昇（Berg & Biewener 2010）',
      '都市ドバトの32%以上は、ねぐらから 0.3 km 以内に留まる（バーゼル GPS 研究、Rose et al. 2006）',
      '水は、くちばしを浸したまま頭を上げずに連続吸引して飲む（ハト科の二重吸引）',
      '着陸前は近くのレッジに止まって安全確認。糞のある場所を安全と判断する（大阪府）',
      '色覚は4色型で、約409 nm のバイオレット帯まで見える（Bowmaker 1977／1997）',
      '群れのリーダーは、方向転換の遅延から決まる階層の上位個体（Nagy et al. 2010, Nature）',
      '採餌ピークは午前遅く〜午後。朝夕の二峰性が明瞭なのは繁殖個体のみ',
      'ドバトの飛行はねぐら・採餌場・水場の間の短距離移動が中心。日中の大半は地上の採餌と休息（loafing）で、飛んでいる時間のほうが短い',
      'ハヤブサからは「位置」ではなく「進行方向」から逃げる — 集団旋回はその創発（Papadopoulou et al. 2022）',
      '鳩の時間分解能は最大 約100–143 Hz。60 fps の映像は鳩にはちらついて見えうる',
    ];
    let factIdx=0;
    setInterval(()=>{ factIdx=(factIdx+1)%FACTS.length; $('factline').innerHTML='<b>生態メモ</b>　'+FACTS[factIdx]; }, 13000);
    $('factline').innerHTML='<b>生態メモ</b>　'+FACTS[0];

    document.querySelectorAll('#seg-mode button').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('#seg-mode button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on');
        setMode(b.dataset.mode);
      });
    });
    function setMode(mode){
      camMode=mode;
      $('povframe').classList.toggle('show', mode==='pov');
      $('telemetry').classList.toggle('mini-show', mode==='pov'||mode==='play');
      $('vision').classList.toggle('show', mode==='pov'||visionPinned);
      $('playhint').classList.toggle('show', mode==='play');
      document.body.classList.toggle('playing', mode==='play');
      document.body.classList.toggle('touch', ('ontouchstart' in window));
      if(mode==='play'){
        if(playerPigeon && playerPigeon!==focus()){ playerPigeon.player=false; }
        playerPigeon=focus(); playerPigeon.player=true; playerControl.active=true;
        toast(playerPigeon.name+' を操作中 — Space で離着陸、群れはあなたに追随する');
      } else {
        if(playerPigeon){ playerPigeon.player=false; }
        playerControl.active=false; playerPigeon=null;
      }
      if(mode==='follow') followPos.copy(camera.position);
    }
    document.querySelectorAll('#seg-time button').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('#seg-time button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); timeScale=parseFloat(b.dataset.ts);
      });
    });
    document.querySelectorAll('#seg-season button').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('#seg-season button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on');
        if(b.dataset.season==='auto'){ seasonMode='auto'; seasonKey=seasonFromDate(new Date()); ENV.doy=doyOf(new Date()); }
        else { seasonMode='manual'; seasonKey=b.dataset.season; ENV.doy=SEASONS[seasonKey].doy; }
        applySeasonVisuals();
        const st2=solarTimes(ENV.doy);
        toast('季節：'+SEASONS[seasonKey].label+' — 日の出 '+fmtMin(st2.rise)+'／日の入り '+fmtMin(st2.set)+' の日長で群れが動く');
      });
    });
    document.querySelectorAll('#seg-weather button').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('#seg-weather button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on');
        if(b.dataset.weather==='auto'){ weatherMode='auto'; ENV.wxT=Math.min(ENV.wxT, 20); toast('天候：自動 — 季節に応じた遷移に任せる'); return; }
        weatherMode='manual'; weatherKey=b.dataset.weather;
        toast('天候：'+WEATHERS[weatherKey].label+' — 画面と鳩の行動に即時反映');
        if(weatherKey==='rain'||weatherKey==='heavyrain') shelterNow(); // rain sends the flock under cover at once
      });
    });
    $('btn-feed').addEventListener('click', ()=>{
      // feed near the camera focus / focus pigeon
      const fp=focus();
      let best=FORAGE[0], bd=1e18;
      for(const s of FORAGE){ const d=s.p.distanceToSquared(fp.pos); if(d<bd){bd=d;best=s;} }
      scatterFeed(best);
    });
    $('btn-fly').addEventListener('click', ()=>{
      if(flockFlying){ toast('群れは飛行中'); return; }
      if(phaseOf(simMin)==='roost'){ toast('夜間はねぐらで休息中（時間を進めてください）'); return; }
      startFlockFlight({loops:randi(1,2), landSite:FORAGE[randi(0,FORAGE.length-1)]});
    });
    $('btn-falcon').addEventListener('click', launchFalcon);
    $('btn-evening').addEventListener('click', ()=>{ simMin=Math.max(0,SUN.set-22); toast('夕方へスキップ — 日の入り '+fmtMin(SUN.set)+' に向けて、水飲みのあとねぐらへ帰る'); });
    function setFocus(i){
      focusIdx=((i%pigeons.length)+pigeons.length)%pigeons.length;
      syncPlayerToFocus(); drawFocusLabel(); snapOrbitToFocus();
    }
    $('btn-focus-prev').addEventListener('click', ()=>setFocus(focusIdx-1));
    $('btn-focus-next').addEventListener('click', ()=>setFocus(focusIdx+1));
    function snapOrbitToFocus(){
      const fp=focus(); orbit.tx=fp.pos.x; orbit.ty=fp.pos.y+0.4; orbit.tz=fp.pos.z;
      if(typeof viewpointHold!=='undefined') viewpointHold=0;
    }
    $('btn-zoom-in').addEventListener('click', ()=>{ orbit.r=clamp(orbit.r*0.62, 1.2, 700); orbit.idle=0; });
    $('btn-zoom-out').addEventListener('click', ()=>{ orbit.r=clamp(orbit.r*1.6, 1.2, 700); orbit.idle=0; });
    $('btn-closeup').addEventListener('click', ()=>{
      if(camMode!=='orbit') document.querySelector('#seg-mode button[data-mode="orbit"]').click();
      // near eye-level with the bird: a high angle hides roosting birds
      // under the expressway deck and makes ground birds read as blobs
      snapOrbitToFocus(); orbit.r=2.4; orbit.el=0.22; orbit.idle=0;
      toast(focus().name+' のそばへ — 緑のリングと名前タグが注目鳩の目印');
    });
    /* fixed street-level viewpoints: the detail layer (poles/wires,
       vending machines, manholes, zebra markings, sleeve signs, sound
       barriers, river surface) only discriminates near the ground, so
       these presets put the camera there directly. Orbit target is set
       explicitly (not snapped back to the bird) and stays until the
       user drags or picks another view. */
    let viewpointHold=0; // seconds the orbit target stays on a viewpoint
    function goViewpoint(tx,ty,tz, r, el, az, msg){
      if(camMode!=='orbit') document.querySelector('#seg-mode button[data-mode="orbit"]').click();
      orbit.tx=tx; orbit.ty=ty; orbit.tz=tz; orbit.r=r; orbit.el=el; orbit.az=az; orbit.idle=0;
      viewpointHold=14;
      toast(msg);
    }
    $('btn-street').addEventListener('click', ()=>goViewpoint(27,1.1,30, 11, 0.14, 0.85,
      '路面レベル — 横断歩道・マンホール・自販機・袖看板・電柱と架線が見える'));
    $('btn-river').addEventListener('click', ()=>goViewpoint(-95,1.2,-243, 15, 0.16, 2.4,
      '道頓堀川の川面 — 流れの筋と波紋が動く'));
    $('btn-expressway').addEventListener('click', ()=>goViewpoint(-160,11.8,-16, 26, 0.10, 1.35,
      '阪神高速の側面 — 半透明の遮音壁越しにデッキが見える'));
    function syncPlayerToFocus(){
      if(camMode==='play'){ if(playerPigeon) playerPigeon.player=false; playerPigeon=focus(); playerPigeon.player=true; }
    }
    let visionPinned=false;
    $('btn-vision').addEventListener('click', ()=>{
      visionPinned=!visionPinned;
      $('btn-vision').classList.toggle('on', visionPinned);
      $('vision').classList.toggle('show', visionPinned||camMode==='pov');
    });
    $('btn-uv').addEventListener('click', ()=>{
      const on=$('stage').classList.toggle('uv');
      $('violetwash').classList.toggle('on', on);
      $('btn-uv').classList.toggle('on', on);
      toast(on?'バイオレット帯（約409 nm）を擬似色化 — 首の構造色の見え方が変わる':'通常の可視光表示に戻した');
    });
    $('btn-notes').addEventListener('click', ()=>{ $('notes').classList.add('open'); $('notes').setAttribute('aria-hidden','false'); });
    const closeNotes=()=>{ $('notes').classList.remove('open'); $('notes').setAttribute('aria-hidden','true'); };
    $('notes-close').addEventListener('click', closeNotes);
    $('notes-scrim').addEventListener('click', closeNotes);

    /* ---- weather chip popover (season/weather/temp/sun times in one place) ---- */
    $('chip-weather').addEventListener('click', ()=>{ $('wxpop').classList.toggle('show'); });

    /* ---- occlusion + quality controls ---- */
    $('occl-sel').addEventListener('change', e=>{ occlMode=e.target.value; });
    $('btn-occl-restore').addEventListener('click', ()=>{
      occlMode='off'; $('occl-sel').value='off';
      toast('透かし表示をオフにした（設定は右上のセレクタで変更できる）');
    });
    $('btn-occl-avoid').addEventListener('click', avoidOcclusion);
    $('quality-sel').addEventListener('change', e=>{ qualityMode=e.target.value; applyRenderScale(); applyReflectionC6(); });
    $('refl-sel').addEventListener('change', e=>{ c6State.mode=e.target.value; applyReflectionC6(); });
    applyReflectionC6(); // C6: initial state (auto + High = disabled)

    /* ---- pigeon roster （鳩を選ぶ） ---- */
    const ROSTER_FILTERS={
      all:()=>true,
      ground:p=>['forage','drink','bathe','court'].includes(p.state),
      perch:p=>['perch','roost','perchcheck'].includes(p.state),
      fly:p=>['fly','takeoff','descend'].includes(p.state),
      eat:p=>p.state==='drink'||(p.state==='forage'&&!!p.feedRush),
      roost:p=>p.state==='roost',
    };
    let rosterFilter='all';
    function placeEstimate(p){
      if(p.state==='fly'||p.state==='takeoff'||p.state==='descend') return '飛行中';
      if(p.state==='roost') return 'ねぐら（高架下）';
      if(p.state==='perchcheck') return '着陸前の確認中';
      if(p.state==='perch') return p.perch?(p.perch.kind==='girder'?'高架下':p.perch.kind==='ledge'?'レッジ・庇':'屋上の縁'):'止まり場';
      if(p.state==='drink'||p.state==='bathe') return '道頓堀川沿い';
      let best='地上', bd=1e18;
      for(const s of FORAGE){ const d=p.pos.distanceToSquared(s.p); if(d<bd){ bd=d; best=s.name; } }
      return best+'付近';
    }
    const rosterItems=[];
    {
      const list=$('roster-list');
      pigeons.forEach((p,i)=>{
        const b=document.createElement('button');
        b.className='ritem'; b.type='button';
        b.innerHTML='<span class="sw"></span><span class="nm"></span><span class="st"></span><span class="ds"></span>';
        b.querySelector('.sw').style.background='#'+new THREE.Color(MORPH_OF_BIRD[i%MORPH_OF_BIRD.length].body).getHexString();
        b.querySelector('.nm').textContent=p.name;
        b.addEventListener('click', ()=>{ setFocus(i); toast(p.name+' を注目中 — '+actionVerb(p)); });
        list.appendChild(b);
        rosterItems.push(b);
      });
    }
    document.querySelectorAll('#roster-filters button').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('#roster-filters button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); rosterFilter=b.dataset.f; updateRoster(true);
      });
    });
    $('btn-roster').addEventListener('click', ()=>{ $('roster').classList.toggle('open'); });
    function omakaseNext(){
      // prefer birds doing something interesting right now
      const scored=pigeons.map((p,i)=>{
        let s=Math.random()*2;
        if(p.escapeT>0) s+=7;
        if(p.state==='court') s+=6;
        if(p.state==='bathe'||p.state==='drink') s+=5;
        if(p.feedRush) s+=5;
        if(p.state==='alert'||p.state==='perchcheck') s+=4;
        if(p.state==='fly'||p.state==='descend'||p.state==='takeoff') s+=3;
        if(i===focusIdx) s-=10;
        return {i, s};
      }).sort((a,b)=>b.s-a.s);
      setFocus(scored[0].i);
      toast('おまかせ：'+focus().name+' — '+actionVerb(focus()));
    }
    $('btn-omakase').addEventListener('click', omakaseNext);
    let rosterT=0;
    function updateRoster(force){
      pigeons.forEach((p,i)=>{
        const el=rosterItems[i];
        el.style.display=ROSTER_FILTERS[rosterFilter](p)?'':'none';
        el.classList.toggle('on', i===focusIdx);
        el.querySelector('.st').textContent=(STATE_LABEL[p.state]||p.state)+'・'+placeEstimate(p);
        el.querySelector('.ds').textContent=camera.position.distanceTo(p.pos).toFixed(0)+' m';
      });
    }
    function updateRosterTick(dt){
      rosterT-=dt; if(rosterT>0) return; rosterT=0.5; updateRoster();
    }

    /* ---- tap a pigeon on screen to focus it ---- */
    const raycaster=new THREE.Raycaster();
    let tapStart=null;
    cv.addEventListener('pointerdown', e=>{ tapStart={x:e.clientX, y:e.clientY, t:performance.now()}; });
    cv.addEventListener('pointerup', e=>{
      if(!tapStart) return;
      const moved=Math.hypot(e.clientX-tapStart.x, e.clientY-tapStart.y);
      const dtMs=performance.now()-tapStart.t;
      tapStart=null;
      if(moved>7 || dtMs>500 || (camMode!=='orbit' && camMode!=='follow')) return;
      const ndc=new THREE.Vector2((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1);
      raycaster.setFromCamera(ndc, camera);
      const hits=raycaster.intersectObjects(pigeons.map(p=>p.mesh.g), true);
      for(const h of hits){
        let o=h.object;
        while(o){ if(o.userData && o.userData.pigeonIdx!==undefined){ setFocus(o.userData.pigeonIdx); toast(focus().name+' をタップで注目に切り替えた'); return; } o=o.parent; }
      }
    });

    /* telemetry */
    const STATE_LABEL={roost:'ねぐらで休息', perch:'止まり・休息 loafing', forage:'地上で採餌', drink:'水飲み（連続吸引）', bathe:'水浴び',
      court:'求愛 bow-coo', alert:'警戒（側方中心窩で注視）', takeoff:'離陸', fly:'飛行（フロック）',
      descend:'着陸アプローチ', perchcheck:'着陸前の安全確認（二段着陸）'};
    const TYPE_LABEL={local:'近所型（行動圏 0.3 km 級）', commuter:'通勤型（1–2 km）', wide:'広域型（最大 5 km 級・少数派）'};
    let teleT=0;
    function updateTelemetry(dt){
      teleT-=dt; if(teleT>0) return; teleT=0.25;
      const p=focus();
      $('p-name').textContent=p.name+'（'+p.sex+'・'+Math.round(p.mass*1000)+' g）';
      $('p-state').textContent=(p.player?'操作中 ／ ':'')+(STATE_LABEL[p.state]||p.state);
      $('swatch').style.background='#'+new THREE.Color(MORPH_OF_BIRD[p.i%MORPH_OF_BIRD.length].body).getHexString();
      const camDist=camera.position.distanceTo(p.pos);
      $('t-dist').textContent=camDist.toFixed(1)+' m';
      $('dist-chip').textContent='鳩まで '+camDist.toFixed(0)+' m';
      updateFeedStatus();
      $('t-speed').textContent=(p.speed*3.6).toFixed(0)+' km/h';
      $('t-alt').textContent=Math.max(0,p.pos.y-BODY_Y).toFixed(1)+' m';
      $('t-flap').textContent=(p.flapFreq>0.1)?p.flapFreq.toFixed(1)+' Hz':'—（畳翼）';
      $('t-bob').textContent=(p.state==='forage'&&p._walking)
        ? ((p._walkSpeed||0)>HEADBOB.breakSpeed ? '崩壊（'+(p._walkSpeed||0).toFixed(1)+' m/s）' : 'hold '+(HEADBOB.holdRatio*100)+'% / thrust '+Math.round((1-HEADBOB.holdRatio)*100)+'%')
        : '—';
      $('t-type').textContent=TYPE_LABEL[p.strategy];
      /* individual card: what / where to / how long / why (estimated) */
      $('t-act').textContent=actionVerb(p);
      $('t-dest').textContent = p.state==='drink' ? '水場（道頓堀川）'
        : (p.state==='fly'||p.state==='descend'||p.state==='takeoff') ? (p.finalKind==='perch'?'止まり場（'+placeEstimate(p)+'）':(p.site?p.site.name+'へ':'群れの巡回路'))
        : placeEstimate(p);
      const durSec=Math.round(p.stateT*Math.max(timeScale,1));
      $('t-dur').textContent = durSec<90 ? '約'+durSec+'秒' : '約'+Math.round(durSec/60)+'分';
      $('t-why').textContent = p.escapeT>0 ? '捕食者から逃避'
        : p.feedRush ? 'まかれた餌を発見'
        : p.state==='perchcheck' ? '着陸前の安全確認'
        : p.state==='descend' ? '着陸先の確保'
        : p.state==='fly' ? '採餌場・水場への日課の移動'
        : p.state==='drink' ? '採餌の合間の水分補給'
        : p.state==='court' ? '繁殖期の求愛'
        : p.state==='roost' ? '夜間・休息'
        : p.state==='forage' ? '地上での採餌'
        : '日中の休息・羽づくろい';
      const hh=Math.floor(simMin/60)%24, mm=Math.floor(simMin%60);
      $('clock').textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
      $('phase-label').textContent=PHASES[phaseOf(simMin)].label;
      const flying=pigeons.filter(q=>q.state==='fly'||q.state==='takeoff'||q.state==='descend').length;
      const grounded=pigeons.filter(q=>q.state==='forage'||q.state==='drink'||q.state==='bathe').length;
      const WX_ICON={clear:'☀', cloudy:'☁', rain:'☂', heavyrain:'☂', snow:'☃', wind:'≋'};
      $('chip-weather').textContent=(WX_ICON[weatherKey]||'☀')+' '+WEATHERS[weatherKey].label+' '+ENV.temp+'℃';
      $('wx-season').textContent=SEASONS[seasonKey].label+(seasonMode==='auto'?'（自動）':'');
      $('wx-weather').textContent=WEATHERS[weatherKey].label+(weatherMode==='auto'?'（自動）':'');
      $('wx-temp').textContent=ENV.temp+'℃';
      $('wx-rise').textContent=fmtMin(SUN.rise);
      $('wx-set').textContent=fmtMin(SUN.set);
      $('wx-wind').textContent=ENV.wind>0.6?'強い':ENV.wind>0.3?'やや強い':'穏やか';
      $('wx-precip').textContent=ENV.rain>0.05?'雨':ENV.snow>0.05?'雪':'なし';
      const perched=pigeons.length-flying-grounded;
      $('flock-chip').textContent='群れ '+pigeons.length+'羽（地上 '+grounded+'・止まり '+perched+'・飛行 '+flying+'）';
    }

    /* ================= main loop ================= */
    window.addEventListener('resize', ()=>{
      camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    const clockT=new THREE.Clock();
    let firstFrames=0, lodT=0;
    /* frame / shadow-map counters (計測専用): framesRendered counts
       every completed renderer.render(); shadowUpdates counts the
       frames in which a shadow-map redraw was requested — with
       shadowMap.autoUpdate=false that is only the frames where the
       shadow update controller set needsUpdate (or every frame if
       autoUpdate is ever turned back on). */
    let framesRendered=0, shadowUpdates=0;
    /* bench collectors (計測専用): while a bench is active, animate()
       feeds it one sample per rendered frame after the render; it
       never touches the simulation or the drawing itself. */
    const activeBenches=[];
    function collectBenchSamples(){
      if(!activeBenches.length) return;
      const now=performance.now();
      const calls=renderer.info.render.calls, tris=renderer.info.render.triangles;
      for(let i=activeBenches.length-1;i>=0;i--){
        const b=activeBenches[i];
        b.samples.push({calls:calls, triangles:tris, frameMs:now-b.prev});
        b.prev=now;
        if(now-b.start>=b.durationMs){
          activeBenches.splice(i,1);
          let sumCalls=0, maxCalls=0, sumTris=0, sumMs=0, maxMs=0;
          for(const s of b.samples){
            sumCalls+=s.calls; if(s.calls>maxCalls) maxCalls=s.calls;
            sumTris+=s.triangles; sumMs+=s.frameMs; if(s.frameMs>maxMs) maxMs=s.frameMs;
          }
          const n=b.samples.length, avgFrameMs=n?sumMs/n:0;
          b.resolve({frames:n,
            avgFps:avgFrameMs>0?+(1000/avgFrameMs).toFixed(2):0,
            avgCalls:n?+(sumCalls/n).toFixed(2):0, maxCalls:maxCalls,
            avgTriangles:n?Math.round(sumTris/n):0,
            avgFrameMs:+avgFrameMs.toFixed(2), maxFrameMs:+maxMs.toFixed(2)});
        }
      }
    }
    function benchStart(seconds){
      const dur=(typeof seconds==='number' && isFinite(seconds) && seconds>0)?seconds:1;
      return new Promise(resolve=>{
        const now=performance.now();
        activeBenches.push({start:now, prev:now, durationMs:dur*1000, samples:[], resolve});
      });
    }
    function animate(){
      requestAnimationFrame(animate);
      const dt=Math.min(clockT.getDelta(), 0.05);
      const prevSimMin=simMin;
      simMin=(simMin + dt*timeScale/60)%1440;
      if(simMin<prevSimMin) for(const p of pigeons) p.flightSecToday=0; // sim midnight: reset the flight-time ledger
      updateDaylight();
      updateEnvironment(dt);
      if(waterTex){ waterTex.offset.x+=dt*0.030; waterTex.offset.y+=dt*0.011; }
      if(rippleTex){ rippleTex.offset.x-=dt*0.017; rippleTex.offset.y+=dt*0.026; }
      director(dt);
      updateFeedFX(dt);
      updatePlayer(dt);
      anchorUpdate(dt);
      for(const p of pigeons) updatePigeon(p, dt, simMin);
      falconUpdate(dt);
      updateCamera(dt);
      updateFocusMarker(performance.now());
      updateOcclusion(dt);
      lodT-=dt; if(lodT<=0){ lodT=0.2; updateCloseLODs(); }
      updateRosterTick(dt);
      updateTelemetry(dt);
      updateDynamicResolution(dt);
      const shadowRequested=updateShadowGate();
      renderReflectionC6();
      renderer.render(scene, camera);
      renderPostC7(); // C7 (Issue #26): Ultra + dusk/night only; no-op otherwise
      framesRendered++;
      if(renderer.shadowMap.enabled && (renderer.shadowMap.autoUpdate || shadowRequested)) shadowUpdates++;
      if(__boot.firstFrame===null) __boot.firstFrame=performance.now();
      collectBenchSamples();
      if(firstFrames<3){ firstFrames++; if(firstFrames===3){ setLoad(1,'準備完了'); setTimeout(()=>{ document.getElementById('loader').style.display='none'; if(__boot.interactive===null) __boot.interactive=performance.now(); }, 250); } }
    }
    setLoad(0.8,'鳩の群れを配置中…');
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ try{ drawFocusLabel(); }catch(e){} });
    /* every startup texture (facade atlas, water / ripple, street-prop
       and label canvases, feather textures, cloud sprite) has been
       generated by this point — the last ones are created above and in
       the environment setup; on-demand close-LOD textures are not
       part of startup. */
    __boot.texturesReady=performance.now();
    animate();

    /* ================= QA verification hook =================
       Read-only snapshot for automated verification. The only write
       paths are clicks through the existing UI controls; bench() is
       a measurement-only helper that observes rendered frames. */
    const bootVal=v=>(v===null||v===undefined)?null:+v.toFixed(1);
    window.__QA__={
      snapshot(){
        const counts={};
        for(const p of pigeons) counts[p.state]=(counts[p.state]||0)+1;
        const fp=focus();
        return {
          time:fmtMin(simMin), simMin:Math.round(simMin), timeScale,
          phase:phaseOf(simMin),
          season:seasonKey, seasonMode, weather:weatherKey, weatherMode,
          env:{temp:ENV.temp, cloud:+ENV.cloud.toFixed(2), rain:+ENV.rain.toFixed(2), snow:+ENV.snow.toFixed(2),
            wind:+ENV.wind.toFixed(2), wet:+ENV.wet.toFixed(2), snowCover:+ENV.snowCover.toFixed(2), postRain:Math.round(ENV.postRain)},
          sun:{rise:fmtMin(SUN.rise), set:fmtMin(SUN.set)},
          counts, flockFlying,
          flightFlash:{underwingVisible:pigeons.reduce((n,p)=>n+((p.mesh&&p.mesh.underL&&p.mesh.underL.visible)?1:0),0)},
          morphs:{counts:(()=>{ const c={}; for(const m of MORPH_OF_BIRD) c[m.name]=(c[m.name]||0)+1; return c; })()},
          focus:{index:focusIdx, name:fp.name, morph:MORPH_OF_BIRD[fp.i%MORPH_OF_BIRD.length].name, state:fp.state, action:actionVerb(fp),
            breeding_state:fp.breeding_state, dominance_ground:+fp.dominance_ground.toFixed(2),
            leadership_flight:+fp.leadership_flight.toFixed(2),
            pos:{x:+fp.pos.x.toFixed(1), y:+fp.pos.y.toFixed(1), z:+fp.pos.z.toFixed(1)},
            closeLOD:!!fp.closeLOD, dist:+camera.position.distanceTo(fp.pos).toFixed(1), pecks:fp.pecks, peckHits:fp.peckHits},
          feed:crumbCluster?{place:crumbCluster.site.name, noticed:crumbCluster.noticed,
            remainingMs:Math.max(0, Math.round(crumbCluster.until-performance.now()))}:null,
          windowLights:{opacity:+winLightMat.opacity.toFixed(3), visible:winLightMesh.visible},
          facade:{normalMap:!!(cityMeshMat&&cityMeshMat.normalMap),
            roughnessMap:!!(cityMeshMat&&cityMeshMat.roughnessMap),
            emissiveMap:!!(cityMeshMat&&cityMeshMat.emissiveMap),
            emissiveIntensity:cityMeshMat?+cityMeshMat.emissiveIntensity.toFixed(3):0},
          /* P6 (Issue #21): close-range eye/beak values, read live
             from the shared materials. */
          eye:{beakColorLo:'#'+SHARED_BEAK_MAT.color.getHexString(), beakColorHi:'#'+SHARED_BEAK_HI_MAT.color.getHexString(),
            cereRoughnessLo:SHARED_CERE_MAT.roughness, cereRoughnessHi:SHARED_CERE_HI_MAT.roughness,
            irisMap:!!(SHARED_IRIS_MAT&&SHARED_IRIS_MAT.map),
            corneaOpacity:SHARED_CORNEA_MAT.opacity, corneaClearcoat:SHARED_CORNEA_MAT.clearcoat},
          road:{normalMap:!!(roadsMat&&roadsMat.normalMap),
            roughnessMap:!!(roadsMat&&roadsMat.roughnessMap),
            roughnessFactor:roadSurface.roughnessFactor,
            envMapIntensity:roadSurface.envMapIntensity,
            wet:+ENV.wet.toFixed(2), curbSegments:roadSurface.curbSegments},
          sky:{dome:!!skyDome, environment:!!scene.environment, envRegens:envRegenCount,
            lastEnvKey:lastEnvKey,
            turbidity:skyDome?+skyDome.material.uniforms.turbidity.value.toFixed(2):0,
            rayleigh:skyDome?+skyDome.material.uniforms.rayleigh.value.toFixed(2):0},
          precip:{rainVisible:rainFx.pts.visible, rainOpacity:+rainFx.mat.opacity.toFixed(2),
            snowVisible:snowFx.pts.visible, snowOpacity:+snowFx.mat.opacity.toFixed(2)},
          occlusion:{mode:occlMode, buildings:[...occl.set], opacity:+occl.opacity.toFixed(2)},
          flight:{ratio:+flockFlightRatio().toFixed(4), capDesign:FLIGHT_TIME_RATIO_CAP, capIsDesignValue:true},
          lod:{displayScale:DISPLAY_SCALE, closeActive:pigeons.filter(p=>p.closeLOD).map(p=>p.name),
            farActive:pigeons.filter(p=>p.farLOD).map(p=>p.name),
            farBand:{in:15.0, out:13.5},
            farTris:{trunk:farLodCounts.trunkTris, neck:farLodCounts.neckTris, head:farLodCounts.headTris},
            focusMeshes:(()=>{ let n=0; const walk=(o,vis)=>{ const v=vis&&o.visible; if(v&&o.isMesh) n++; for(const c of (o.children||[])) walk(c,v); }; if(fp.mesh&&fp.mesh.g) walk(fp.mesh.g,true); return n; })(),
            headbob:{holdRatio:HEADBOB.holdRatio, breakSpeed:HEADBOB.breakSpeed}},
          streetProps:{poles:streetPropCounts.poles, wireSegments:streetPropCounts.wires,
            vendingMachines:streetPropCounts.vending, manholes:streetPropCounts.manholes,
            markingStripes:streetPropCounts.stripes, sleeveSigns:streetPropCounts.sleeveSigns,
            bodyY:BODY_Y},
          nearLayer:{barrierPosts:nearLayerCounts.barrierPosts, barrierRails:nearLayerCounts.barrierRails,
            pricePlanes:nearLayerCounts.pricePlanes,
            sleeveCells:nearLayerCounts.sleeveCells, sleeveArms:nearLayerCounts.sleeveArms,
            decalIntersections:nearLayerCounts.decalIntersections,
            crossarms:nearLayerCounts.crossarms,
            wireBundleSpacing:nearLayerCounts.wireBundleSpacing},
          rooftop:{buildings:roofLayerCounts.buildings, textureTypes:roofLayerCounts.textureTypes,
            byTexture:roofLayerCounts.byTexture.slice(),
            parapets:roofLayerCounts.parapets,
            parapetHeight:{min:roofLayerCounts.parapetHeightMin, max:roofLayerCounts.parapetHeightMax},
            classBuildings:roofLayerCounts.classBuildings,
            addedByClass:roofLayerCounts.addedByClass,
            addedItems:roofLayerCounts.addedItems,
            existingRooftopItems:roofLayerCounts.existingRooftopItems,
            addedNodes:roofLayerCounts.addedNodes, addedCalls:roofLayerCounts.addedCalls,
            addedTextures:roofLayerCounts.addedTextures, addedTriangles:roofLayerCounts.addedTriangles},
          /* P7 (Issue #22): second-layer individual variation. */
          variation:{variantCounts:(()=>{ const c=[0,0,0]; for(const v of BIRD_VARIANT) c[v]=(c[v]||0)+1; return c; })(),
            jitters:P7_VARIANTS.map(v=>v.jitter),
            uOffsets:P7_VARIANTS.map(v=>v.uOff),
            neckClassCounts:(()=>{ const c={strong:0, weak:0, juvenile:0}; for(const ci of BIRD_NECK_CLASS){ const nm=NECK_CLASSES[ci].name; c[nm]=(c[nm]||0)+1; } return c; })(),
            focusVariant:BIRD_VARIANT[fp.i%BIRD_VARIANT.length],
            focusNeckClass:NECK_CLASSES[BIRD_NECK_CLASS[fp.i%BIRD_NECK_CLASS.length]].name},
          /* P8 (Issue #23): neck gradient stops + covert tint state. */
          p8:{neckStopOffsets:P8_NECK_STOPS.map(s=>s[0]), neckStopColors:P8_NECK_STOPS.map(s=>s[1]),
            covertTintMat:!!SHARED_COVERT_TINT_MAT,
            focusCovertTintVisible:!!(fp.mesh&&fp.mesh.covertTintL&&fp.mesh.covertTintL.visible&&fp.mesh.covertTintR&&fp.mesh.covertTintR.visible)},
          /* P3 (Issue #24): two-joint wing + primary card state. */
          p3:{wristX:P3_WRIST_X, lagRad:P3_LAG_RAD, primariesPerWing:P3_PRIM_ROOTS.length,
            primaryVisible:pigeons.reduce((n,p)=>n+((p.mesh&&p.mesh.primL)?p.mesh.primL.filter(x=>x.visible).length+p.mesh.primR.filter(x=>x.visible).length:0),0),
            focusSpread:+(fp._p3Spread||0).toFixed(3),
            focusOuterLagDeg:fp.mesh&&fp.mesh.wingOLP?+(fp.mesh.wingOLP.rotation.z*57.29578).toFixed(2):0,
            focusOuterTwistDeg:fp.mesh&&fp.mesh.wingOLP?+(fp.mesh.wingOLP.rotation.x*57.29578).toFixed(2):0,
            escapeGateActive:!!fp._p3EscapeGate},
          /* P9 (Issue #27): close-LOD fringe trial state. */
          p9:{layers:P9_OFFSETS.length, offsetsMm:P9_OFFSETS.map(o=>Math.round(o*1000)),
            peakAlpha:P9_PEAK_ALPHA.slice(), renderOrder:P9_RENDER_ORDER,
            shellsPerBird:6,
            focusFringeVisible:fp.mesh&&fp.mesh.fringe?fp.mesh.fringe.filter(x=>x.visible).length:0,
            closeOnly:true},
          /* C6 (Issue #25): planar reflection state. */
          c6:{layer:C6_REFL_LAYER, planeY:C6_REFL_Y, mode:c6State.mode,
            enabled:c6State.enabled, qualityMode, rtSize:c6RtSize,
            overlays:c6Overlays.length, tagged:c6State.tagged, renders:c6State.renders},
          /* C7 (Issue #26): post process (Ultra + glow) state. */
          c7:{enabled:c7State.enabled, qualityMode, glowF:+c7GlowF.toFixed(3),
            threshold:C7_THRESHOLD, knee:C7_KNEE, bloomStrength:C7_BLOOM_STRENGTH,
            halfRes:{w:c7State.w, h:c7State.h}, renders:c7State.renders,
            aoBaseM:C7_AO_BASE_M, aoVia:'facade-shader', ssao:false},
          /* X1 (Issue #28): city spatial chunking state. */
          x1:{cellM:X1_CELL, fadeRadiusM:X1_FADE_RADIUS, chunks:x1State.chunks,
            fadeBuildings:x1State.fadeBuildings, chunkedBuildings:x1State.chunkedBuildings,
            fadeVerts:x1State.fadeVerts, chunkVerts:x1State.chunkVerts,
            totalVerts:x1State.fadeVerts+x1State.chunkVerts,
            cityGeometries:cityFadeRecs.length},
          shadow:{mode:'focus-following single cascade (CSM代替)', mapSize:sun.shadow.mapSize.x, extentM:170,
            updates:shadowUpdates, autoUpdate:renderer.shadowMap.autoUpdate, framesRendered},
          render:{fps:fpsValue, calls:renderer.info.render.calls, triangles:renderer.info.render.triangles,
            dprCap:dprCap(), renderScale:+renderScale.toFixed(2), frameMs:+frameEMA.toFixed(1)},
          camera:{mode:camMode, pos:{x:+camera.position.x.toFixed(1), y:+camera.position.y.toFixed(1), z:+camera.position.z.toFixed(1)}},
          memory:(()=>{ const mi=(renderer.info&&renderer.info.memory)||{};
            let heap=null;
            if(typeof performance!=='undefined' && performance.memory && typeof performance.memory.usedJSHeapSize==='number')
              heap=Math.round(performance.memory.usedJSHeapSize/1048576*10)/10;
            return {geometries:mi.geometries||0, textures:mi.textures||0,
              usedJSHeapSize:heap, usedJSHeapSizeMB:heap}; })(),
          programs:(()=>{ const pr=renderer.info&&renderer.info.programs;
            if(!pr) return 0;
            if(typeof pr.length==='number') return pr.length;
            if(typeof pr.size==='number') return pr.size;
            return 0; })(),
          totalNodes:(()=>{ let n=0; scene.traverse(()=>{ n++; }); return n; })(),
          framesRendered,
          boot:{scriptStart:bootVal(__boot.scriptStart), decoded:bootVal(__boot.decoded),
            cityBuilt:bootVal(__boot.cityBuilt), texturesReady:bootVal(__boot.texturesReady),
            firstFrame:bootVal(__boot.firstFrame), interactive:bootVal(__boot.interactive)},
        };
      },
      /* bench(seconds): observe rendered frames for the given number
         of seconds and resolve with aggregate render stats. It only
         reads renderer.info after each frame — no interference with
         drawing or simulation. */
      bench(seconds){ return benchStart(seconds); },
      actions:{
        feed:()=>$('btn-feed').click(),
        fly:()=>$('btn-fly').click(),
        falcon:()=>$('btn-falcon').click(),
        evening:()=>$('btn-evening').click(),
        closeup:()=>$('btn-closeup').click(),
        streetView:()=>$('btn-street').click(),
        riverView:()=>$('btn-river').click(),
        expresswayView:()=>$('btn-expressway').click(),
        avoidOcclusion:()=>$('btn-occl-avoid').click(),
        omakase:()=>$('btn-omakase').click(),
        setMode:m=>{ const b=document.querySelector('#seg-mode button[data-mode="'+m+'"]'); if(b) b.click(); },
        setTimeScale:ts=>{ const b=document.querySelector('#seg-time button[data-ts="'+ts+'"]'); if(b) b.click(); },
        setSeason:s=>{ const b=document.querySelector('#seg-season button[data-season="'+s+'"]'); if(b) b.click(); },
        setWeather:w=>{ const b=document.querySelector('#seg-weather button[data-weather="'+w+'"]'); if(b) b.click(); },
        setOcclusion:m=>{ const sel=$('occl-sel'); sel.value=m; sel.dispatchEvent(new Event('change')); },
        setQuality:q=>{ const sel=$('quality-sel'); sel.value=q; sel.dispatchEvent(new Event('change')); },
        setReflection:m=>{ const sel=$('refl-sel'); sel.value=m; sel.dispatchEvent(new Event('change')); },
        selectPigeon:i=>{ const el=rosterItems[i]; if(el) el.click(); },
      }
    };
    setTimeout(()=>{ if(phaseOf(simMin)!=='roost') toast('観察モード — 群れは生態スケジュールで自律行動する（大半の時間は地上の採餌と休息）'); }, 1600);
