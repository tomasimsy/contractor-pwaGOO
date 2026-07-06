"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import {
  Camera,
  X,
  RotateCcw,
  Check,
  MapPin,
  Loader2,
  Tag,
  CloudOff,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PhotoStage = "before" | "during" | "after";

export type PhotoAnnotation = {
  id: string;
  x: number; // percentage 0-100, relative to image width
  y: number; // percentage 0-100, relative to image height
  note: string;
};

export type QueuedPhoto = {
  localId: string;
  estimateId: string;
  projectName: string | null;
  stage: PhotoStage;
  tag: string;
  caption: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  annotations: PhotoAnnotation[];
  blob: Blob;
};

const STAGE_LABELS: Record<PhotoStage, string> = {
  before: "Before",
  during: "During",
  after: "After",
};

const AREA_TAGS = ["Roof", "Gutters", "Flashing", "Siding", "Deck", "Interior", "Foundation", "Other"];

const BUCKET = "estimate-images";
const DB_NAME = "osr-photo-queue";
const STORE_NAME = "queued_photos";

// ---------------------------------------------------------------------------
// IndexedDB queue — no external dependency. This is what makes capture work
// with no signal: photos are written locally first, then synced when online.
// ---------------------------------------------------------------------------

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueAdd(photo: QueuedPhoto) {
  const db = await openQueueDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(photo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queueGetAll(): Promise<QueuedPhoto[]> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function queueRemove(localId: string) {
  const db = await openQueueDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function uploadQueuedPhoto(photo: QueuedPhoto) {
  const path = `${photo.estimateId}/${photo.stage}/${photo.localId}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, photo.blob, {
    cacheControl: "3600",
    upsert: true,
    contentType: "image/jpeg",
  });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const fileName = `${photo.stage}-${photo.localId}.jpg`;

  const { error: insertError } = await supabase.from("estimate_images").insert({
    estimate_id: photo.estimateId,
    project_name: photo.projectName,
    stage: photo.stage,
    tag: photo.tag || null,
    caption: photo.caption || null,
    storage_path: path,
    url: publicUrlData.publicUrl,
    file_name: fileName,
    image_url: publicUrlData.publicUrl,
    latitude: photo.latitude,
    longitude: photo.longitude,
    captured_at: photo.capturedAt,
    annotations: photo.annotations,
  });
  if (insertError) throw insertError;
}

/**
 * Attempts to upload every queued photo. Safe to call repeatedly — call this
 * from a layout-level effect on `online`, from this component on mount, or
 * from a manual "retry" button. Photos that fail stay queued for next time.
 */
export async function syncPhotoQueue(): Promise<{ uploaded: number; remaining: number }> {
  let uploaded = 0;
  try {
    const all = await queueGetAll();
    for (const photo of all) {
      try {
        await uploadQueuedPhoto(photo);
        await queueRemove(photo.localId);
        uploaded++;
      } catch (err: any) {
        console.error(
          "Sync failed for queued photo, will retry later:",
          String(err),
          err?.message,
          JSON.stringify(err, Object.getOwnPropertyNames(err || {}))
        );
      }
    }
    const remaining = (await queueGetAll()).length;
    return { uploaded, remaining };
  } catch (err) {
    // IndexedDB unavailable (e.g. private browsing) — fail quietly
    return { uploaded, remaining: 0 };
  }
}

async function getQueueCount(estimateId?: string): Promise<number> {
  try {
    const all = await queueGetAll();
    return estimateId ? all.filter((p) => p.estimateId === estimateId).length : all.length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// EstimateCamera — the capture flow
// ---------------------------------------------------------------------------

export function EstimateCamera({
  estimateId,
  projectName,
  onUploaded,
  className = "",
}: {
  estimateId: string;
  projectName?: string;
  onUploaded?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"camera" | "review">("camera");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [stage, setStage] = useState<PhotoStage>("before");
  const [tag, setTag] = useState("");
  const [caption, setCaption] = useState("");
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await getQueueCount(estimateId));
  }, [estimateId]);

  // Sync whenever we come back online, and once on mount
  useEffect(() => {
    refreshPendingCount();
    const handleOnline = async () => {
      await syncPhotoQueue();
      await refreshPendingCount();
      onUploaded?.();
    };
    if (navigator.onLine) handleOnline();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Camera lifecycle ----
  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.error("Video play() failed:", playErr);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Couldn't access the camera. Check your browser permissions.");
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => {
    if (open && step === "camera") startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, facingMode]);

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleOpen = () => {
    setStep("camera");
    setCapturedBlob(null);
    setCapturedUrl(null);
    setAnnotations([]);
    setAnnotateMode(false);
    setCaption("");
    setTag("");
    setStage("before");
    setLocation(null);
    setOpen(true);
    requestLocation();
  };

  const handleClose = () => {
    stopCamera();
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setOpen(false);
  };

const capturePhoto = async () => {
  const video = videoRef.current;
  const canvas = canvasRef.current;

  if (!video || !canvas) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // --------------------------------------------------
  // Draw Camera Image
  // --------------------------------------------------

  if (facingMode === "user") {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (facingMode === "user") {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --------------------------------------------------
  // Reverse Geocode Street Address
  // --------------------------------------------------

  // ============================================================================
// MODERN PHOTO METADATA OVERLAY
// Replace ONLY the overlay drawing section inside capturePhoto()
// (after you've drawn the image to the canvas)
// ============================================================================

// Reverse geocode (keep your existing code)
// ============================================================================
// CLEAN MODERN INSPECTION OVERLAY (NO BORDER)
// Replace ONLY the overlay drawing section.
// ============================================================================

// Reverse geocode
// ============================================================================
// MODERN SAMSUNG-STYLE CAMERA OVERLAY
// Minimal • Bottom Left • Professional Inspection Style
// Replace the ENTIRE overlay drawing section after drawImage()
// ============================================================================

// --------------------------------------------------------------------------
// Reverse Geocode
// --------------------------------------------------------------------------

let streetAddress = "N/A";

if (location) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.lat}&lon=${location.lng}`
    );

    const json = await res.json();

    const addr = json.address ?? {};

    streetAddress =
  [
    addr.house_number,
    addr.road,
    addr.city || addr.town,
  ]
 
        .filter(Boolean)
        .join(", ") || json.display_name || "N/A";
  } catch {
    streetAddress = "N/A";
  }
}

// --------------------------------------------------------------------------
// Date / Time
// --------------------------------------------------------------------------

const now = new Date();

const date = now.toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const time = now.toLocaleTimeString("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const project = projectName || "N/A";
const area = tag || "N/A";
const stageName = stage
  ? stage.charAt(0).toUpperCase() + stage.slice(1)
  : "N/A";

// --------------------------------------------------------------------------
// Layout
// --------------------------------------------------------------------------

const left = 28;
const bottom = 28;

const padding = 20;

const titleSize = Math.max(20, canvas.width * 0.012);

const bodySize = Math.max(26, canvas.width * 0.014);

const smallSize = Math.max(22, canvas.width * 0.012);

const lineGap = 12;

const lines = [
  streetAddress,
  `${date} • ${time}`,
  project,
  `${area} • ${stageName}`,
];

ctx.font = `${bodySize}px Arial`;

let widest = 0;

for (const line of lines) {
  widest = Math.max(widest, ctx.measureText(line).width);
}

const boxWidth = Math.min(
  widest + padding * 2,
  canvas.width * 0.85
);

const boxHeight =
  padding * 2 +
  titleSize +
  18 +
  lines.length * (bodySize + lineGap);

// --------------------------------------------------------------------------
// Glass Background
// --------------------------------------------------------------------------

const x = left;
const y = canvas.height - boxHeight - bottom;

ctx.save();

ctx.fillStyle = "rgba(15,23,42,.42)";

ctx.beginPath();

ctx.roundRect(
  x,
  y,
  boxWidth,
  boxHeight,
  18
);

ctx.fill();

// --------------------------------------------------------------------------
// Header
// --------------------------------------------------------------------------

ctx.fillStyle = "#F8FAFC";

ctx.font = `bold ${titleSize}px Arial`;

ctx.fillText(
  "OSR Pros",
  x + padding,
  y + padding + titleSize
);

// --------------------------------------------------------------------------
// Divider
// --------------------------------------------------------------------------

ctx.beginPath();

ctx.strokeStyle = "rgba(255,255,255,.18)";
ctx.lineWidth = 1;

ctx.moveTo(
  x + padding,
  y + padding + titleSize + 12
);

ctx.lineTo(
  x + boxWidth - padding,
  y + padding + titleSize + 12
);

ctx.stroke();

// --------------------------------------------------------------------------
// Body
// --------------------------------------------------------------------------

let currentY =
  y +
  padding +
  titleSize +
  42;

ctx.font = `${bodySize}px Arial`;

const drawLabel = (
  icon: string,
  text: string,
  color = "#FFFFFF"
) => {
  ctx.fillStyle = color;

  ctx.fillText(
    `${icon} ${text}`,
    x + padding,
    currentY
  );

  currentY += bodySize + lineGap;
};

drawLabel("📍", streetAddress);

drawLabel(
  "🕒",
  `${date} • ${time}`
);

// drawLabel(
//   "🏠",
//   project
// );

// drawLabel(
//   "🛠",
//   `${area} • ${stageName}`
// );

// --------------------------------------------------------------------------
// Optional Notes
// --------------------------------------------------------------------------

if (caption.trim()) {
  currentY += 8;

  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = `${smallSize}px Arial`;

  const note =
    caption.length > 55
      ? caption.substring(0, 55) + "..."
      : caption;

  ctx.fillText(
    note,
    x + padding,
    currentY
  );
}

ctx.restore();
  // --------------------------------------------------
  // Export Image
  // --------------------------------------------------

  canvas.toBlob(
    (blob) => {
      if (!blob) return;

      setCapturedBlob(blob);

      const url = URL.createObjectURL(blob);

      setCapturedUrl(url);

      setStep("review");

      stopCamera();
    },
    "image/jpeg",
    0.95
  );
};

  const retake = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedBlob(null);
    setCapturedUrl(null);
    setAnnotations([]);
    setAnnotateMode(false);
    setStep("camera");
  };

  const handleAnnotateClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const note = window.prompt("Note for this marker (optional):") || "";
    setAnnotations((prev) => [...prev, { id: crypto.randomUUID(), x, y, note }]);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const save = async () => {
    if (!capturedBlob) return;
    setSaving(true);
    const photo: QueuedPhoto = {
      localId: crypto.randomUUID(),
      estimateId,
      projectName: projectName || null,
      stage,
      tag,
      caption,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      capturedAt: new Date().toISOString(),
      annotations,
      blob: capturedBlob,
    };

    try {
      // Always write to the local queue first — this is what protects the
      // photo if upload fails or the connection drops mid-save.
      await queueAdd(photo);
      await refreshPendingCount();

      if (navigator.onLine) {
        try {
          await uploadQueuedPhoto(photo);
          await queueRemove(photo.localId);
          await refreshPendingCount();
          toast.success("Photo uploaded.");
          onUploaded?.();
        } catch (err) {
          console.error(err);
          toast("Saved — will upload when the connection improves.", { icon: "📶" });
        }
      } else {
        toast("You're offline — photo saved and will upload automatically.", { icon: "📴" });
      }
      handleClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save photo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className={`inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors ${className}`}
      >
        <Camera size={16} />
        Take Photo
        {pendingCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
            <CloudOff size={10} /> {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
          {/* ---- Camera step ---- */}
          {step === "camera" && (
            <>
              <div className="flex items-center justify-between px-4 py-3 text-white">
                <button onClick={handleClose} className="p-2">
                  <X size={22} />
                </button>
                <div className="text-[11px] flex items-center gap-1.5 text-white/70">
                  {locating ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Locating...
                    </>
                  ) : location ? (
                    <>
                      <MapPin size={12} /> Location captured
                    </>
                  ) : (
                    <>
                      <MapPin size={12} className="opacity-40" /> No location
                    </>
                  )}
                </div>
                <button
                  onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
                  className="p-2"
                >
                  <RotateCcw size={20} />
                </button>
              </div>

              <div className="flex-1 relative overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline muted {...{ "webkit-playsinline": "true" }} className="w-full h-full object-cover" />
              </div>

              <div className="py-6 flex items-center justify-center bg-black">
                <button
                  onClick={capturePhoto}
                  className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
                >
                  <span className="w-12 h-12 rounded-full bg-white" />
                </button>
              </div>
            </>
          )}

          {/* ---- Review / metadata step ---- */}
          {step === "review" && capturedUrl && (
            <div className="flex-1 flex flex-col bg-slate-950 text-white overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3">
                <button onClick={handleClose} className="p-2">
                  <X size={22} />
                </button>
                <span className="text-[12px] font-medium text-white/70">Review Photo</span>
                <button onClick={retake} className="p-2 text-[12px] text-white/70">
                  Retake
                </button>
              </div>

              <div
                className={`relative mx-4 rounded-xl overflow-hidden ${annotateMode ? "cursor-crosshair" : ""}`}
                onClick={handleAnnotateClick}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capturedUrl} alt="Captured" className="w-full max-h-[45vh] object-contain bg-black" />
                {annotations.map((a, i) => (
                  <div
                    key={a.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${a.x}%`, top: `${a.y}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAnnotation(a.id);
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white shadow">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 mt-2">
                <button
                  onClick={() => setAnnotateMode((v) => !v)}
                  className={`w-full text-[12px] py-2 rounded-lg font-medium transition-colors ${
                    annotateMode ? "bg-red-600 text-white" : "bg-white/10 text-white/80"
                  }`}
                >
                  {annotateMode ? "Tap the photo to drop a marker · tap button again to stop" : "Add markers / notes"}
                </button>
                {annotations.length > 0 && (
                  <p className="text-[10px] text-white/40 mt-1 text-center">
                    Tap a marker to remove it · {annotations.length} marker{annotations.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>

              <div className="px-4 py-4 space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1.5">Stage</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(STAGE_LABELS) as PhotoStage[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStage(s)}
                        className={`py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                          stage === s ? "bg-emerald-600 text-white" : "bg-white/10 text-white/70"
                        }`}
                      >
                        {STAGE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1.5 flex items-center gap-1">
                    <Tag size={11} /> Area
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AREA_TAGS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTag(t)}
                        className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                          tag === t ? "bg-indigo-600 text-white" : "bg-white/10 text-white/70"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1.5">Caption</div>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="What does this photo show?"
                    rows={2}
                    className="w-full bg-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <button
                  onClick={save}
                  disabled={saving}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Save Photo
                </button>

                {!navigator.onLine && (
                  <p className="text-[11px] text-amber-400 text-center flex items-center justify-center gap-1">
                    <CloudOff size={12} /> You're offline — this will save locally and upload automatically.
                  </p>
                )}
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PhotoQueueStatus — optional small badge you can drop anywhere (e.g. your
// app header/nav) to show + retry pending offline uploads globally.
// ---------------------------------------------------------------------------

export function PhotoQueueStatus({ className = "" }: { className?: string }) {
  const [pending, setPending] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await getQueueCount());
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refresh();
    const interval = setInterval(refresh, 5000);
    const goOnline = async () => {
      setIsOnline(true);
      setSyncing(true);
      await syncPhotoQueue();
      await refresh();
      setSyncing(false);
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refresh]);

  const retryNow = async () => {
    setSyncing(true);
    await syncPhotoQueue();
    await refresh();
    setSyncing(false);
  };

  if (pending === 0) return null;

  return (
    <button
      onClick={retryNow}
      disabled={syncing}
      className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full transition-colors ${
        isOnline ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-slate-200 text-slate-600"
      } ${className}`}
    >
      {syncing ? <RefreshCw size={11} className="animate-spin" /> : <CloudOff size={11} />}
      {pending} photo{pending === 1 ? "" : "s"} pending upload{isOnline ? " · tap to retry" : ""}
    </button>
  );
}