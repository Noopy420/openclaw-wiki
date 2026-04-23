import React from "react";

export default function TableOfContents({ sections }) {
  const headed = (sections || []).filter((s) => s.heading);
  if (!headed.length) return null;
  return (
    <nav className="oc-toc">
      <strong>Contents</strong>
      <ol>
        {headed.map((s, i) => (
          <li key={i} className={`oc-toc-l${s.level}`}>
            <a href={`#${s.anchor}`}>{s.heading}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
