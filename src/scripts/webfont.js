      // webfonts load after first paint so typography never blocks the sim
      window.addEventListener('load', function(){
        var l=document.createElement('link'); l.rel='stylesheet';
        l.href='https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap';
        document.head.appendChild(l);
      });
