import React, { useId, useLayoutEffect, useState } from "react";
import TextEngine from "spring-text-engine";

// 0.7.29, «Rise & Settle» on every heading of the interface (h1–h6): the letters lift up and spring into place one
// after another (spring-text-engine 0.1.5, spring-driven, interruptible). Body text, and the AI's answers, stay static.
// With «reduce motion», or when the heading is not plain text, the heading is rendered as it is.
const reducedQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => !!reducedQuery?.matches);
  useLayoutEffect(() => {
    if (!reducedQuery) return;
    const on = () => setReduced(reducedQuery.matches);
    reducedQuery.addEventListener?.("change", on);
    return () => reducedQuery.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export function Rise({ tag = "h2", children, style, ...rest }) {
  const reduced = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [justify, setJustify] = useState(undefined);
  const text = typeof children === "string" || typeof children === "number" ? String(children) : null;
  useLayoutEffect(() => {
    if (text == null || reduced) return;
    // The engine lays words out with flex: a heading centred by text-align is centred with justify-content instead.
    const el = document.querySelector(`[data-rise="${id}"]`);
    const align = el ? getComputedStyle(el).textAlign : "";
    setJustify(align === "center" ? "center" : align === "right" || align === "end" ? "flex-end" : undefined);
  }, [id, text, reduced]);
  if (text == null || reduced) return React.createElement(tag, { style, ...rest }, children);
  return <TextEngine key={text} tag={tag} mode="once" overflow
    letterOut={{ opacity: 0, y: 24 }} letterIn={{ opacity: 1, y: 0 }}
    letterConfig={{ tension: 220, friction: 22 }} letterStagger={30}
    data-rise={id} style={{ ...(style || {}), ...(justify ? { justifyContent: justify } : {}) }} {...rest}>{text}</TextEngine>;
}
