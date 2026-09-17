import { useState } from "react";
import { API_URL } from "./config";
import "./App.css";

// Walking skeleton: one button, one real API call.
// Proves hosting + build pipeline + cross-origin (CORS) before the real screens are built.
export default function App() {
  const [state, setState] = useState({ status: "idle" });

  async function runTest() {
    setState({ status: "running" });
    const startedAt = performance.now();
    try {
      const res = await fetch(`${API_URL}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, contentType: "image/png" }),
      });
      const ms = Math.round(performance.now() - startedAt);
      if (!res.ok) {
        setState({ status: "error", detail: `HTTP ${res.status}`, ms });
        return;
      }
      const data = await res.json();
      setState({ status: "ok", caseId: data.caseId, uploadHost: new URL(data.upload.url).host, ms });
    } catch (err) {
      setState({ status: "error", detail: String(err) });
    }
  }

  return (
    <main className="wrap">
      <h1>Thaam <span lang="hi">थाम</span></h1>
      <p className="tag">Connection test — not the real app yet.</p>

      <button onClick={runTest} disabled={state.status === "running"}>
        {state.status === "running" ? "Calling the API…" : "Run connection test"}
      </button>

      {state.status === "ok" && (
        <div className="card ok">
          <p><strong>API reachable.</strong> Round trip: {state.ms} ms</p>
          <p>Case created: <code>{state.caseId}</code></p>
          <p>Upload target: <code>{state.uploadHost}</code></p>
        </div>
      )}
      {state.status === "error" && (
        <div className="card bad">
          <p><strong>Call failed.</strong> {state.detail}</p>
          <p>If the browser console mentions CORS, the API is not allowing this origin.</p>
        </div>
      )}

      <p className="fine">
        Thaam is not a government service and is not affiliated with I4C, NCRP, RBI or any bank.
      </p>
    </main>
  );
}
