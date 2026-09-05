"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function Scanner({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        setStarting(true);
        const reader = new BrowserQRCodeReader();
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        const preferred = [...devices].reverse().find((d) => /back|rear|environment/i.test(d.label)) || devices.at(-1);
        if (!videoRef.current || cancelled) return;
        const controls = await reader.decodeFromVideoDevice(preferred?.deviceId, videoRef.current, (result) => {
          if (!result || cancelled) return;
          controlsRef.current?.stop();
          onScan(result.getText());
        });
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        setStarting(false);
        setError(e instanceof Error ? e.message : "Kamera konnte nicht gestartet werden.");
      }
    };
    start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onScan]);

  const scanFile = async (file?: File) => {
    if (!file) return;
    setError("");
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserQRCodeReader();
      const result = await reader.decodeFromImageUrl(url);
      onScan(result.getText());
    } catch {
      setError("Auf dem Bild wurde kein QR-Code erkannt.");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="scanner-screen">
      <div className="scanner-topbar">
        <button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={21} /></button>
        <span>PromptPay scannen</span>
        <label className="icon-button upload-button" aria-label="QR-Bild auswählen">
          <ImageIcon size={20} />
          <input type="file" accept="image/*" onChange={(e) => scanFile(e.target.files?.[0])} />
        </label>
      </div>
      <div className="camera-stage">
        <video ref={videoRef} playsInline muted className="camera-video" />
        <div className="scan-shade" />
        <div className="scan-frame"><span /><span /><span /><span /><div className="scan-line" /></div>
        {starting && <div className="camera-loader"><Loader2 className="spin" size={26} /> Kamera startet…</div>}
      </div>
      <div className="scanner-copy">
        <div className="scanner-chip"><Camera size={15} /> Personal & Merchant QR</div>
        <h2>QR ins Quadrat halten</h2>
        <p>ThaiPay liest den PromptPay-Empfänger lokal aus dem QR. Es wird noch keine Zahlung ausgelöst.</p>
        {error && <div className="inline-error">{error}</div>}
      </div>
    </div>
  );
}
