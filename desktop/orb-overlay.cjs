// THE ORB, OVER EVERYTHING, WHILE IT USES THIS COMPUTER. Colin, 2026-10-19:
// "your orb as a transparent entity with its own cursor that floats around
// showing what is being accessed / clicked / interacted with ... visually
// appealing to the user in a way that shows what you're doing".
//
// One transparent window over the main display: it never takes a click
// (setIgnoreMouseEvents), never takes focus, sits above full-screen apps, and
// draws a small living orb of light that flies to where the next action will
// land, says in a line what it is about to do, and blooms when it clicks. It is
// shown by the engine's 'computer.action' and hidden by 'computer.stopped' or
// a few quiet seconds. Esc stops the orb's control while it is shown (the
// shortcut is held only then, so Esc belongs to every other app otherwise).

const { BrowserWindow, screen, globalShortcut } = require('electron');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:500 13px -apple-system,system-ui,sans-serif}
#orb{position:fixed;left:0;top:0;width:56px;height:56px;margin:-28px 0 0 -28px;pointer-events:none;
  transition:transform .42s cubic-bezier(.22,1,.36,1);will-change:transform}
#orb canvas{width:56px;height:56px;filter:drop-shadow(0 0 14px rgba(170,190,255,.85))}
#tag{position:fixed;left:0;top:0;transform:translate(36px,-10px);pointer-events:none;white-space:nowrap;
  padding:7px 12px 8px;border-radius:12px;color:#f4f6fb;letter-spacing:.01em;
  background:linear-gradient(168deg,rgba(74,81,92,.82),rgba(19,21,26,.9));
  box-shadow:0 0 0 1px rgba(190,198,208,.42),inset 0 1px 0 rgba(255,255,255,.16),0 14px 34px -12px rgba(0,0,0,.7);
  opacity:0;transition:opacity .2s, transform .42s cubic-bezier(.22,1,.36,1)}
.ring{position:fixed;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;pointer-events:none;
  border:2px solid rgba(200,215,255,.9);animation:bloom .6s ease-out forwards}
@keyframes bloom{to{transform:scale(3.4);opacity:0}}
#bar{position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;color:#e8ecf4;
  background:rgba(14,16,22,.78);box-shadow:0 0 0 1px rgba(190,198,208,.35);font-size:12px;letter-spacing:.02em}
</style></head><body>
<div id="bar">your orb is using this computer · Esc to stop</div>
<div id="orb"><canvas width="112" height="112"></canvas></div><div id="tag"></div>
<script>
const orb=document.getElementById('orb'), tag=document.getElementById('tag'), cv=orb.querySelector('canvas'), g=cv.getContext('2d');
const N=420, pts=[]; for(let i=0;i<N;i++){const u=Math.random()*2-1,a=Math.random()*Math.PI*2,r=Math.sqrt(1-u*u);pts.push([r*Math.cos(a),u,r*Math.sin(a)]);}
let t=0, busy=0;
(function draw(){t+=.016;g.clearRect(0,0,112,112);const R=30+3*Math.sin(t*2)+busy*6;
 for(const [x,y,z] of pts){const ca=Math.cos(t*.7),sa=Math.sin(t*.7);const X=x*ca-z*sa,Z=x*sa+z*ca;
  const w=1+.12*Math.sin(t*3+y*4);const px=56+X*R*w, py=56+y*R*w, d=(Z+1)/2;
  g.fillStyle='rgba('+(190+60*d|0)+','+(200+50*d|0)+',255,'+(.25+.65*d)+')';g.fillRect(px,py,1.6,1.6);}
 const c=g.createRadialGradient(56,56,0,56,56,14);c.addColorStop(0,'rgba(255,255,255,.95)');c.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=c;g.fillRect(42,42,28,28);
 busy*=.96;requestAnimationFrame(draw);})();
let at=[innerWidth/2, innerHeight/2]; place();
function place(){orb.style.transform='translate('+at[0]+'px,'+at[1]+'px)';tag.style.transform='translate('+(at[0]+36)+'px,'+(at[1]-12)+'px)';}
const WORD={move:'moving to',click:'clicking',double:'double-clicking',right:'right-clicking',scroll:'scrolling',type:'typing',key:'pressing'};
window.show=function(a){
  if(a.x!=null&&a.y!=null){at=[a.x,a.y];place();}
  const what=a.label||(a.action==='type'?'“'+a.text+'”':a.action==='key'?a.key:'');
  tag.textContent=(WORD[a.action]||a.action)+(what?' '+what:'');tag.style.opacity=1;busy=1;
  if(['click','double','right'].includes(a.action)){setTimeout(()=>{const r=document.createElement('div');r.className='ring';r.style.left=at[0]+'px';r.style.top=at[1]+'px';document.body.appendChild(r);setTimeout(()=>r.remove(),700);},420);}
};
</script></body></html>`;

function createOrbOverlay({ onStop }) {
  let win = null;
  let quiet = 0;
  let escHeld = false;

  function ensure() {
    if (win && !win.isDestroyed()) return win;
    const b = screen.getPrimaryDisplay().bounds;
    win = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      transparent: true, frame: false, hasShadow: false, resizable: false, movable: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
    win.on('closed', () => { win = null; });
    return win;
  }

  function holdEsc(on) {
    if (on === escHeld) return;
    escHeld = on;
    try {
      if (on) globalShortcut.register('Escape', () => { onStop?.(); hide(); });
      else globalShortcut.unregister('Escape');
    } catch { escHeld = false; }
  }

  function show(a) {
    const w = ensure();
    const go = () => {
      if (w.isDestroyed()) return;
      w.showInactive();
      w.webContents.executeJavaScript(`window.show(${JSON.stringify({ action: a.action, x: a.x, y: a.y, label: a.label || '', text: a.text || '', key: a.key || '' })})`).catch(() => {});
    };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
    holdEsc(true);
    clearTimeout(quiet);
    quiet = setTimeout(hide, 8000);   // a few quiet seconds: the orb goes back into its room
  }

  function hide() {
    clearTimeout(quiet);
    holdEsc(false);
    if (win && !win.isDestroyed()) win.hide();
  }

  // the engine's events, as code-host passes them on
  function onEvent(ev) {
    if (ev?.type === 'computer.action') show(ev);
    else if (ev?.type === 'computer.stopped') hide();
  }

  return { onEvent, hide, destroy: () => { hide(); if (win && !win.isDestroyed()) win.destroy(); } };
}

module.exports = { createOrbOverlay, PAGE };
