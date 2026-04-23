import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Before handing markdown to react-markdown, rewrite [[id|label]] wikilinks
 * into regular markdown links pointing at /wiki/:id. Then in react-markdown's
 * `components.a`, detect internal wiki links and use <Link> for SPA routing.
 */
function rewriteWikiLinks(md) {
  return (md || "").replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
    (_, id, label) => `[${label || id}](/wiki/${encodeURIComponent(id.trim())})`
  );
}

export default function ArticleBody({ markdown }) {
  const rewritten = useMemo(() => rewriteWikiLinks(markdown), [markdown]);
  return (
    <div className="oc-article-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...rest }) {
            if (href && href.startsWith("/wiki/")) {
              return <Link to={href}>{children}</Link>;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" {...rest}>
                {children}
              </a>
            );
          },
        }}
      >
        {rewritten}
      </ReactMarkdown>
    </div>
  );
}
