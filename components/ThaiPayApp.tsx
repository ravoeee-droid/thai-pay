"use client";

import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CircleX,
  Clock3,
  CreditCard,
  History,
  Home,
  Loader2,
  LockKeyhole,
  QrCode,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Wifi
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Scanner from "./Scanner";
import { decodePromptPay, maskPromptPay, PromptPayData } from "@/lib/promptpay";

type Screen = "home" | "scan" | "review" | "result" | "history" | "settings";
type XenditStatus = {
  configured: boolean;
  mode: "development" | "live" | "missing";
  apiReachable: boolean | null;
  liveAllowed: boolean;
  cardBridgeApproved: boolean;
};
type PayoutResult = {
  payout_id?: string;
  reference_id?: string;
  status?: string;
  failure_code?: string;
  estimated_arrival_time?: string;
  sandbox?: boolean;
  thaiPayReference?: string;
};
type HistoryItem = {
  id: string;
  amount: number;
  recipient: string;
  status: string;
  createdAt: string;
  payoutId?: string;
  failureCode?: string;
};

const STORAGE_KEY = "thai-pay-history-v2";
const FINAL_SUCCESS = new Set(["SUCCEEDED"]);
const FINAL_FAILURE = new Set(["REJECTED", "FAILED", "EXPIRED", "CANCELLED", "REVERSED"]);

const statusLabels: Record<string, string> = {
  ACCEPTED: "Von Xendit angenommen",
  PENDING_COMPLIANCE_REVIEW: "Compliance-Prüfung",
  ROUTING: "Wird an PromptPay geroutet",
  REQUESTED: "Zahlung angefordert",
  READY: "Bereit zur Auszahlung",
  LOCKED: "Verarbeitung läuft",
  SUCCEEDED: "Erfolgreich ausgezahlt",
  REJECTED: "Abgelehnt",
  FAILED: "Fehlgeschlagen",
  EXPIRED: "Abgelaufen",
  CANCELLED: "Storniert",
  REVERSED: "Zurückgebucht"
};

function statusLabel(status?: string) {
  if (!status) return "Status wird geladen";
  return statusLabels[status] || status;
}

