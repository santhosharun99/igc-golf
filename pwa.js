/* Registers the service worker and shows a one-time "add to home screen" hint. */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(e => console.warn("SW", e)));
}
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let deferred = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; show(); });
function dismissed(){ try{ return localStorage.getItem("igc.installHint") === "no"; }catch(e){ return false; } }
function show(){
  if(standalone || dismissed() || document.getElementById("igcInstall") || !document.body.dataset.install) return;
  if(!ios && !deferred) return;
  const el = document.createElement("div"); el.id = "igcInstall";
  el.innerHTML = `<img src="icons/icon-192.png" alt=""><div><b>Install the IGC app</b><span>${ios
    ? 'Tap <svg width="14" height="16" viewBox="0 0 14 18" aria-label="Share"><path d="M7 1v11M3 5l4-4 4 4M1 9v8h12V9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg> Share, then <b>Add to Home Screen</b>'
    : "Full screen, own icon, opens straight to your scorecard"}</span></div>${ios ? "" : '<button type="button" class="go">Install</button>'}<button type="button" class="x" aria-label="Dismiss">×</button>`;
  const css = document.createElement("style");
  css.textContent = `#igcInstall{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:80;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #DCE4D6;border-radius:14px;padding:10px 12px;box-shadow:0 10px 30px rgba(38,66,43,.18);font:13px Inter,system-ui,sans-serif;color:#2A3A2C;max-width:520px;margin:0 auto}
#igcInstall img{width:40px;height:40px;border-radius:10px;flex:none}#igcInstall div{flex:1;line-height:1.35}#igcInstall b{color:#26422B}#igcInstall span{display:block;color:#566559;font-size:12px}#igcInstall svg{vertical-align:-3px;color:#2f6d80}
#igcInstall .go{font:inherit;font-weight:600;border:0;border-radius:999px;background:#26422B;color:#fff;padding:8px 14px;cursor:pointer}#igcInstall .x{border:0;background:none;font-size:20px;color:#566559;cursor:pointer;padding:0 4px}`;
  document.head.appendChild(css); document.body.appendChild(el);
  el.querySelector(".x").onclick = () => { try{ localStorage.setItem("igc.installHint", "no"); }catch(e){} el.remove(); };
  const go = el.querySelector(".go"); if(go) go.onclick = async () => { deferred.prompt(); await deferred.userChoice; deferred = null; el.remove(); };
}
addEventListener("load", () => setTimeout(show, 1200));
