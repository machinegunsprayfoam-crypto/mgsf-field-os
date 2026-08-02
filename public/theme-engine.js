/* ===== THEME ENGINE — selectable skins, persisted per device. Applied here early so the boot
   screen masks any flash. GRID (Tron) is the default (no data-theme attribute). ===== */
(function(){
  window.KLYFTON_THEMES = [
    {id:'grid',      name:'Grid',      emoji:'⚡', sw:['#080810','#00e5ff','#f97316'], desc:'Tron neon — default'},
    {id:'blaze',     name:'Blaze',     emoji:'🔥', sw:['#0c0a07','#ff8c2a','#ffb347'], desc:'Heavy brand orange'},
    {id:'tactical',  name:'Tactical',  emoji:'🎖️', sw:['#0a0d09','#9bbb5a','#c2a878'], desc:'Military olive + tan'},
    {id:'matrix',    name:'Matrix',    emoji:'💾', sw:['#000600','#00ff66','#22ff66'], desc:'Phosphor-green terminal'},
    {id:'ice',       name:'Ice',       emoji:'❄️', sw:['#04080f','#4be0ff','#7dd3fc'], desc:'Arctic navy + cyan'},
    {id:'synthwave', name:'Synthwave', emoji:'🌆', sw:['#0e0420','#ff2e97','#22d3ee'], desc:'Retro magenta + cyan'},
    {id:'amber',     name:'Amber',     emoji:'🟠', sw:['#0a0700','#ffb000','#ffcf6b'], desc:'Retro amber CRT'},
    {id:'stealth',   name:'Stealth',   emoji:'🕶️', sw:['#0a0a0c','#8493a8','#cbd5e1'], desc:'Calm steel — low FX'},
    {id:'clean',     name:'Clean',     emoji:'▫️', sw:['#0b0d12','#38bdf8','#f97316'], desc:'Minimal — no grid/scanlines'},
    {id:'aeon',      name:'Aeon · Y3024', emoji:'✦', sw:['#05060d','#b7a6ff','#e8c07d'], desc:'Humanity 1000 yrs on — iridescent, gold human-spark'},
    {id:'quantum',   name:'Quantum',   emoji:'⚛️', sw:['#03060a','#22d3ee','#2dd4bf'], desc:'Deep indigo + electric teal'},
    {id:'helios',    name:'Helios',    emoji:'☀️', sw:['#0d0702','#ffb03a','#ff8a3c'], desc:'Solar / Dyson gold plasma'},
    {id:'nebula',    name:'Nebula',    emoji:'🌌', sw:['#08040f','#a855f7','#f0abfc'], desc:'Cosmic violet + starlight'},
    {id:'obsidian',  name:'Obsidian',  emoji:'⬢', sw:['#000000','#c8f7ff','#7fefff'], desc:'Pure-black voidtech, ice-white'}
  ];
  window.applyTheme = function(id){
    if(!KLYFTON_THEMES.some(function(t){return t.id===id;})) id='grid';
    if(id==='grid') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', id);
    try{ localStorage.setItem('klyfton_theme', id); }catch(e){}
    if(window.renderThemePicker) renderThemePicker();
    if(window.notify){ var t=KLYFTON_THEMES.find(function(x){return x.id===id;}); notify('Theme: '+(t?t.name:id),'success'); }
  };
  window.renderThemePicker = function(){
    var box=document.getElementById('themePicker'); if(!box) return;
    var cur; try{ cur=localStorage.getItem('klyfton_theme')||'grid'; }catch(e){ cur='grid'; }
    box.innerHTML = KLYFTON_THEMES.map(function(t){
      var on = t.id===cur;
      var sw = t.sw.map(function(c){return '<span style="width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,.15);background:'+c+'"></span>';}).join('');
      return '<button onclick="applyTheme(\''+t.id+'\')" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 11px;margin-bottom:6px;border-radius:8px;cursor:pointer;min-height:48px;'
        +'background:'+(on?'rgba(var(--neonRGB),.12)':'var(--s3)')+';border:1px solid '+(on?'var(--neon)':'var(--bd)')+';color:var(--tx)">'
        +'<span style="font-size:17px">'+t.emoji+'</span>'
        +'<span style="display:inline-flex;gap:3px">'+sw+'</span>'
        +'<span style="flex:1;line-height:1.25"><b style="font-size:13px">'+t.name+'</b><br><span style="font-size:10px;color:var(--t2)">'+t.desc+'</span></span>'
        +(on?'<span style="color:var(--neon);font-size:11px;font-weight:700;white-space:nowrap">● ACTIVE</span>':'')+'</button>';
    }).join('');
  };
  try{ window.applyTheme(localStorage.getItem('klyfton_theme')||'grid'); }catch(e){}
  window.addEventListener('DOMContentLoaded', function(){ if(window.renderThemePicker) renderThemePicker(); });
})();
