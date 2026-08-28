"use client";

/**
 * Ported from contractor-pwa's components/signature/SignaturePad.tsx —
 * same draw/type capture UX and canvas logic, reused rather than
 * rewritten. Simplified for this app: no react-hot-toast dependency
 * (not installed here), and removal is just recordSignature(null)
 * instead of a separate onRemove/estimateId toast flow, since
 * EstimateService's contract is a single recordSignature call either
 * way.
 */
import { useState, useRef, useEffect } from "react";
import type { Estimate } from "@/lib/services/estimateService";

type Signature = NonNullable<Estimate["signature"]>;

interface SignaturePadProps {
  /** Returns whether the save succeeded, plus a message on failure.
   * The modal only closes on `ok: true`. The message matters: while
   * the modal is open it's a full-screen overlay (fixed inset-0 z-50)
   * — a caller's OWN error banner rendered outside this component is
   * invisible behind it, so a failure has to be shown IN here to ever
   * be seen. Found as a real gap: the modal correctly started staying
   * open on failure, but nothing on screen said why. */
  onSave: (signature: Signature) => Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string };
  onRemove?: () => void;
  existingSignature?: Signature | null;
  buttonText?: string;
  showRemoveButton?: boolean;
}

const BRAND_GREEN = "#009966";

export function SignaturePad({
  onSave,
  onRemove,
  existingSignature,
  buttonText = "Sign Document",
  showRemoveButton = true,
}: SignaturePadProps) {
  const [showModal, setShowModal] = useState(false);
  const [signatureType, setSignatureType] = useState<"type" | "draw">("type");
  const [typedName, setTypedName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Was previously "call onSave and close immediately" — regardless
  // of whether the network write had even started resolving. A real,
  // reported bug: the modal closing before the server confirmed
  // anything meant a customer saw no progress indicator during the
  // actual save, AND nothing stopped them from reopening the modal
  // and submitting a second signature while the first request was
  // still in flight (portal/sign/route.ts's "already signed" guard is
  // a separate SELECT-then-write, not atomic — two near-simultaneous
  // requests could both pass it). Now the modal stays open and every
  // control is disabled until onSave's promise actually resolves, and
  // only closes on a confirmed true.
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  function initCanvas() {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 400;
    canvas.height = 150;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctxRef.current = ctx;
  }

  useEffect(() => {
    if (showModal && signatureType === "draw") {
      setTimeout(() => initCanvas(), 50);
    }
  }, [showModal, signatureType]);

  function getCanvasCoordinates(e: React.MouseEvent | React.TouchEvent) {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x: Math.min(Math.max(0, x), canvas.width), y: Math.min(Math.max(0, y), canvas.height) };
  }

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    if (!canvasRef.current || !ctxRef.current) return;
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    setIsDrawing(true);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(coords.x, coords.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !canvasRef.current || !ctxRef.current) return;
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    ctxRef.current.lineTo(coords.x, coords.y);
    ctxRef.current.stroke();
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(coords.x, coords.y);
  }

  const stopDrawing = () => setIsDrawing(false);

  function clearCanvas() {
    if (!canvasRef.current || !ctxRef.current) return;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setTypedName("");
  }

  async function handleSave() {
    if (saving) return; // belt-and-suspenders against a double-click racing this same handler
    let value = "";
    if (signatureType === "draw" && canvasRef.current) {
      value = canvasRef.current.toDataURL();
    } else if (signatureType === "type" && typedName.trim()) {
      value = typedName.trim();
    } else {
      setErrorMsg("Please provide a signature before saving.");
      return;
    }
    setErrorMsg("");
    setSaving(true);
    let result: { ok: boolean; message?: string };
    try {
      result = await onSave({ type: signatureType, value, date: new Date().toISOString() });
    } finally {
      setSaving(false);
    }
    // Only close/clear on a CONFIRMED success — on failure the modal
    // stays open with the customer's drawn/typed signature still
    // intact (so they don't have to redo it after a transient error)
    // AND shows exactly why, right here — this modal is a full-screen
    // overlay while open, so a caller's own error banner rendered
    // outside it would otherwise be invisible.
    if (result.ok) {
      setShowModal(false);
      setTypedName("");
      if (canvasRef.current && ctxRef.current) clearCanvas();
    } else {
      setErrorMsg(result.message || "Something went wrong. Please try again.");
    }
  }

  if (existingSignature) {
    return (
      <>
        <div className="relative rounded-xl border border-border bg-card p-3 text-center">
          {showRemoveButton && onRemove && (
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(true)}
              className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground hover:bg-muted/70"
              title="Remove signature"
            >
              ✕
            </button>
          )}
          {existingSignature.type === "draw" ? (
            <img src={existingSignature.value} alt="Signature" className="mx-auto max-h-16" />
          ) : (
            <div className="text-xl font-semibold text-foreground">{existingSignature.value}</div>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground">Signed on {new Date(existingSignature.date).toLocaleDateString()}</div>
          <button
            type="button"
            onClick={() => { setSignatureType("draw"); setShowModal(true); }}
            className="mt-2 rounded-lg px-3 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            Re-sign
          </button>
        </div>

        {showRemoveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-card p-5">
              <h3 className="mb-2 text-lg font-semibold text-foreground">Remove signature?</h3>
              <p className="mb-4 text-sm text-muted-foreground">This will remove the signature. The customer will need to sign again.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowRemoveConfirm(false)} className="flex-1 rounded-lg border border-input py-2 text-sm text-foreground hover:bg-muted">Cancel</button>
                <button
                  type="button"
                  onClick={() => { setShowRemoveConfirm(false); onRemove?.(); }}
                  className="flex-1 rounded-lg bg-danger py-2 text-sm text-white hover:opacity-90"
                >
                  Remove signature
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={saving}
        onClick={() => setShowModal(true)}
        className="w-full rounded-xl py-2.5 text-sm text-white disabled:opacity-60"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        {buttonText}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            {errorMsg && <div className="mb-3 rounded-lg bg-danger/15 p-2 text-xs font-medium text-danger">{errorMsg}</div>}
            <h3 className="mb-3 text-base font-semibold text-foreground">Customer Signature</h3>
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setSignatureType("type")}
                className="flex-1 rounded-lg py-2 text-sm disabled:opacity-60"
                style={signatureType === "type" ? { backgroundColor: BRAND_GREEN, color: "#fff" } : undefined}
              >
                Type
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setSignatureType("draw")}
                className="flex-1 rounded-lg py-2 text-sm disabled:opacity-60"
                style={signatureType === "draw" ? { backgroundColor: BRAND_GREEN, color: "#fff" } : undefined}
              >
                Draw
              </button>
            </div>
            {signatureType === "type" ? (
              <input
                type="text"
                placeholder="Type full name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                autoFocus
                disabled={saving}
                className="w-full rounded-lg border border-input bg-background p-2 text-sm outline-none disabled:opacity-60"
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-input" onTouchMove={(e) => e.preventDefault()}>
                <canvas
                  ref={canvasRef}
                  className="w-full touch-none bg-white"
                  style={{ height: "150px", cursor: saving ? "default" : "crosshair" }}
                  onMouseDown={saving ? undefined : startDrawing}
                  onMouseMove={saving ? undefined : draw}
                  onMouseUp={saving ? undefined : stopDrawing}
                  onMouseLeave={saving ? undefined : stopDrawing}
                  onTouchStart={saving ? undefined : startDrawing}
                  onTouchMove={saving ? undefined : draw}
                  onTouchEnd={saving ? undefined : stopDrawing}
                />
                <div className="flex justify-between bg-muted px-2 py-1">
                  <button type="button" disabled={saving} onClick={clearCanvas} className="text-xs text-danger hover:opacity-80 disabled:opacity-60">Clear</button>
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={saving} onClick={() => setShowModal(false)} className="flex-1 rounded-lg bg-muted py-2 text-sm text-foreground hover:bg-muted/70 disabled:opacity-60">Cancel</button>
              <button type="button" disabled={saving} onClick={handleSave} className="flex-1 rounded-lg py-2 text-sm text-white disabled:opacity-60" style={{ backgroundColor: BRAND_GREEN }}>
                {saving ? "Saving…" : "Save Signature"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
