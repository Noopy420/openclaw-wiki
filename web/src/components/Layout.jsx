import React from "react";
import { Link } from "react-router-dom";
import SearchBar from "./SearchBar.jsx";

export default function Layout({ children }) {
  return (
    <div className="oc-root">
      <header className="oc-header">
        <div className="oc-header-inner">
          <Link to="/" className="oc-logo">
            <span className="oc-logo-glyph">🦞</span>
            <span className="oc-logo-text">
              <span className="oc-logo-title">OpenClaw Wiki</span>
              <span className="oc-logo-subtitle">the free memory encyclopedia</span>
            </span>
          </Link>
          <SearchBar />
        </div>
      </header>

      <div className="oc-body">
        <aside className="oc-sidebar">
          <nav>
            <h3>Navigation</h3>
            <ul>
              <li><Link to="/">Main page</Link></li>
              <li><Link to="/special/recent">Recent changes</Link></li>
              <li><Link to="/special/random">Random article</Link></li>
            </ul>
            <h3>Contribute</h3>
            <ul>
              <li><Link to="/create">Create new article</Link></li>
            </ul>
            <h3>OpenClaw</h3>
            <ul>
              <li><Link to="/setup">Setup &amp; config</Link></li>
            </ul>
            <h3>Browse</h3>
            <ul>
              <li><Link to="/?namespace=Main">Main articles</Link></li>
              <li><Link to="/?namespace=Diary">Diary</Link></li>
              <li><Link to="/?namespace=Identity">Identity</Link></li>
              <li><Link to="/?namespace=Chunk">Chunks</Link></li>
            </ul>
          </nav>
        </aside>

        <main className="oc-main">{children}</main>
      </div>

      <footer className="oc-footer">
        <p>
          Renders private OpenClaw memory.{" "}
          <a href="http://127.0.0.1:18789/health" target="_blank" rel="noreferrer">
            Gateway
          </a>
          {" · "}
          <button
            className="oc-linkbutton"
            onClick={async () => {
              await fetch("/api/reindex", { method: "POST" });
              window.location.reload();
            }}
          >
            Rebuild index
          </button>
        </p>
      </footer>
    </div>
  );
}
