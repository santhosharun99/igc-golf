/* Sliding selectors: a pill glides from the old option to the clicked one. Works for any container listed below, even when pages re-render. */
(function(){
  const SEL = "nav.tabs, .chips, .seg, .mtog, .phases, .roles";
  const ACTIVE = ".on, [aria-current='page'], [aria-pressed='true'], [aria-selected='true'], [aria-checked='true']";
  const last = new Map();
  const keyOf = el => el.id || (el.matches("nav.tabs") ? "nav" : "") || (el.className + "|" + [...el.children].map(c => c.textContent.trim().slice(0, 12)).join(","));
  function place(el, anim){
    let ind = el.querySelector(":scope > .seg-ind");
    if(!ind){ ind = document.createElement("span"); ind.className = "seg-ind"; ind.setAttribute("aria-hidden", "true"); el.prepend(ind); }
    const act = [...el.children].find(c => c !== ind && c.matches(ACTIVE));
    if(!act){ ind.style.opacity = "0"; return; }
    const r = { l: act.offsetLeft, t: act.offsetTop, w: act.offsetWidth, h: act.offsetHeight };
    if(!r.w){ return; }
    const k = keyOf(el), prev = last.get(k);
    if(!ind.dataset.placed && prev && anim !== false){
      ind.classList.add("noanim"); Object.assign(ind.style, { left: prev.l + "px", top: prev.t + "px", width: prev.w + "px", height: prev.h + "px", opacity: "1" });
      void ind.offsetWidth; ind.classList.remove("noanim");
    } else if(!ind.dataset.placed){ ind.classList.add("noanim"); requestAnimationFrame(() => ind.classList.remove("noanim")); }
    Object.assign(ind.style, { left: r.l + "px", top: r.t + "px", width: r.w + "px", height: r.h + "px", opacity: "1" });
    ind.dataset.placed = "1"; last.set(k, r);
    el.classList.toggle("wrap", el.scrollHeight > act.offsetHeight + 12);
  }
  function scan(root){
    (root || document).querySelectorAll(SEL).forEach(el => {
      if(!el.children.length) return;
      if(!el.classList.contains("slider")) el.classList.add("slider");
      place(el);
    });
  }
  let queued = false;
  const queue = () => { if(queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); };
  new MutationObserver(muts => { for(const m of muts){ if(m.target.closest && m.target.closest(".seg-ind")) continue; queue(); return; } })
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-checked", "aria-pressed", "aria-current", "aria-selected"] });
  addEventListener("resize", () => { document.querySelectorAll(".slider > .seg-ind").forEach(i => i.classList.add("noanim")); scan(); requestAnimationFrame(() => document.querySelectorAll(".slider > .seg-ind").forEach(i => i.classList.remove("noanim"))); });
  // Move the pill immediately on click, before the page re-renders
  document.addEventListener("click", e => {
    const opt = e.target.closest(".slider > *:not(.seg-ind)"); if(!opt) return;
    const el = opt.parentElement, ind = el.querySelector(":scope > .seg-ind"); if(!ind || opt.tagName === "INPUT" || opt.tagName === "LABEL") return;
    Object.assign(ind.style, { left: opt.offsetLeft + "px", top: opt.offsetTop + "px", width: opt.offsetWidth + "px", height: opt.offsetHeight + "px", opacity: "1" });
    last.set(keyOf(el), { l: opt.offsetLeft, t: opt.offsetTop, w: opt.offsetWidth, h: opt.offsetHeight });
  }, true);
  if(document.readyState !== "loading") scan(); else addEventListener("DOMContentLoaded", () => scan());
  if(document.fonts) document.fonts.ready.then(() => scan());
})();
