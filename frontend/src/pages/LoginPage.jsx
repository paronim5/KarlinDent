import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function LoginPage({ onLogin }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        return;
      }

      onLogin(data.token, data.user);
    } catch {
      setError(t("auth.connection_error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-mark">D</span>
          <span className="login-logo-text">
            Denta<span className="login-logo-accent">Flow</span>
          </span>
        </div>

        <p className="login-subtitle">{t("auth.sign_in_title")}</p>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <label className="login-label">
            {t("auth.username")}
            <input
              className="login-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              maxLength={128}
            />
          </label>

          <label className="login-label">
            {t("auth.password")}
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? t("auth.signing_in") : t("auth.sign_in")}
          </button>
        </form>
      </div>
    </div>
  );
}
