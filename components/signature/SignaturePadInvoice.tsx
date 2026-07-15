"use client";

import { useState, useRef, useEffect } from "react";
import { Signature } from "@/types";
import Link from "next/link";
import { CompanySettings, DEFAULT_COMPANY_SETTINGS } from "@/lib/company";

interface SignaturePadInvoiceProps {
  onSave: (signature: Signature) => void;
  onRemove?: () => void;
  existingSignature?: Signature | null;
  buttonText?: string;
  showRemoveButton?: boolean;
  estimateId?: string;
  showDetailedBreakdown?: boolean;
  // Passed down from the page (public pages load this off the bundle RPC,
  // not useCompany(), since there's no authenticated session here) —
  // falls back to generic defaults if the caller doesn't have it yet.
  company?: CompanySettings;
}

const BRAND_GREEN = "#009966";

export default function SignaturePadInvoice({
  onSave,
  onRemove,
  existingSignature,
  buttonText = "Sign Document",
  showRemoveButton = true,
  estimateId,
  showDetailedBreakdown = true,
  company = DEFAULT_COMPANY_SETTINGS,
}: SignaturePadInvoiceProps) {
  const [showModal, setShowModal] = useState(false);
  const [signatureType, setSignatureType] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [signed, setSigned] = useState(!!existingSignature);
  const [signature, setSignature] = useState<Signature | null>(existingSignature || null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [showTerms, setShowTerms] = useState(false);
  // Update signed state when existingSignature changes
  useEffect(() => {
    if (existingSignature) {
      setSignature(existingSignature);
      setSigned(true);
    } else {
      setSignature(null);
      setSigned(false);
    }
  }, [existingSignature]);

  useEffect(() => {
    if (showModal && signatureType === "draw") {
      setTimeout(() => initCanvas(), 50);
    }
  }, [showModal, signatureType]);

  const initCanvas = () => {
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
  };

  const getCanvasCoordinates = (e: any) => {
    if (!canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    return {
      x: Math.min(Math.max(0, x), canvas.width),
      y: Math.min(Math.max(0, y), canvas.height)
    };
  };

  const startDrawing = (e: any) => {
    if (!canvasRef.current || !ctxRef.current) return;
    e.preventDefault();
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    const ctx = ctxRef.current;
    
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: any) => {
    if (!isDrawing || !canvasRef.current || !ctxRef.current) return;
    e.preventDefault();
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    const ctx = ctxRef.current;
    
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !ctxRef.current) return;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setTypedName("");
  };

  const handleSave = () => {
    let value = "";

    if (signatureType === "draw" && canvasRef.current) {
      value = canvasRef.current.toDataURL();
    } else if (signatureType === "type" && typedName.trim()) {
      value = typedName.trim();
    } else {
      alert("Please provide a signature");
      return;
    }

    const newSignature = {
      type: signatureType,
      value,
      date: new Date().toISOString(),
    };

    setSignature(newSignature);
    setSigned(true);
    onSave(newSignature);

    setShowModal(false);
    setTypedName("");
    if (canvasRef.current && ctxRef.current) {
      clearCanvas();
    }
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
    }
    setSignature(null);
    setSigned(false);
    setShowRemoveConfirm(false);
  };

  // Terms & Conditions Component — the company's own text (Settings), split
  // into lines so it reads the same as the old hardcoded checklist did.
  const TermsAndConditions = () => (
    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="space-y-1 text-[11px] text-gray-600">
        {company.terms_conditions.split("\n").filter(Boolean).map((line, i) => (
          <p key={i}>✓ {line}</p>
        ))}
        {company.warranty_text && <p>✓ {company.warranty_text}</p>}
        <p className="mt-2 text-[10px] text-gray-400 italic">By signing, you agree to all terms above</p>
      </div>
    </div>
  );

  // Main Card Component
  return (
<div className="bg-white rounded-xl p-3 space-y-3">

  {/* Terms */}
  <div className="rounded-xl overflow-hidden">

    <button
      onClick={() => setShowTerms(!showTerms)}
      className="w-full px-3 py-2 flex items-center justify-between"
      style={{ backgroundColor: "#f0fdf4" }} // light green tint
    >
      <span className="text-[11px] font-semibold text-emerald-800">
        Terms & Conditions
      </span>

      <span
        className={`text-xs text-emerald-500 transition ${
          showTerms ? "rotate-180" : ""
        }`}
      >
        ▼
      </span>
    </button>

    {showTerms && (
      <div className="p-3 text-sm text-slate-600">
        <TermsAndConditions />
      </div>
    )}

  </div>

  {/* SIGNED STATE */}
  {signed ? (
    <div className="px-3 py-3 space-y-2 text-center">

      <div className="text-sm font-semibold text-emerald-700">
        Signed
      </div>

      {signature && (
        <div className="flex flex-col items-center space-y-2">

          {signature.type === "draw" ? (
            <img
              src={signature.value}
              alt="Signature"
              className="max-h-14 object-contain"
            />
          ) : (
            <div
              className="text-[32px] text-emerald-900"
              style={{
                fontFamily: "'Great Vibes', cursive",
                lineHeight: 1.1,
              }}
            >
              {signature.value}
            </div>
          )}

          <div
            className="w-40 border-b"
            style={{ borderColor: "#d1fae5" }} // emerald-100
          />

          <div className="text-[10px] text-emerald-600">
            Electronically signed • {new Date(signature.date).toLocaleDateString()}
          </div>

        </div>
      )}
    </div>
  ) : (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        ✍️ Sign Estimate
      </button>

      {showDetailedBreakdown && estimateId && (
        <Link href={`/public/estimates/${estimateId}/itemized`}>
          <button
            className="w-full py-2.5 rounded-xl text-sm"
            style={{
              backgroundColor: "#f0fdf4",
              color: "#166534"
            }}
          >
            View Detailed Breakdown
          </button>
        </Link>
      )}
    </>
  )}

  {/* MODAL */}
  {showModal && (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">

      <div
        className="bg-white rounded-2xl w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >

        <h3 className="text-sm font-semibold mb-3 text-emerald-800">
          Customer Signature
        </h3>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setSignatureType("draw")}
            className="flex-1 py-2 text-sm rounded-lg text-white"
            style={{
              backgroundColor:
                signatureType === "draw" ? BRAND_GREEN : "#e5e7eb"
            }}
          >
            Draw
          </button>

          <button
            onClick={() => setSignatureType("type")}
            className="flex-1 py-2 text-sm rounded-lg"
            style={{
              backgroundColor:
                signatureType === "type" ? BRAND_GREEN : "#e5e7eb",
              color: signatureType === "type" ? "white" : "#374151"
            }}
          >
            Type
          </button>
        </div>

        {signatureType === "type" ? (
          <input
            type="text"
            placeholder="Full name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            className="w-full border rounded-lg p-3 text-sm focus:outline-none"
            style={{ borderColor: "#d1fae5" }}
            autoFocus
          />
        ) : (
          <div onTouchMove={(e) => e.preventDefault()}>
            <canvas
              ref={canvasRef}
              className="w-full bg-white touch-none rounded-lg"
              style={{
                height: "120px",
                cursor: "crosshair",
                border: "1px solid #d1fae5"
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />

            <div className="flex justify-end px-2 py-1">
              <button className="text-xs text-emerald-600" onClick={clearCanvas}>
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setShowModal(false)}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ backgroundColor: "#f3f4f6", color: "#374151" }}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className="flex-1 py-2 rounded-lg text-sm text-white"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            Save
          </button>
        </div>

      </div>
    </div>
  )}

</div>
  );
}