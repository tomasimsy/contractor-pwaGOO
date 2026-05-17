"use client";

import { useState, useRef } from "react";

type Signature = { type: "draw" | "type"; value: string; date: string };

interface SignaturePadProps {
onSave: (signature: Signature) => void;
existingSignature?: Signature | null;
}

export default function SignaturePad({ onSave, existingSignature }: SignaturePadProps) {
const [showModal, setShowModal] = useState(false);
const [signatureType, setSignatureType] = useState<"draw" | "type">("type");
  const [typedName, setTypedName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);

    const initCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
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
    setLastX(x);
    setLastY(y);
    ctx.beginPath();
    ctx.moveTo(x, y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
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
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    setLastX(x);
    setLastY(y);
    };

    const stopDrawing = () => setIsDrawing(false);

    const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
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

    const signature = {
    type: signatureType,
    value: value,
    date: new Date().toISOString()
    };

    onSave(signature);
    setShowModal(false);
    setTypedName("");
    clearCanvas();
    };

    return (
    <>
      {/* Display existing signature or button */}
      {existingSignature ? (
      <div className="text-center py-3 border rounded-lg bg-gray-50">
        {existingSignature.type === "draw" ? (
        <img src={existingSignature.value} alt="Signature" className="max-h-20 mx-auto" />
        ) : (
        <div className="text-2xl font-cursive">{existingSignature.value}</div>
        )}
        <div className="text-xs text-gray-500 mt-2">
          Signed on {new Date(existingSignature.date).toLocaleDateString()}
        </div>
        <button onClick={()=> setShowModal(true)}
          className="mt-3 text-sm text-blue-500"
          >
          Re-sign
        </button>
      </div>
      ) : (
      <button onClick={()=> setShowModal(true)}
        className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500
        hover:text-blue-500"
        >
        ✍️ Click to Sign
      </button>
      )}

      {/* Signature Modal */}
      {showModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-5">
          <h3 className="font-bold text-lg mb-3">Customer Signature</h3>

          <div className="flex gap-2 mb-4">
            <button onClick={()=> setSignatureType("type")}
              className={`flex-1 py-2 rounded-lg ${signatureType === "type" ? "bg-blue-500 text-white" :
              "bg-gray-100"}`}
              >
              Type Name
            </button>
            <button onClick={()=> setSignatureType("draw")}
              className={`flex-1 py-2 rounded-lg ${signatureType === "draw" ? "bg-blue-500 text-white" :
              "bg-gray-100"}`}
              >
              Draw
            </button>
          </div>

          {signatureType === "type" ? (
          <input type="text" placeholder="Type your full name" value={typedName} onChange={(e)=>
          setTypedName(e.target.value)}
          className="w-full border rounded-lg p-3 text-lg mb-4"
          autoFocus
          />
          ) : (
          <div className="border rounded-lg mb-4">
            <canvas ref={canvasRef} width={400} height={150} className="w-full h-36 border-b bg-white"
              onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
              onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
            <button onClick={clearCanvas} className="text-sm text-red-500 p-2">
              Clear
            </button>
          </div>
          )}

          <div className="flex gap-2">
            <button onClick={()=> setShowModal(false)}
              className="flex-1 py-2 border rounded-lg"
              >
              Cancel
            </button>
            <button onClick={handleSave} className="flex-1 py-2 bg-blue-500 text-white rounded-lg">
              Save Signature
            </button>
          </div>
        </div>
      </div>
      )}
    </>
    );
    }