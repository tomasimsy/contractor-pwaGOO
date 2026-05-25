"use client";

import { useState, useRef, useEffect } from "react";
import { Signature } from "@/types";
import Link from "next/link";

interface SignaturePadInvoiceProps {
  onSave: (signature: Signature) => void;
  onRemove?: () => void;
  existingSignature?: Signature | null;
  buttonText?: string;
  showRemoveButton?: boolean;
  estimateId?: string;
  showDetailedBreakdown?: boolean;
}

const BRAND_GREEN = "#0e542c";

export default function SignaturePadInvoice({
  onSave,
  onRemove,
  existingSignature,
  buttonText = "Sign Document",
  showRemoveButton = true,
  estimateId,
  showDetailedBreakdown = true,
}: SignaturePadInvoiceProps) {
  const [showModal, setShowModal] = useState(false);
  const [signatureType, setSignatureType] = useState<"type" | "draw">("type");
  const [typedName, setTypedName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [signed, setSigned] = useState(!!existingSignature);
  const [signature, setSignature] = useState<Signature | null>(existingSignature || null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

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

  // Terms & Conditions Component
  const TermsAndConditions = () => (
    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="text-xs font-semibold text-gray-700 mb-2">Terms & Conditions</div>
      <div className="space-y-1 text-[11px] text-gray-600">
        <p>✓ Valid for 30 days from date issued</p>
        <p>✓ 50% deposit required to begin, balance due upon completion</p>
        <p>✓ Changes must be approved in writing (additional charges may apply)</p>
        <p>✓ Client must provide safe access to work areas</p>
        <p>✓ Client responsible for marking underground lines, irrigation, drain lines, low-voltage wires, and hidden utilities</p>
        <p>✓ Contractor not liable for damage from unmarked underground items</p>
        <p>✓ Warranty excludes: weather, tree roots, drainage, soil movement, customer neglect, or third-party work</p>
        <p>✓ NC residential jobs: cancellation rights per state and federal law</p>
        <p>✓ Schedule may be affected by weather, material delays, or hidden conditions</p>
        <p>✓ Debris cleanup limited to approved scope of work</p>
        <p className="mt-2 text-[10px] text-gray-400 italic">By signing, you agree to all terms above</p>
      </div>
    </div>
  );

  // Main Card Component
  return (
    <div className="bg-white rounded-xl p-5 shadow-md border border-gray-200 mt-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        Customer Signature
      </h3>

      {signed ? (
        <div className="text-center py-6 bg-green-50 rounded-xl border-2 border-green-600 transition-all duration-200 hover:shadow-md hover:bg-green-100/60">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-lg font-bold text-green-700">
            Signed & Approved!
          </div>
          <div className="text-sm text-green-600 mt-1">
            Thank you for your business
          </div>

          {signature && (
            <div className="mt-4">
              {signature.type === "draw" ? (
                <div className="flex justify-center mb-2">
                  <img 
                    src={signature.value} 
                    alt="Signature" 
                    className="max-h-16 object-contain border border-gray-200 rounded p-1 bg-white"
                  />
                </div>
              ) : (
                <div className="text-md font-semibold text-gray-700">
                  {signature.value}
                </div>
              )}
              <div className="text-sm text-gray-600 mt-1">
                {signature.type === "type" ? `Signed by: ${signature.value}` : "Electronic signature on file"}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(signature.date).toLocaleDateString()}
              </div>
            </div>
          )}

          {showRemoveButton && onRemove && (
            <button
              onClick={() => setShowRemoveConfirm(true)}
              className="mt-3 text-xs text-red-500 hover:text-red-700 transition"
            >
              Remove Signature
            </button>
          )}
        </div>
      ) : (
        <>
          <TermsAndConditions />
          
          <p className="text-xs text-gray-500 mb-4">
            By signing below, you agree to the terms and conditions above.
          </p>

          <div className="transition-all duration-200 hover:shadow-sm">
            <button
              onClick={() => setShowModal(true)}
              className="w-full py-2.5 rounded-xl text-sm text-white transition active:scale-95"
              style={{ backgroundColor: BRAND_GREEN }}
            >
              ✍️ {buttonText}
            </button>
          </div>

          {showDetailedBreakdown && estimateId && (
            <Link href={`/public/estimates/${estimateId}/itemized`}>
              <button className="w-full mt-3 py-2.5 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition flex items-center justify-center gap-2">
                <span>📋</span> View Detailed Breakdown
              </button>
            </Link>
          )}
        </>
      )}

      {/* Signature Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div 
            className="bg-white rounded-xl w-full max-w-md p-5 shadow-lg border border-green-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-3 text-gray-900">
              Customer Signature
            </h3>

            {/* Type Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSignatureType("type")}
                className={`flex-1 py-2 text-sm rounded-lg transition ${
                  signatureType === "type"
                    ? "text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
                style={
                  signatureType === "type"
                    ? { backgroundColor: BRAND_GREEN }
                    : undefined
                }
              >
                Type Name
              </button>

              <button
                onClick={() => setSignatureType("draw")}
                className={`flex-1 py-2 text-sm rounded-lg transition ${
                  signatureType === "draw"
                    ? "text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
                style={
                  signatureType === "draw"
                    ? { backgroundColor: BRAND_GREEN }
                    : undefined
                }
              >
                Draw Signature
              </button>
            </div>

            {/* Input Area */}
            {signatureType === "type" ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Type your full name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  style={{ outlineColor: BRAND_GREEN }}
                  autoFocus
                />
                <p className="text-[10px] text-gray-400 text-center">
                  This will be used as your electronic signature
                </p>
              </div>
            ) : (
              <div 
                className="border border-gray-200 rounded-lg overflow-hidden"
                onTouchMove={(e) => e.preventDefault()}
              >
                <canvas
                  ref={canvasRef}
                  className="w-full bg-white touch-none"
                  style={{ height: "150px", cursor: "crosshair" }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <div className="flex justify-between items-center px-2 py-1 bg-gray-50">
                  <button
                    onClick={clearCanvas}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Clear Canvas
                  </button>
                  <span className="text-[10px] text-gray-400">
                    Sign in the box above
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2 text-sm rounded-lg text-white transition hover:brightness-110 active:scale-[0.98]"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                Save Signature
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Remove Signature?</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will remove the signature from this document. The customer will need to sign again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                Remove Signature
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}