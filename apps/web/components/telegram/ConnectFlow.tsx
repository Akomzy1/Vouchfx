"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, QrCode, Loader2, CheckCircle, AlertCircle, LogOut } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";

// ─── Types ────────────────────────────────────────────────────────────────────

type Method = "phone" | "qr";

type PhasePhone =
  | "idle"
  | "phone_input"
  | "code_sent"
  | "two_fa"
  | "success"
  | "error";

type PhaseQr =
  | "idle"
  | "loading"
  | "ready"
  | "success"
  | "error";

type SessionStatus = "active" | "limited" | "banned" | "disconnected" | "none";

interface ConnectFlowProps {
  /** Initial session status from the server — none if not yet connected */
  initialStatus: SessionStatus;
  /** ISO string of last connection, or null */
  lastConnectedAt: string | null;
}

// ─── Connected state ──────────────────────────────────────────────────────────

function ConnectedCard({
  status,
  lastConnectedAt,
  onDisconnect,
}: {
  status: SessionStatus;
  lastConnectedAt: string | null;
  onDisconnect: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/disconnect", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to disconnect");
      onDisconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  const pillStatus =
    status === "active" ? "connected" :
    status === "limited" ? "paused" :
    "disconnected";

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-primary">Telegram</p>
          <StatusPill status={pillStatus} label={
            status === "active" ? "Connected" :
            status === "limited" ? "Limited — SpamBot flagged" :
            status === "banned" ? "Banned" : "Disconnected"
          } />
        </div>
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-loss hover:opacity-80 disabled:opacity-50"
        >
          <LogOut size={14} />
          {loading ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>

      {lastConnectedAt && (
        <p className="text-xs text-text-muted">
          Last connected:{" "}
          {new Date(lastConnectedAt).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}

      {status === "limited" && (
        <div className="rounded-lg border border-warning/30 bg-amber-900/20 px-3 py-2 text-xs text-warning">
          Your account was flagged by Telegram&apos;s SpamBot. Signal copying is paused.
          Open Telegram → @SpamBot and follow the instructions to restore your account.
        </div>
      )}

      {status === "banned" && (
        <div className="rounded-lg border border-loss/30 bg-red-900/20 px-3 py-2 text-xs text-loss">
          Your Telegram account has been restricted. VouchFX cannot copy signals. Contact
          Telegram support to resolve this.
        </div>
      )}

      {error && (
        <p className="text-xs text-loss">{error}</p>
      )}

      <p className="text-xs text-text-muted">
        VouchFX connects as a <strong className="text-text-secondary">read-only</strong> Telegram
        client — it never sends messages, joins channels, or modifies your account.
      </p>
    </div>
  );
}

// ─── Phone + code flow ────────────────────────────────────────────────────────

function PhoneFlow({ onSuccess }: { onSuccess: () => void }) {
  const [phase, setPhase] = useState<PhasePhone>("phone_input");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [twoFaPass, setTwoFaPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send code");
      setPhase("code_sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Invalid code");
      if (json.twoFaNeeded) {
        setPhase("two_fa");
      } else if (json.success) {
        setPhase("success");
        setTimeout(onSuccess, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function verify2fa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: twoFaPass }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Incorrect password");
      setPhase("success");
      setTimeout(onSuccess, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (phase === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle size={32} className="text-profit" />
        <p className="text-sm font-medium text-text-primary">Telegram connected!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {phase === "phone_input" && (
        <form onSubmit={sendCode} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Phone number (with country code)
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2348012345678"
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <ErrorBox message={error} />}
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Send code"}
          </button>
        </form>
      )}

      {phase === "code_sent" && (
        <form onSubmit={verifyCode} className="space-y-3">
          <p className="text-xs text-text-secondary">
            Code sent to <span className="text-text-primary">{phone}</span> in your Telegram app.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Verification code</label>
            <input
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345"
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono tracking-widest"
            />
          </div>
          {error && <ErrorBox message={error} />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPhase("phone_input"); setError(null); setCode(""); }}
              className="btn-ghost flex-1"
            >
              Back
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : "Verify"}
            </button>
          </div>
        </form>
      )}

      {phase === "two_fa" && (
        <form onSubmit={verify2fa} className="space-y-3">
          <p className="text-xs text-text-secondary">
            Your account has 2-step verification enabled. Enter your cloud password.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">2FA password</label>
            <input
              type="password"
              required
              value={twoFaPass}
              onChange={(e) => setTwoFaPass(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <ErrorBox message={error} />}
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Confirm"}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── QR code flow ─────────────────────────────────────────────────────────────

function QrFlow({ onSuccess }: { onSuccess: () => void }) {
  const [phase, setPhase] = useState<PhaseQr>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  function startQr() {
    setPhase("loading");
    setError(null);
    setQrDataUrl(null);

    const es = new EventSource("/api/telegram/qr");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "qr") {
        setPhase("ready");
        setQrDataUrl(data.dataUrl);
      } else if (data.type === "success") {
        es.close();
        setPhase("success");
        setTimeout(onSuccess, 1500);
      } else if (data.type === "error") {
        es.close();
        setPhase("error");
        setError(data.message ?? "QR login failed");
      }
    };

    es.onerror = () => {
      es.close();
      setPhase("error");
      setError("Connection lost. Please try again.");
    };
  }

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  if (phase === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle size={32} className="text-profit" />
        <p className="text-sm font-medium text-text-primary">Telegram connected!</p>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="space-y-3 text-center">
        <p className="text-xs text-text-secondary">
          Scan a QR code with your Telegram mobile app to connect instantly — no code needed.
        </p>
        <button onClick={startQr} className="btn-primary w-full">Generate QR code</button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-xs text-text-secondary">Generating QR code…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-3">
        <ErrorBox message={error ?? "QR login failed"} />
        <button onClick={startQr} className="btn-ghost w-full">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary text-center">
        Open <strong className="text-text-primary">Telegram → Settings → Devices → Link Desktop Device</strong> and scan:
      </p>
      {qrDataUrl && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="Telegram QR login code"
            className="w-48 h-48 rounded-xl border-4 border-surface-elevated"
          />
        </div>
      )}
      <p className="text-xs text-text-muted text-center">
        QR refreshes every ~30 seconds. Waiting for scan…{" "}
        <Loader2 size={12} className="animate-spin inline" />
      </p>
    </div>
  );
}

// ─── Root ConnectFlow component ───────────────────────────────────────────────

export default function ConnectFlow({ initialStatus, lastConnectedAt }: ConnectFlowProps) {
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [last, setLast] = useState<string | null>(lastConnectedAt);
  const [method, setMethod] = useState<Method>("phone");
  const [showing, setShowing] = useState(false);

  function handleSuccess() {
    setStatus("active");
    setLast(new Date().toISOString());
    setShowing(false);
  }

  function handleDisconnect() {
    setStatus("none");
    setLast(null);
  }

  if (status !== "none") {
    return (
      <ConnectedCard
        status={status}
        lastConnectedAt={last}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return (
    <div className="card p-5 space-y-5">
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-primary">Connect Telegram</p>
        <p className="text-xs text-text-secondary">
          VouchFX connects as a read-only client to your account — it can only read channels,
          never send messages or modify your account.
        </p>
      </div>

      {!showing ? (
        <button onClick={() => setShowing(true)} className="btn-primary w-full">
          Connect Telegram
        </button>
      ) : (
        <div className="space-y-4">
          {/* Method tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setMethod("phone")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium transition-colors ${
                method === "phone"
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Phone size={13} /> Phone + code
            </button>
            <button
              onClick={() => setMethod("qr")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium border-l border-border transition-colors ${
                method === "qr"
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <QrCode size={13} /> QR code
            </button>
          </div>

          {method === "phone" ? (
            <PhoneFlow onSuccess={handleSuccess} />
          ) : (
            <QrFlow onSuccess={handleSuccess} />
          )}

          <button
            onClick={() => setShowing(false)}
            className="text-xs text-text-muted hover:text-text-primary w-full"
          >
            Cancel
          </button>
        </div>
      )}

      <p className="text-2xs text-text-muted">
        Your session string is encrypted with AES-256-GCM and stored securely. It is
        decrypted only in VouchFX&apos;s worker memory and never logged or shared.
      </p>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-loss/30 bg-red-900/20 px-3 py-2 text-xs text-loss">
      <AlertCircle size={12} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
