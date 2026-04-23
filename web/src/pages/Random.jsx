import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function Random() {
  const navigate = useNavigate();
  useEffect(() => {
    api
      .random()
      .then((r) => navigate(`/wiki/${encodeURIComponent(r.id)}`, { replace: true }))
      .catch(() => navigate("/", { replace: true }));
  }, [navigate]);
  return <div className="oc-loading">finding a random article…</div>;
}
