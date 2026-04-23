import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="oc-notfound">
      <h1>Page not found</h1>
      <p>
        <Link to="/">← Back to the main page</Link>
      </p>
    </div>
  );
}
