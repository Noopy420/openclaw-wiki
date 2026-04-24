import React from "react";

/**
 * Compact toolbar for filtering/sorting the article list on the home page.
 * Fully controlled — parent owns state in URL search params.
 */
export default function ArticleFilters({
  articles,
  sortBy,
  onSortBy,
  groupBy,
  onGroupBy,
  agentFilter,
  onAgentFilter,
  namespaceFilter,
  onNamespaceFilter,
  editableOnly,
  onEditableOnly,
  textFilter,
  onTextFilter,
}) {
  // Derive options from the live data so users can't pick empty buckets.
  const agents = [...new Set(articles.map((a) => a.agent).filter(Boolean))].sort();
  const namespaces = [...new Set(articles.map((a) => a.namespace).filter(Boolean))].sort();

  return (
    <div className="oc-filters">
      <div className="oc-filters-row">
        <label className="oc-filter">
          <span>Filter</span>
          <input
            type="search"
            value={textFilter}
            onChange={(e) => onTextFilter(e.target.value)}
            placeholder="title or summary…"
          />
        </label>

        <label className="oc-filter">
          <span>Sort</span>
          <select value={sortBy} onChange={(e) => onSortBy(e.target.value)}>
            <option value="title">Title (A–Z)</option>
            <option value="title-desc">Title (Z–A)</option>
            <option value="updated-desc">Recently updated</option>
            <option value="updated-asc">Oldest</option>
            <option value="agent">Agent</option>
            <option value="namespace">Namespace</option>
          </select>
        </label>

        <label className="oc-filter">
          <span>Group</span>
          <select value={groupBy} onChange={(e) => onGroupBy(e.target.value)}>
            <option value="none">Flat list</option>
            <option value="namespace">By namespace</option>
            <option value="agent">By agent</option>
            <option value="letter">By first letter</option>
          </select>
        </label>

        <label className="oc-filter">
          <span>Agent</span>
          <select
            value={agentFilter || ""}
            onChange={(e) => onAgentFilter(e.target.value || null)}
          >
            <option value="">All</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="oc-filter">
          <span>Namespace</span>
          <select
            value={namespaceFilter || ""}
            onChange={(e) => onNamespaceFilter(e.target.value || null)}
          >
            <option value="">All</option>
            {namespaces.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="oc-filter oc-filter-check">
          <input
            type="checkbox"
            checked={editableOnly}
            onChange={(e) => onEditableOnly(e.target.checked)}
          />
          <span>Editable only</span>
        </label>
      </div>
    </div>
  );
}