function historyTone(status: string) {
  if (FINAL_FAILURE.has(status)) return "failed";
  if (!FINAL_SUCCESS.has(status)) return "pending";
  return "";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ThaiPayApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [parsed, setParsed] = useState<PromptPayData | null>(null);
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [idRouting, setIdRouting] = useState<"" | "NATIONAL_ID" | "BUSINESS_REG_NO">("");
  const [intentId, setIntentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PayoutResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [xendit, setXendit] = useState<XenditStatus>({
    configured: false,
    mode: "missing",
    apiReachable: null,
    liveAllowed: false,
    cardBridgeApproved: false
  });

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      setHistory([]);
    }
    fetch("/api/xendit/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(setXendit)
      .catch(() => null);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);

  const updateHistory = useCallback((item: HistoryItem) => {
    setHistory((current) => {
      const next = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleScan = useCallback((raw: string) => {
    const decoded = decodePromptPay(raw);
    setParsed(decoded);
    setAmount(decoded.amount != null ? decoded.amount.toFixed(2) : "");
    setRecipientName(decoded.merchantName || "");
    setIdRouting(decoded.routingType === "NATIONAL_ID" || decoded.routingType === "BUSINESS_REG_NO" ? decoded.routingType : "");
    setIntentId(crypto.randomUUID());
    setResult(null);
    setError("");
    setScreen("review");
  }, []);

  const numericAmount = Number.parseFloat(amount.replace(",", "."));
  const routingReady = !parsed?.routingChoiceRequired || idRouting === "NATIONAL_ID" || idRouting === "BUSINESS_REG_NO";
  const canPay =
    !!parsed?.payoutCompatible &&
    parsed.validCrc === true &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    recipientName.trim().length >= 2 &&
    !!intentId &&
    routingReady &&
    !busy;

  const pollPayout = useCallback(async (payoutId: string) => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (attempt > 0) await wait(1800);
      const response = await fetch(`/api/payout/${encodeURIComponent(payoutId)}`, { cache: "no-store" });
      if (!response.ok) continue;
      const next: PayoutResult = await response.json();
      if (next.status && (FINAL_SUCCESS.has(next.status) || FINAL_FAILURE.has(next.status))) return next;
      setResult((current) => ({ ...(current || {}), ...next }));
    }
    return null;
  }, []);

  const submit = async () => {
    if (!parsed || !canPay) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount,
          recipientName: recipientName.trim(),
          rawQr: parsed.raw,
          intentId,
          idRouting: parsed.routingChoiceRequired ? idRouting : undefined
        })
      });
      const body: PayoutResult & { message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Xendit hat die Testzahlung abgelehnt.");

      setResult(body);
      setScreen("result");
      const initialItem: HistoryItem = {
        id: intentId,
        amount: numericAmount,
        recipient: recipientName.trim(),
        status: body.status || "ACCEPTED",
        createdAt: new Date().toISOString(),
        payoutId: body.payout_id
      };
      updateHistory(initialItem);

      if (body.payout_id) {
        setTracking(true);
        const final = await pollPayout(body.payout_id);
        if (final) {
          const merged = { ...body, ...final };
          setResult(merged);
          updateHistory({
            ...initialItem,
            status: merged.status || initialItem.status,
            failureCode: merged.failure_code
          });
        }
        setTracking(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zahlung konnte nicht gestartet werden.");
    } finally {
      setBusy(false);
    }
  };

  const resetPayment = () => {
    setParsed(null);
    setResult(null);
    setAmount("");
    setRecipientName("");
    setIdRouting("");
    setIntentId("");
    setError("");
    setTracking(false);
    setScreen("home");
  };

  const xenditLabel = useMemo(() => {
    if (xendit.mode === "development" && xendit.apiReachable === true) return "Xendit Sandbox verbunden";
    if (xendit.mode === "development" && xendit.apiReachable === false) return "Test-Key erkannt · API-Check fehlgeschlagen";
    if (xendit.mode === "development") return "Xendit Test-Key erkannt";
    if (xendit.mode === "live" && xendit.liveAllowed) return "Xendit Live aktiviert";
    if (xendit.mode === "live") return "Live-Key sicher gesperrt";
    return "Xendit Key fehlt";
  }, [xendit]);

  if (screen === "scan") return <Scanner onScan={handleScan} onClose={() => setScreen("home")} />;

  const resultStatus = result?.status || "ACCEPTED";
  const resultSucceeded = FINAL_SUCCESS.has(resultStatus);
  const resultFailed = FINAL_FAILURE.has(resultStatus);
  const resultTone = resultSucceeded ? "success" : resultFailed ? "failed" : "pending";

  return (
    <main className="app-shell">
      <div className="phone-shell">
        <header className="topbar">
          {screen !== "home" ? (
            <button className="icon-button" onClick={() => (screen === "result" ? resetPayment() : setScreen("home"))} aria-label="Zurück">
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="brand-mark">TH</div>
          )}
          <div className="brand-copy"><strong>ThaiPay</strong><span>by Digitale Gewinner</span></div>
          <div className={`connection-dot ${xendit.configured && xendit.apiReachable !== false ? "online" : ""}`}><Wifi size={16} /></div>
        </header>

        {screen === "home" && (
          <div className="content home-content">
            <section className="hero-card">
              <div className="eyebrow"><Sparkles size={14} /> THAILAND QR BRIDGE</div>
              <h1>PromptPay.<br />Ohne Thai-Bank-App.</h1>
              <p>Scanne einen PromptPay QR, prüfe Empfänger und Betrag und teste den lokalen Xendit-Payout-Rail.</p>
              <button className="scan-button" onClick={() => setScreen("scan")}><span><ScanLine size={25} /></span> PromptPay scannen <ChevronRight size={20} /></button>
              <div className="hero-foot"><ShieldCheck size={15} /> QR + CRC werden geprüft. Keine automatische Abbuchung.</div>
            </section>

            <section className="status-card">
              <div className="status-row">
                <div className={`status-icon ${xendit.configured && xendit.apiReachable !== false ? "good" : "warn"}`}><LockKeyhole size={18} /></div>
                <div><span className="label">PAYMENT RAIL</span><strong>{xenditLabel}</strong><small>PromptPay Payout · THB · Sandbox zuerst</small></div>
                <div className={`pill ${xendit.mode === "development" ? "sandbox" : ""}`}>{xendit.mode === "development" ? "TEST" : xendit.configured ? "LIVE" : "OFF"}</div>
              </div>
              <div className="divider" />
              <div className="status-row muted-row">
                <div className="status-icon"><CreditCard size={18} /></div>
                <div>
                  <span className="label">REVOLUT / FOREIGN CARD</span>
                  <strong>{xendit.cardBridgeApproved ? "Approval-Flag gesetzt" : "Noch nicht für Bridge freigegeben"}</strong>
                  <small>BaaS / e-Money / Remittance-Freigabe von Xendit erforderlich</small>
                </div>
                <CircleAlert size={18} className="amber" />
              </div>
            </section>

            <section className="quick-grid">
              <button onClick={() => setScreen("history")}><History size={19} /><span><strong>Verlauf</strong><small>{history.length} lokale Tests</small></span><ChevronRight size={17} /></button>
              <button onClick={() => setScreen("settings")}><Settings size={19} /><span><strong>Setup</strong><small>Xendit & Sicherheit</small></span><ChevronRight size={17} /></button>
            </section>

            <div className="info-strip"><ShieldCheck size={17} /><span><strong>Sicherheitsgrenze:</strong> Bill-Payment-, E-Wallet- und Customer-presented QRs werden nicht als normale Payout-Ziele umgedeutet.</span></div>
          </div>
        )}

        {screen === "review" && parsed && (
          <div className="content review-content">
            <div className="sandbox-banner"><CircleAlert size={17} /><span><strong>Sandbox-Modus:</strong> Diese Version testet Xendit-Routing. Eine Revolut-/Kartenbelastung ist bewusst noch nicht aktiviert.</span></div>
            <div className="section-kicker">ZAHLUNG PRÜFEN</div>
            <div className="payee-card">
              <div className="payee-icon"><QrCode size={28} /></div>
              <div><small>{parsed.kind === "bill" ? "Bill Payment QR" : parsed.kind === "customer_presented" ? "Customer-presented QR" : "PromptPay Empfänger"}</small><strong>{parsed.merchantName || "Empfängername erforderlich"}</strong><span>{parsed.proxyType || "QR"} · {maskPromptPay(parsed.proxyValue)}</span></div>
              {parsed.validCrc === true && <div className="verified-badge"><Check size={14} /></div>}
            </div>

            <div className="qr-meta">
              <div><span>CRC</span><strong>{parsed.validCrc === true ? "Verifiziert ✓" : parsed.validCrc === false ? "Ungültig" : "Fehlt"}</strong></div>
              <div><span>QR-Typ</span><strong>{parsed.kind}</strong></div>
              <div><span>POI</span><strong>{parsed.poiMethod || "–"}</strong></div>
              <div><span>Währung</span><strong>{parsed.currency === "764" ? "THB" : parsed.currency || "–"}</strong></div>
            </div>

            <label className="field-label">Empfängername</label>
            <input className="text-input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="z. B. Somchai Store" autoComplete="off" />

            <label className="field-label">Betrag</label>
            <div className="amount-input"><span>฿</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" readOnly={parsed.amount != null} /><em>THB</em></div>
            {parsed.amount != null && <div className="fixed-amount">Der Betrag ist im QR fest codiert und kann nicht verändert werden.</div>}

            {parsed.routingChoiceRequired && (
              <div className="routing-choice">
                <span>13-stellige PromptPay-ID ist …</span>
                <div className="routing-buttons">
                  <button className={idRouting === "NATIONAL_ID" ? "active" : ""} onClick={() => setIdRouting("NATIONAL_ID")}>Privatperson · National ID</button>
                  <button className={idRouting === "BUSINESS_REG_NO" ? "active" : ""} onClick={() => setIdRouting("BUSINESS_REG_NO")}>Firma · Tax / Business ID</button>
                </div>
              </div>
            )}

            <div className={`compat-card ${parsed.payoutCompatible && parsed.validCrc === true ? "compatible" : "blocked"}`}>
              {parsed.payoutCompatible && parsed.validCrc === true ? <ShieldCheck size={20} /> : <CircleAlert size={20} />}
              <div><strong>{parsed.payoutCompatible && parsed.validCrc === true ? "Technisch payout-kompatibel" : "Payout blockiert"}</strong><span>{parsed.note}</span></div>
            </div>

            <div className="funding-card"><WalletCards size={20} /><div><span>AKTUELLE GELDQUELLE</span><strong>{xendit.mode === "development" ? "Xendit Sandbox Balance" : "Xendit Server Balance"}</strong></div><div className="mini-pill">SAFE</div></div>
            <button className="primary-button" disabled={!canPay} onClick={submit}>{busy ? "Xendit wird angefragt…" : `Test-Payout ${Number.isFinite(numericAmount) ? `${numericAmount.toFixed(2)} ฿` : "senden"}`}</button>
            {error && <div className="inline-error">{error}</div>}
            <p className="fineprint">Der Server dekodiert den Original-QR erneut. Routing-Daten aus dem Browser werden nicht vertraut. Live-Payouts bleiben separat gesperrt.</p>
          </div>
        )}

        {screen === "result" && (
          <div className="content result-content">
            <div className={`status-orb ${resultTone}`}>
              {tracking && !resultSucceeded && !resultFailed ? <Loader2 className="spin" size={35} /> : resultSucceeded ? <Check size={38} /> : resultFailed ? <CircleX size={38} /> : <Clock3 size={34} />}
            </div>
            <div className="section-kicker">XENDIT {result?.sandbox === false ? "LIVE" : "SANDBOX"}</div>
            <h2>{Number.isFinite(numericAmount) ? numericAmount.toFixed(2) : "0.00"} ฿</h2>
            <div className="status-line">{tracking && <Loader2 className="spin" size={12} />}<strong>{statusLabel(resultStatus)}</strong></div>
            <p>{resultSucceeded ? "Xendit meldet die Auszahlung als erfolgreich." : resultFailed ? "Xendit konnte die Auszahlung nicht abschließen." : tracking ? "Wir verfolgen den Payout bis zum finalen Status." : "Payout wurde angelegt; der finale Status kann später folgen."}</p>
            <div className="receipt-card">
              <div><span>Empfänger</span><strong>{recipientName}</strong></div>
              <div><span>Status</span><strong>{resultStatus}</strong></div>
              {result?.failure_code && <div><span>Fehlercode</span><strong className="failure">{result.failure_code}</strong></div>}
              <div><span>Payout ID</span><strong className="mono">{result?.payout_id || result?.reference_id || "–"}</strong></div>
            </div>
            <button className="primary-button" onClick={resetPayment}>Fertig</button>
          </div>
        )}

        {screen === "history" && (
          <div className="content list-content">
            <div className="section-kicker">LOKALER VERLAUF</div><h2>Testzahlungen</h2>
            {history.length === 0 ? (
              <div className="empty"><Clock3 size={28} /><strong>Noch keine Tests</strong><span>Deine Sandbox-Payouts erscheinen hier.</span></div>
            ) : history.map((item) => (
              <div className={`history-row ${historyTone(item.status)}`} key={item.id}>
                <div className="history-icon">{FINAL_FAILURE.has(item.status) ? <CircleX size={16} /> : FINAL_SUCCESS.has(item.status) ? <Check size={16} /> : <Clock3 size={16} />}</div>
                <div><strong>{item.recipient}</strong><span>{new Date(item.createdAt).toLocaleString("de-DE")}{item.failureCode ? ` · ${item.failureCode}` : ""}</span></div>
                <div className="history-money"><strong>{item.amount.toFixed(2)} ฿</strong><span>{item.status}</span></div>
              </div>
            ))}
          </div>
        )}

        {screen === "settings" && (
          <div className="content list-content">
            <div className="section-kicker">SETUP</div><h2>Sicherheit & Rails</h2>
            <div className="settings-card">
              <div><span>Xendit API Key</span><strong>{xendit.mode === "development" ? "Development" : xendit.mode}</strong></div>
              <div><span>API-Verbindung</span><strong><span className={`health-badge ${xendit.apiReachable === true ? "ok" : xendit.apiReachable === false ? "bad" : ""}`}>{xendit.apiReachable === true ? "ERREICHBAR" : xendit.apiReachable === false ? "FEHLER" : "NICHT GEPRÜFT"}</span></strong></div>
              <div><span>PromptPay Decoder</span><strong>BOT Tag 29 + CRC</strong></div>
              <div><span>Live Payouts</span><strong>{xendit.liveAllowed ? "freigegeben" : "gesperrt"}</strong></div>
              <div><span>Foreign Card → PromptPay</span><strong>{xendit.cardBridgeApproved ? "Approval markiert" : "Xendit-Freigabe offen"}</strong></div>
            </div>
            <div className="info-strip"><LockKeyhole size={17} /><span>Normales Card Acquiring darf nicht einfach als Zahlungsintermediär für fremde PromptPay-Empfänger verwendet werden. Deshalb bleibt die Karten-Bridge aus, bis Xendit den passenden BaaS/e-Money/Remittance-Flow schriftlich bestätigt.</span></div>
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
