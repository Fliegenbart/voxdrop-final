import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: string }
> {
  state = { hasError: false as boolean, error: undefined as string | undefined };

  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, error: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    // Keep a breadcrumb for debugging "white screen" incidents.
    // eslint-disable-next-line no-console
    console.error("[App] Unhandled render error:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>VoxDrop konnte nicht geladen werden</h1>
          <p style={{ marginTop: 8, color: "#4b5563" }}>
            Bitte Seite neu laden. Wenn das Problem bleibt: im privaten Fenster testen oder Cache leeren.
          </p>
          {this.state.error ? (
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                background: "#f3f4f6",
                borderRadius: 8,
                overflow: "auto",
                maxWidth: 720,
                whiteSpace: "pre-wrap",
              }}
            >
              {this.state.error}
            </pre>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found");
}

const element = (
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

// The build is prerendered for SEO, but the runtime app is not SSR-safe (auth state, live API data).
// Hydration can crash with React invariant errors when markup doesn't match; always do a clean client render.
createRoot(container).render(element);
