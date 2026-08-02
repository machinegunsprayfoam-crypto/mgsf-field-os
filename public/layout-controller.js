/* Device layout preference and responsive mode controller. */
// Device layout selector: forces Phone/Tablet/Desktop layout (body class), persisted per device,
  // overriding the auto @media behaviour so a phone isn't stuck in desktop mode (and vice-versa).
  window.setLayout=function(m,save){var b=document.body;b.classList.remove('lay-phone','lay-tablet','lay-desktop');b.classList.add('lay-'+m);
    var seg=document.getElementById('layoutSeg');if(seg){[].forEach.call(seg.children,function(x){x.classList.toggle('on',x.getAttribute('data-lay')===m);});}
    if(save){try{localStorage.setItem('mgsf_layout',m);}catch(e){}}};
  (function(){var s=null;try{s=localStorage.getItem('mgsf_layout');}catch(e){}
    var m=s||(innerWidth<700?'phone':innerWidth<1100?'tablet':'desktop');window.setLayout(m,false);})();
