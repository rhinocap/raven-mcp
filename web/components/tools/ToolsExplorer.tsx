"use client";

import { useEffect, useState } from "react";
import ToolsCurrent from "./ToolsCurrent";
import ToolsExplorationA from "./ToolsExplorationA";
import ToolsExplorationB from "./ToolsExplorationB";
import ToolsExplorationC from "./ToolsExplorationC";

// ponytail: local exploration harness — dropdown to flip between tools-section
// redesign candidates. Delete (keep the winner inline) once Andrew picks one.
const VARIANTS = {
  current: { label: "Current", C: ToolsCurrent },
  a: { label: "A — Index", C: ToolsExplorationA },
  b: { label: "B — Disclosure", C: ToolsExplorationB },
  c: { label: "C — Explorer", C: ToolsExplorationC },
} as const;

type Key = keyof typeof VARIANTS;

export default function ToolsExplorer() {
  const [variant, setVariant] = useState<Key>("current");
  const Chosen = VARIANTS[variant].C;
  // HomeScripts' IntersectionObserver only sees load-time .reveal elements;
  // swapped-in variants would stay opacity:0 forever — force them visible.
  useEffect(() => {
    document
      .querySelectorAll("#tools .reveal")
      .forEach((el) => el.classList.add("visible"));
  }, [variant]);
  return (
    <>
      <Chosen />
      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          background: "rgba(10,10,14,0.9)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          padding: "6px 10px",
          font: "12px/1.4 monospace",
          color: "#fff",
        }}
      >
        tools:{" "}
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value as Key)}
          style={{ background: "transparent", color: "#fff", border: "none", font: "inherit" }}
        >
          {Object.entries(VARIANTS).map(([k, v]) => (
            <option key={k} value={k} style={{ color: "#000" }}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
