import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/client.js";

const removeDiacritics = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function PatientsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [normalizedHint, setNormalizedHint] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);   // true once first search fired
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      clearTimeout(debounceRef.current);
      return;
    }

    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/patients/search?q=${encodeURIComponent(q)}`);
        setResults(res || []);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleChange = (e) => {
    const raw = e.target.value;
    const norm = removeDiacritics(raw);
    setNormalizedHint(norm !== raw ? raw : "");
    setQuery(norm);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && results.length > 0) {
      navigate(`/patients/${results[0].id}`);
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Search bar */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">{t("patients.title")}</div>
            <div className="panel-meta">{t("patients.subtitle")}</div>
          </div>
        </div>
        <div style={{ paddingBottom: 4 }}>
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              className="form-input"
              type="text"
              autoComplete="off"
              placeholder={t("patients.search_placeholder")}
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              style={{ paddingRight: 40 }}
            />
            {/* spinner / clear */}
            <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
              {searching && (
                <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>...</span>
              )}
              {query && !searching && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setNormalizedHint(""); inputRef.current?.focus(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          {normalizedHint && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
              ← {normalizedHint}
            </div>
          )}
        </div>
      </div>

      {/* Results list */}
      {searched && !searching && results.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "32px 20px", color: "var(--muted)" }}>
          {t("patients.no_results")}
        </div>
      )}

      {results.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {results.map((p, idx) => {
            const name = [p.last_name, p.first_name].filter(Boolean).join(" ");
            const lastDate = p.banner?.last_treatment_date;
            const total = p.banner?.total_paid;
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/patients/${p.id}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 20px",
                  cursor: "pointer",
                  borderBottom: idx < results.length - 1 ? "1px solid var(--border)" : "none",
                  transition: "background .1s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: "var(--accent)", display: "grid", placeItems: "center",
                  fontSize: 13, fontWeight: 700, color: "#fff",
                }}>
                  {(p.last_name?.[0] || "?").toUpperCase()}
                </div>

                {/* Name + last visit */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                  {lastDate && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                      {t("patients.stats.last_visit")}: {lastDate}
                    </div>
                  )}
                </div>

                {/* Total paid */}
                {total != null && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--green)" }}>
                      {fmt(total)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                      {t("patients.stats.total_paid")}
                    </div>
                  </div>
                )}

                {/* ID + arrow */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>#{p.id}</span>
                  <span style={{ color: "var(--muted)", fontSize: 16 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
