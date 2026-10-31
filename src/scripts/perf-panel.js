    /* ================= performance measurement panel =================
       Read-only UI over window.__QA__: the toggle only opens/closes
       this panel, and the run button calls __QA__.bench(5) plus
       __QA__.snapshot() and renders the numbers as plain DOM text.
       It never touches the simulation, the drawing, or __QA__ itself. */
    (function(){
      var toggle=document.getElementById('perf-toggle');
      var panel=document.getElementById('perf-panel');
      var runBtn=document.getElementById('perf-run');
      var statusEl=document.getElementById('perf-status');
      var viewNameEl=document.getElementById('perf-view-name');
      var resultsEl=document.getElementById('perf-results');
      if(!toggle||!panel||!runBtn) return;

      toggle.addEventListener('click', function(){
        var open=panel.classList.toggle('open');
        toggle.classList.toggle('on', open);
        toggle.setAttribute('aria-expanded', open?'true':'false');
      });

      /* Viewpoint name: remember the last viewpoint button pressed.
         Mode switches clear it, so the fallback below
         (camera mode name) takes over. Flying the flock does not
         clear it: viewpoint and flight are reported together. */
      var lastViewpoint=null;
      function mark(id, name){
        var el=document.getElementById(id);
        if(el) el.addEventListener('click', function(){ lastViewpoint=name; });
      }
      mark('btn-street', '路面で見る');
      mark('btn-river', '川面を見る');
      mark('btn-expressway', '高架の遮音壁');
      mark('btn-closeup', '鳩に寄る');
      var segMode=document.getElementById('seg-mode');
      if(segMode) segMode.addEventListener('click', function(){ lastViewpoint=null; });

      var MODE_NAMES={orbit:'観察カメラ', follow:'追跡カメラ', pov:'鳩視点', play:'操作モード'};
      function viewpointName(snap){
        var flying=snap && snap.flockFlying;
        if(flying && lastViewpoint) return lastViewpoint+'＋全羽飛行（群れ飛行中）';
        if(flying) return '全羽飛行（群れ飛行中）';
        if(lastViewpoint) return lastViewpoint;
        var mode=snap && snap.camera ? snap.camera.mode : null;
        if(mode && MODE_NAMES[mode]) return MODE_NAMES[mode];
        if(mode) return mode;
        return '不明';
      }

      function fmt(v, suffix){
        if(v===null||v===undefined||v==='') return '—';
        return String(v)+(suffix||'');
      }
      function row(label, value){
        return '<dt>'+label+'</dt><dd>'+value+'</dd>';
      }
      function render(bench, snap, viewName){
        var mem=snap.memory||{}, sh=snap.shadow||{}, bt=snap.boot||{};
        var html='';
        html+='<h3>bench（5秒）</h3><dl class="tgrid">'
          +row('avgFps', fmt(bench.avgFps))
          +row('avgCalls', fmt(bench.avgCalls))
          +row('maxCalls', fmt(bench.maxCalls))
          +row('avgTriangles', fmt(bench.avgTriangles))
          +row('avgFrameMs', fmt(bench.avgFrameMs, ' ms'))
          +row('maxFrameMs', fmt(bench.maxFrameMs, ' ms'))
          +row('frames', fmt(bench.frames))
          +'</dl>';
        html+='<h3>snapshot</h3><dl class="tgrid">'
          +row('memory.geometries', fmt(mem.geometries))
          +row('memory.textures', fmt(mem.textures))
          +row('memory.usedJSHeapSizeMB', fmt(mem.usedJSHeapSizeMB, ' MB'))
          +row('programs', fmt(snap.programs))
          +row('totalNodes', fmt(snap.totalNodes))
          +row('shadow.updates', fmt(sh.updates))
          +row('shadow.autoUpdate', fmt(sh.autoUpdate))
          +row('shadow.framesRendered', fmt(sh.framesRendered))
          +'</dl>';
        var rt=snap.rooftop||{}, rbt=rt.byTexture||[], rac=rt.addedByClass||{},
          rcb=rt.classBuildings||{}, rai=rt.addedItems||{}, rph=rt.parapetHeight||{};
        html+='<h3>屋上レイヤー（C5）</h3><dl class="tgrid">'
          +row('rooftop.buildings', fmt(rt.buildings))
          +row('rooftop.textureTypes', fmt(rt.textureTypes))
          +row('rooftop.byTexture', rbt.map(function(v){ return fmt(v); }).join(' / '))
          +row('rooftop.parapets', fmt(rt.parapets))
          +row('rooftop.parapetHeight', fmt(rph.min)+'–'+fmt(rph.max)+' m')
          +row('rooftop.classBuildings S/M/L/XL', [rcb.S,rcb.M,rcb.L,rcb.XL].map(function(v){ return fmt(v); }).join(' / '))
          +row('rooftop.addedByClass S/M/L/XL', [rac.S,rac.M,rac.L,rac.XL].map(function(v){ return fmt(v); }).join(' / '))
          +row('rooftop.addedItems 塔屋/水槽/室外機', [rai.penthouse,rai.tank,rai.ac].map(function(v){ return fmt(v); }).join(' / '))
          +row('rooftop.addedItems.total', fmt(rai.total))
          +row('rooftop.existingRooftopItems', fmt(rt.existingRooftopItems))
          +row('rooftop.addedNodes', fmt(rt.addedNodes))
          +row('rooftop.addedCalls', fmt(rt.addedCalls))
          +row('rooftop.addedTextures', fmt(rt.addedTextures))
          +row('rooftop.addedTriangles', fmt(rt.addedTriangles))
          +'</dl>';
        var vr=snap.variation||{}, vnc=vr.neckClassCounts||{};
        html+='<h3>個体差（P7）</h3><dl class="tgrid">'
          +row('variation.variantCounts', (vr.variantCounts||[]).map(function(v){ return fmt(v); }).join(' / '))
          +row('variation.jitters', (vr.jitters||[]).map(function(v){ return fmt(v); }).join(' / '))
          +row('variation.uOffsets', (vr.uOffsets||[]).map(function(v){ return fmt(v); }).join(' / '))
          +row('variation.neckClassCounts 強/弱/幼鳥', [vnc.strong,vnc.weak,vnc.juvenile].map(function(v){ return fmt(v); }).join(' / '))
          +row('variation.focusVariant', fmt(vr.focusVariant))
          +row('variation.focusNeckClass', fmt(vr.focusNeckClass))
          +'</dl>';
        var p8v=snap.p8||{};
        html+='<h3>首虹色・雨覆（P8）</h3><dl class="tgrid">'
          +row('p8.neckStopOffsets', (p8v.neckStopOffsets||[]).map(function(v){ return fmt(v); }).join(' / '))
          +row('p8.covertTintMat', fmt(p8v.covertTintMat))
          +row('p8.focusCovertTintVisible', fmt(p8v.focusCovertTintVisible))
          +'</dl>';
        var p3v=snap.p3||{};
        html+='<h3>翼2関節・初列風切（P3）</h3><dl class="tgrid">'
          +row('p3.wristX', fmt(p3v.wristX))
          +row('p3.lagRad', fmt(p3v.lagRad))
          +row('p3.primariesPerWing', fmt(p3v.primariesPerWing))
          +row('p3.primaryVisible', fmt(p3v.primaryVisible))
          +row('p3.focusSpread', fmt(p3v.focusSpread))
          +row('p3.focusOuterLagDeg', fmt(p3v.focusOuterLagDeg))
          +row('p3.focusOuterTwistDeg', fmt(p3v.focusOuterTwistDeg))
          +row('p3.escapeGateActive', fmt(p3v.escapeGateActive))
          +'</dl>';
        var p9v=snap.p9||{};
        html+='<h3>輪郭フリンジ（P9）</h3><dl class="tgrid">'
          +row('p9.layers', fmt(p9v.layers))
          +row('p9.offsetsMm', (p9v.offsetsMm||[]).map(function(v){ return fmt(v); }).join(' / '))
          +row('p9.peakAlpha', (p9v.peakAlpha||[]).map(function(v){ return fmt(v); }).join(' / '))
          +row('p9.renderOrder', fmt(p9v.renderOrder))
          +row('p9.shellsPerBird', fmt(p9v.shellsPerBird))
          +row('p9.focusFringeVisible', fmt(p9v.focusFringeVisible))
          +row('p9.closeOnly', fmt(p9v.closeOnly))
          +'</dl>';
        var x1v=snap.x1||{};
        html+='<h3>都市チャンク化（X1）</h3><dl class="tgrid">'
          +row('x1.cellM', fmt(x1v.cellM))
          +row('x1.fadeRadiusM', fmt(x1v.fadeRadiusM))
          +row('x1.chunks', fmt(x1v.chunks))
          +row('x1.fadeBuildings', fmt(x1v.fadeBuildings))
          +row('x1.chunkedBuildings', fmt(x1v.chunkedBuildings))
          +row('x1.fadeVerts', fmt(x1v.fadeVerts))
          +row('x1.chunkVerts', fmt(x1v.chunkVerts))
          +row('x1.totalVerts', fmt(x1v.totalVerts))
          +row('x1.cityGeometries', fmt(x1v.cityGeometries))
          +'</dl>';
        var c6v=snap.c6||{};
        html+='<h3>川面反射（C6）</h3><dl class="tgrid">'
          +row('c6.mode', fmt(c6v.mode))
          +row('c6.enabled', fmt(c6v.enabled))
          +row('c6.rtSize', fmt(c6v.rtSize))
          +row('c6.overlays', fmt(c6v.overlays))
          +row('c6.tagged', fmt(c6v.tagged))
          +row('c6.renders', fmt(c6v.renders))
          +'</dl>';
        var c7v=snap.c7||{};
        html+='<h3>ポストプロセス（C7）</h3><dl class="tgrid">'
          +row('c7.enabled', fmt(c7v.enabled))
          +row('c7.glowF', fmt(c7v.glowF))
          +row('c7.threshold', fmt(c7v.threshold))
          +row('c7.bloomStrength', fmt(c7v.bloomStrength))
          +row('c7.halfRes', c7v.halfRes?(fmt(c7v.halfRes.w)+'x'+fmt(c7v.halfRes.h)):'-')
          +row('c7.renders', fmt(c7v.renders))
          +row('c7.aoBaseM', fmt(c7v.aoBaseM))
          +row('c7.aoVia', fmt(c7v.aoVia))
          +'</dl>';
        html+='<h3>boot（ms）</h3><dl class="tgrid">'
          +row('boot.scriptStart', fmt(bt.scriptStart))
          +row('boot.decoded', fmt(bt.decoded))
          +row('boot.cityBuilt', fmt(bt.cityBuilt))
          +row('boot.texturesReady', fmt(bt.texturesReady))
          +row('boot.firstFrame', fmt(bt.firstFrame))
          +row('boot.interactive', fmt(bt.interactive))
          +'</dl>';
        resultsEl.innerHTML=html;
        viewNameEl.textContent=viewName;
      }

      var running=false;
      runBtn.addEventListener('click', function(){
        if(running) return;
        if(!window.__QA__ || typeof window.__QA__.bench!=='function' || typeof window.__QA__.snapshot!=='function'){
          statusEl.textContent='計測できません（__QA__ が利用できません）';
          return;
        }
        running=true;
        runBtn.disabled=true;
        statusEl.textContent='計測中…（5秒間）';
        var viewName='—';
        try{ viewName=viewpointName(window.__QA__.snapshot()); }catch(e){}
        viewNameEl.textContent=viewName;
        window.__QA__.bench(5).then(function(bench){
          var snap=null;
          try{ snap=window.__QA__.snapshot(); }catch(e){}
          running=false;
          runBtn.disabled=false;
          if(snap){ render(bench, snap, viewName); statusEl.textContent='計測完了'; }
          else statusEl.textContent='計測結果の取得に失敗しました';
        }, function(){
          running=false;
          runBtn.disabled=false;
          statusEl.textContent='計測に失敗しました';
        });
      });
    })();
