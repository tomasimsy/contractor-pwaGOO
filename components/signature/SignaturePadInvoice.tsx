"use client";

import { useState, useRef, useEffect } from "react";
import { Signature } from "@/types";

interface SignaturePadProps {
  onSave: (signature: Signature) => void;
  existingSignature?: Signature | null;
  buttonText?: string;
}

const BRAND_GREEN = "#0e542c";

export default function SignaturePad({
  onSave,
  existingSignature,
  buttonText = "Sign Document",
}: SignaturePadProps) {
  const [showModal, setShowModal] = useState(false);
  const [signatureType, setSignatureType] = useState<"type" | "draw">("type");
  const [typedName, setTypedName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (showModal && signatureType === "draw") {
      initCanvas();
    }
  }, [showModal, signatureType]);

  const initCanvas = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = canvas.offsetWidth;
    canvas.height = 150;

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

  const startDrawing = (e: any) => {
    if (!canvasRef.current || !ctxRef.current) return;

    setIsDrawing(true);

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: any) => {
    if (!isDrawing || !canvasRef.current || !ctxRef.current) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopDrawing = () => setIsDrawing(false);

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
  };

  /* ---------------- EXISTING ---------------- */

  if (existingSignature) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">

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
    );
  }

  /* ---------------- BUTTON ---------------- */

  return (
    <>
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
          <div className="bg-white rounded-xl w-full max-w-md p-5 shadow-lg border border-green-100">

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
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full h-36 bg-white"
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
                    className="text-xs text-red-500"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* ACTIONS */}
            <div className="flex gap-2 mt-4">

              <button
  onClick={() => setShowModal(true)}
  className="w-full py-2.5 rounded-xl text-sm text-white transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-[0.98]"
  style={{ backgroundColor: BRAND_GREEN }}
>
  ✍️ {buttonText}
</button>

            </div>

          </div>
        </div>
      )}
    </>
  );
}