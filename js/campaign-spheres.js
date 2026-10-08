(() => {
  "use strict";
  const frame = document.getElementById("sphereFrame");
  const status = document.getElementById("sphereStatus");
  const shell = document.getElementById("sphereShell");
  const reload = document.getElementById("sphereReload");
  const fullscreen = document.getElementById("sphereFullscreen");
  if (!frame || !status || !shell || !reload || !fullscreen) return;

  const original = "https://vaclavjavornicky-crypto.github.io/Projekt_sfery/";
  const source = "https://raw.githubusercontent.com/vaclavjavornicky-crypto/Projekt_sfery/master/index.html";
  // Only the presentation is adapted. The author's scripts and their calculations
  // run unchanged in a sandbox without access to our account or Supabase session.
  const theme = `
    :root{color-scheme:dark}
    body{background:#0f1115;color:#f4f0e8;font-family:Inter,Segoe UI,Arial,sans-serif}
    .levy-panel{flex:0 0 320px;background:#171a20;border-color:#2d323c}
    .pravy-panel{min-width:0;background:radial-gradient(circle,#c58b2415,transparent 70%)}
    .ovladani,.kalendar,.cas-kontejner{background:#1d2129;border:1px solid #3c3428;box-shadow:0 8px 24px #0003;border-radius:12px}
    .ovladani{padding:24px;width:240px;box-sizing:border-box}
    .rezim-kontejner,.kalendar-den-nazev{color:#aaa59b}
    .rezim-aktivni,.kalendar-btn{color:#e7b95c}
    .kalendar-mesic,.cas-kontejner label,.kalendar-cislo{color:#f4f0e8}
    .ovladani input[type=number],.cas-kontejner input[type=time]{background:#0f1115;color:#f4f0e8;border:1px solid #4b4234;border-radius:6px}
    .ovladani button,input:checked+.slider,.kalendar-cislo.vybrany{background:#c58b24;color:#17120a}
    .ovladani button:hover{background:#e7b95c}
    .kalendar-cislo.dnes{color:#e7b95c;border-color:#c58b24}
    .kalendar-cislo.vybrany{border-color:#c58b24}
    .kalendar-cislo:hover,.kalendar-btn:hover{background:#c58b2430}
    .scena{background-image:linear-gradient(transparent 49.5%,#2d323c 49.5%,#2d323c 50.5%,transparent 50.5%),linear-gradient(90deg,transparent 49.5%,#2d323c 49.5%,#2d323c 50.5%,transparent 50.5%);flex-shrink:0}
    .maly-obrazek{background-color:transparent}
    @media(max-width:940px){body{overflow:auto;flex-direction:column;height:auto;min-height:100vh}.levy-panel{flex:none;height:auto;overflow:visible;padding:22px 0;border-right:0;border-bottom:1px solid #2d323c}.pravy-panel{flex:none;height:640px;overflow:hidden}.scena{zoom:var(--sphere-scale,1)}}
  `;
  // Scale the fixed 600px scene without changing the author's geometry.
  const adaptation = `(() => { const fit = () => document.documentElement.style.setProperty('--sphere-scale', Math.min(1, (innerWidth - 24) / 600)); fit(); addEventListener('resize', fit); })();`;

  async function load() {
    reload.disabled = true;
    status.textContent = "Načítám sféry…";
    try {
      const response = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc.querySelector("script") || !doc.body.children.length) throw new Error("Prázdný model");
      const base = doc.createElement("base");
      base.href = original;
      doc.head.prepend(base);
      const viewport = doc.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width, initial-scale=1";
      doc.head.append(viewport);
      const style = doc.createElement("style");
      style.textContent = theme;
      doc.head.append(style);
      const script = doc.createElement("script");
      script.textContent = adaptation;
      doc.body.append(script);
      frame.removeAttribute("src");
      frame.onload = () => { status.textContent = "Sféry jsou připravené."; };
      frame.srcdoc = "<!doctype html>" + doc.documentElement.outerHTML;
    } catch (error) {
      console.warn("Načtení sfér:", error);
      frame.onload = null;
      frame.removeAttribute("srcdoc");
      frame.src = original;
      status.textContent = "Zobrazuji původní model. Načtení můžeš zkusit znovu.";
    } finally { reload.disabled = false; }
  }
  reload.addEventListener("click", load);
  if (!shell.requestFullscreen) fullscreen.hidden = true;
  fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === shell) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch { status.textContent = "Prohlížeč nepovolil celou obrazovku."; }
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreen.textContent = document.fullscreenElement === shell ? "Zpět na stránku" : "Celá obrazovka";
  });
  load();
})();
