import { useState } from "react";

export function Link() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name");
      return;
    }

    if (!/^[a-zA-Z0-9 ]{1,20}$/.test(trimmedName)) {
      setError("Name can only contain letters, numbers, and spaces (max 20 chars)");
      return;
    }

    setSubmitting(true);
    setError("");

    // Redirect to OAuth start endpoint
    const startUrl = `${apiUrl}/oura/auth/start?name=${encodeURIComponent(trimmedName)}`;
    window.location.href = startUrl;
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
          </svg>
        </div>

        <h1 style={styles.title}>Link Oura Ring</h1>
        <p style={styles.subtitle}>
          Connect your Oura Ring to display your readiness score.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label} htmlFor="name">
            Display Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., John"
            style={styles.input}
            maxLength={20}
            disabled={submitting}
            autoFocus
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button} disabled={submitting}>
            {submitting ? "Redirecting..." : "Continue to Oura"}
          </button>
        </form>

        <p style={styles.hint}>
          Your first initial will be shown next to your readiness score.
        </p>
      </div>

      <a href="/#" style={styles.backLink}>
        ← Back to Display
      </a>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    color: "#c9d1d9",
  },
  card: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "12px",
    padding: "40px",
    maxWidth: "400px",
    width: "100%",
    textAlign: "center",
  },
  icon: {
    marginBottom: "20px",
    color: "#58a6ff",
  },
  title: {
    fontSize: "24px",
    fontWeight: 600,
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#8b949e",
    margin: "0 0 24px 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 500,
    textAlign: "left",
  },
  input: {
    padding: "12px 16px",
    fontSize: "16px",
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: "6px",
    color: "#c9d1d9",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  error: {
    color: "#f85149",
    fontSize: "14px",
    margin: "4px 0",
    textAlign: "left",
  },
  button: {
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    background: "#238636",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    cursor: "pointer",
    marginTop: "8px",
  },
  hint: {
    fontSize: "12px",
    color: "#6e7681",
    marginTop: "16px",
    marginBottom: 0,
  },
  backLink: {
    marginTop: "24px",
    fontSize: "14px",
    color: "#58a6ff",
    textDecoration: "none",
  },
};
