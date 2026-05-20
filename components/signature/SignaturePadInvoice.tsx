"use client";

import { useState, useRef, useEffect } from "react";
import { Signature } from "@/types";

interface SignaturePadProps {
  onSave: (signature: Signature) => void;
  onRemove?: () => void;
  existingSignature?: Signature | null;
  buttonText?: string;
  showRemoveButton?: boolean;
}

const BRAND_GREEN = "#0e542c";

export default function SignaturePad({
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

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

    onSave({
      type: signatureType,
      value,
      date: new Date().toISOString(),
    });

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
    setShowRemoveConfirm(false);
  };

  /* ---------------- EXISTING SIGNATURE ---------------- */
  if (existingSignature) {
    return (
      <>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm relative">
          {showRemoveButton && onRemove && (
            <button
              onClick={() => setShowRemoveConfirm(true)}
              className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700 transition"
              title="Remove Signature"
            >
              ✕
            </button>
          )}
          
          {existingSignature.type === "draw" ? (
            <img
              src={existingSignature.value}
              alt="Signature"
              className="max-h-16 mx-auto"
            />
          ) : (
            <div className="text-xl font-semibold text-gray-800">
              {existingSignature.value}
            </div>
          )}

          <div className="text-[11px] text-gray-400 mt-2">
            Signed on {new Date(existingSignature.date).toLocaleDateString()}
          </div>

          <button
            type="button"
            onClick={() => {
              setSignatureType("draw");
              setShowModal(true);
            }}
            className="mt-2 text-xs px-3 py-1 rounded-lg text-white transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-[0.97]"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            Re-sign
          </button>
        </div>

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
      </>
    );
  }

  /* ---------------- BUTTON WITH TERMS ---------------- */
  return (
    <>
      {/* Terms & Conditions */}
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

      <button
        onClick={() => setShowModal(true)}
        className="w-full py-2.5 rounded-xl text-sm text-white transition active:scale-95"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        ✍️ {buttonText}
      </button>

      {/* ---------------- MODAL ---------------- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div 
            className="bg-white rounded-xl w-full max-w-md p-5 shadow-lg border border-green-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-3 text-gray-900">
              Customer Signature
            </h3>

            {/* SWITCH */}
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
                Type
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
                Draw
              </button>
            </div>

            {/* INPUT */}
            {signatureType === "type" ? (
              <input
                type="text"
                placeholder="Type full name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none"
                style={{ outlineColor: BRAND_GREEN }}
                autoFocus
              />
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
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* ACTIONS */}
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
    </>
  );
}