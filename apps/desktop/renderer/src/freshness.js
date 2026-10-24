// 0.7.40: the site and the installed phone app load the new version on their own. iPhone keeps an installed web app
// open in the background for days, so after an update people kept seeing the old screens (the Owner saw the old
// Settings while the server already had 0.7.39). When the app comes back to the screen (and every 15 minutes), it
// reads index.html without the cache and compares its script with the one running; when they differ and nothing is
// being typed, the page reloads. Answers in progress keep going on the server and come back after the reload.
const scriptOf = (html) => (String(html).match(/<script[^>]+src="([^"]*assets\/index-[^"]+\.js)"/) || [])[1] || "";
const running = () => { const s = document.querySelector('script[src*="assets/index-"]'); return s ? new URL(s.getAttribute("src"), location.href).pathname : ""; };

export function watchForNewVersion({ canReload = () => true, everyMs = 15 * 60 * 1000 } = {}) {
  if (typeof window === "undefined" || window.Serasmart || !/^https?:$/.test(location.protocol)) return () => {};
  const mine = running();
  if (!mine) return () => {}; // the development server: nothing to compare
  let busy = false;
  async function check() {
    if (busy || document.visibilityState === "hidden") return;
    busy = true;
    try {
      const r = await fetch(new URL("./index.html", location.href), { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return;
      const src = scriptOf(await r.text());
      if (!src) return;
      if (new URL(src, location.href).pathname !== mine) {
        if (canReload()) location.reload(); // otherwise the next check tries again
      }
    } catch {} finally { busy = false; }
  }
  const onVisible = () => { if (document.visibilityState === "visible") check(); };
  const id = setInterval(check, everyMs);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
  const first = setTimeout(check, 5000);
  return () => { clearInterval(id); clearTimeout(first); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("pageshow", onVisible); };
}

export const _test = { scriptOf };
