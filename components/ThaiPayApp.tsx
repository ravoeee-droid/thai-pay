"use client";

import { ArrowLeft, Check, ChevronRight, CircleAlert, Clock3, CreditCard, History, Home, LockKeyhole, QrCode, ScanLine, Settings, ShieldCheck, Sparkles, WalletCards, Wifi } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Scanner from "./Scanner";
import { decodePromptPay, maskPromptPay, PromptPayData } from "@/lib/promptpay";

type Screen = "home" | "scan" | "review" | "result" | "history" | "settings";
type XenditStatus = { configured: boolean; mode: "development" | "live" | "missing"; liveAllowed: boolean };
type HistoryItem = { id: string; amount: number; recipient: string; status: string; createdAt: string; payoutId?: string };

const STORAGE_KEY = "thai-pay-history-v1";

export default function ThaiPayApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [parsed, setParsed] = useState<PromptPayData | null>(null);
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [xendit, setXendit] = useState<XenditStatus>({ configured: false, mode: "missing", liveAllowed: false });

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); } catch { setHistory([]); }
    fetch("/api/xendit/status").then((r) => r.json()).then(setXendit).catch(() => null);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);

  const handleScan = useCallback((raw: string) => {
    const decoded = decodePromptPay(raw);
    setParsed(decoded);
    setAmount(decoded.amount ? decoded.amount.toFixed(2) : "");
    setRecipientName(decoded.merchantName || "");
    setError("");
    setScreen("review");
  }, []);

  const numericAmount = Number.parseFloat(amount.replace(",", "."));
  const canPay = !!parsed?.payoutCompatible && Number.isFinite(numericAmount) && numericAmount > 0 && recipientName.trim().length >= 2 && !busy;

  const submit = async () => {
    if (!parsed || !canPay) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: numericAmount, recipientName: recipientName.trim(), promptPay: parsed })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Xendit hat die Testzahlung abgelehnt.");
      setResult(body);
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        amount: numericAmount,
        recipient: recipientName.trim(),
        status: body?.status || "ACCEPTED",
        createdAt: new Date().toISOString(),
        payoutId: body?.payout_id
      };
      const next = [item, ...history].slice(0, 50);
      setHistory(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setScreen("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zahlung konnte nicht gestartet werden.");
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (xendit.mode === "development") return "Xendit Sandbox verbunden";
    if (xendit.mode === "live" && xendit.liveAllowed) return "Xendit Live aktiviert";
    if (xendit.mode === "live") return "Live-Key sicher gesperrt";
    return "Xendit Key fehlt";
  }, [xendit]);

  if (screen === "scan") return <Scanner onScan={handleScan} onClose={() => setScreen("home")} />;

  return (
    <main className="app-shell">
      <div className="phone-shell">
        <header className="topbar">
          {screen !== "home" ? (
            <button className="icon-button" onClick={() => setScreen("home")}><ArrowLeft size={20} /></button>
          ) : <div className="brand-mark">TH</div>}
          <div className="brand-copy"><strong>ThaiPay</strong><span>by Digitale Gewinner</span></div>
          <div className={`connection-dot ${xendit.configured ? "online" : ""}`}><Wifi size={16} /></div>
        </header>

        {screen === "home" && (
          <div className="content home-content">
            <section className="hero-card">
              <div className="eyebrow"><Sparkles size={14} /> THAILAND QR BRIDGE</div>
              <h1>PromptPay.<br />Ohne Thai-Bank-App.</h1>
              <p>Scanne einen persönlichen PromptPay QR und route einen Xendit-Sandbox-Payout.</p>
              <button className="scan-button" onClick={() => setScreen("scan")}><span><ScanLine size={25} /></span> PromptPay scannen <ChevronRight size={20} /></button>
              <div className="hero-foot"><ShieldCheck size={15} /> QR wird zuerst geprüft. Keine automatische Abbuchung.</div>
            </section>

            <section className="status-card">
              <div className="status-row">
                <div className={`status-icon ${xendit.configured ? "good" : "warn"}`}><LockKeyhole size={18} /></div>
                <div><span className="label">PAYMENT RAIL</span><strong>{statusLabel}</strong></div>
                <div className={`pill ${xendit.mode === "development" ? "sandbox" : ""}`}>{xendit.mode === "development" ? "TEST" : xendit.configured ? "LIVE" : "OFF"}</div>
              </div>
              <div className="divider" />
              <div className="status-row muted-row">
                <div className="status-icon"><CreditCard size={18} /></div>
                <div><span className="label">FUNDING</span><strong>Revolut / Foreign Card</strong><small>Noch nicht aktiviert – Xendit-Freigabe nötig</small></div>
                <CircleAlert size={18} className="amber" />
              </div>
            </section>

            <section className="quick-grid">
              <button onClick={() => setScreen("history")}><History size={19} /><span><strong>Verlauf</strong><small>{history.length} lokale Tests</small></span><ChevronRight size={17} /></button>
              <button onClick={() => setScreen("settings")}><Settings size={19} /><span><strong>Setup</strong><small>Xendit & Sicherheit</small></span><ChevronRight size={17} /></button>
            </section>

            <div className="info-strip"><ShieldCheck size={17} /><span><strong>Wichtig:</strong> Merchant/Bill-Payment-QRs werden nicht blind als Bank-Payout umgedeutet.</span></div>
          </div>
        )}

        {screen === "review" && parsed && (
          <div className="content review-content">
            <div className="section-kicker">ZAHLUNG PRÜFEN</div>
            <div className="payee-card">
              <div className="payee-icon"><QrCode size={28} /></div>
              <div><small>{parsed.kind === "bill" ? "Bill Payment QR" : "PromptPay Empfänger"}</small><strong>{parsed.merchantName || "Empfängername erforderlich"}</strong><span>{parsed.proxyType || "QR"} · {maskPromptPay(parsed.proxyValue)}</span></div>
              {parsed.validCrc === true && <div className="verified-badge"><Check size={14} /></div>}
            </div>

            <label className="field-label">Empfängername</label>
            <input className="text-input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="z. B. Somchai Store" autoComplete="off" />

            <label className="field-label">Betrag</label>
            <div className="amount-input"><span>฿</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /><em>THB</em></div>

            <div className={`compat-card ${parsed.payoutCompatible ? "compatible" : "blocked"}`}>
              {parsed.payoutCompatible ? <ShieldCheck size={20} /> : <CircleAlert size={20} />}
              <div><strong>{parsed.payoutCompatible ? "Payout-kompatibler Proxy" : "Nicht automatisch auszahlbar"}</strong><span>{parsed.note}</span></div>
            </div>

            <div className="funding-card"><WalletCards size={20} /><div><span>Xendit Balance</span><strong>{xendit.mode === "development" ? "Sandbox" : "Server"}</strong></div><div className="mini-pill">AKTUELL</div></div>
            <button className="primary-button" disabled={!canPay} onClick={submit}>{busy ? "Xendit wird angefragt…" : `Test-Payout ${Number.isFinite(numericAmount) ? `${numericAmount.toFixed(2)} ฿` : "senden"}`}</button>
            {error && <div className="inline-error">{error}</div>}
            <p className="fineprint">Ein Development-Key kann kein echtes Geld bewegen. Live-Payouts sind im Backend zusätzlich gesperrt.</p>
          </div>
        )}

        {screen === "result" && (
          <div className="content result-content">
            <div className="success-orb"><Check size={38} /></div>
            <div className="section-kicker">XENDIT SANDBOX</div>
            <h2>{Number(numericAmount).toFixed(2)} ฿</h2>
            <p>Test-Payout wurde von Xendit angenommen.</p>
            <div className="receipt-card">
              <div><span>Empfänger</span><strong>{recipientName}</strong></div>
              <div><span>Status</span><strong>{result?.status || "ACCEPTED"}</strong></div>
              <div><span>Payout ID</span><strong className="mono">{result?.payout_id || result?.reference_id || "–"}</strong></div>
            </div>
            <button className="primary-button" onClick={() => { setParsed(null); setResult(null); setScreen("home"); }}>Fertig</button>
          </div>
        )}

        {screen === "history" && (
          <div className="content list-content">
            <div className="section-kicker">LOKALER VERLAUF</div><h2>Testzahlungen</h2>
            {history.length === 0 ? <div className="empty"><Clock3 size={28} /><strong>Noch keine Tests</strong><span>Deine Sandbox-Payouts erscheinen hier.</span></div> : history.map((item) => (
              <div className="history-row" key={item.id}><div className="history-icon"><Check size={16} /></div><div><strong>{item.recipient}</strong><span>{new Date(item.createdAt).toLocaleString("de-DE")}</span></div><div className="history-money"><strong>{item.amount.toFixed(2)} ฿</strong><span>{item.status}</span></div></div>
            ))}
          </div>
        )}

        {screen === "settings" && (
          <div className="content list-content">
            <div className="section-kicker">SETUP</div><h2>Sicherheit & Rails</h2>
            <div className="settings-card">
              <div><span>Xendit API</span><strong>{statusLabel}</strong></div>
              <div><span>PromptPay Decoder</span><strong>Client-side · EMVCo</strong></div>
              <div><span>Live Payouts</span><strong>{xendit.liveAllowed ? "freigegeben" : "gesperrt"}</strong></div>
              <div><span>Foreign Card → Balance</span><strong>Noch nicht freigegeben</strong></div>
            </div>
            <div className="info-strip"><LockKeyhole size={17} /><span>Der Xendit Secret Key liegt ausschließlich serverseitig als Environment Variable. Er wird nie an den Browser gesendet.</span></div>
          </div>
        )}

        {screen !== "review" && screen !== "result" && (
          <nav className="bottom-nav">
            <button className={screen === "home" ? "active" : ""} onClick={() => setScreen("home")}><Home size={20} /><span>Home</span></button>
            <button onClick={() => setScreen("scan")} className="nav-scan"><QrCode size={22} /></button>
            <button className={screen === "history" ? "active" : ""} onClick={() => setScreen("history")}><History size={20} /><span>Verlauf</span></button>
          </nav>
        )}
      </div>
    </main>
  );
}
