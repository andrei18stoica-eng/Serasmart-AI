// 0.7.29, «Dot & Ring» cursor: a dot pinned 1:1 to the pointer and an outline ring that follows on a lerp and grows
// over anything interactive. An overlay only: the system cursor stays (no cursor: none), it never takes clicks
// (pointer-events: none, aria-hidden), and it is mounted only with a fine pointer that can hover and without
// «reduce motion»; both are re-checked when they change.
const FOLLOW = 0.14, RING = 36, DOT = 6, HOVER_SCALE = 1.9, COLOUR = "#FFFFFF", SCALE_LERP = 0.22;

export function startDotRingCursor() {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let teardown = null;
  function mount() {
    const ring = document.createElement("div"), dot = document.createElement("div");
    for (const el of [ring, dot]) {
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, { position: "fixed", left: "0", top: "0", pointerEvents: "none", willChange: "transform", borderRadius: "50%", zIndex: "2147483646", opacity: "0", transition: "opacity .2s" });
    }
    ring.className = "dotRingRing"; dot.className = "dotRingDot";
    Object.assign(ring.style, { width: RING + "px", height: RING + "px", boxSizing: "border-box", border: `1.5px solid ${COLOUR}`, background: "transparent" });
    Object.assign(dot.style, { width: DOT + "px", height: DOT + "px", border: "0", background: COLOUR });
    document.body.append(ring, dot); // the ring first, so the dot paints on top
    let x = -100, y = -100, rx = -100, ry = -100, s = 1, over = false, seen = false, raf = 0;
    const move = (e) => {
      x = e.clientX; y = e.clientY;
      over = !!document.elementFromPoint(e.clientX, e.clientY)?.closest("a, button, input");
      if (!seen) { seen = true; rx = x; ry = y; ring.style.opacity = dot.style.opacity = "1"; }
    };
    const leave = () => { over = false; seen = false; ring.style.opacity = dot.style.opacity = "0"; };
    const frame = () => {
      rx += (x - rx) * FOLLOW; ry += (y - ry) * FOLLOW;
      s += ((over ? HOVER_SCALE : 1) - s) * SCALE_LERP;
      ring.style.transform = `translate(${rx - RING / 2}px, ${ry - RING / 2}px) scale(${s})`;
      dot.style.transform = `translate(${x - DOT / 2}px, ${y - DOT / 2}px)`;
      raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      ring.remove(); dot.remove();
    };
  }
  function check() {
    const want = fine.matches && !reduce.matches;
    if (want && !teardown) teardown = mount();
    else if (!want && teardown) { teardown(); teardown = null; }
  }
  check();
  fine.addEventListener?.("change", check); reduce.addEventListener?.("change", check);
  return () => { fine.removeEventListener?.("change", check); reduce.removeEventListener?.("change", check); if (teardown) teardown(); teardown = null; };
}
