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
  Upload, // new icon for gallery upload
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (unchanged)
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
// IndexedDB queue — unchanged
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
// EstimateCamera — updated with "Add Images" and file upload option
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
  const [step, setStep] = useState<"select" | "camera" | "review">("select");
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setStep("select");
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

  // ---- File upload handler ----
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be selected again
    e.target.value = "";
    const blob = file;
    setCapturedBlob(blob);
    setCapturedUrl(URL.createObjectURL(blob));
    setStep("review");
  };

  // ---- Camera capture ----
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
        setStep("review");
        stopCamera();
      },
      "image/jpeg",
      0.9
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
        Add Images
        {pendingCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
            <CloudOff size={10} /> {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
          {/* ---- Select step: choose upload or camera ---- */}
          {step === "select" && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-950 text-white">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white"
              >
                <X size={22} />
              </button>
              <h2 className="text-xl font-semibold mb-6">Add Photo</h2>
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 rounded-xl text-lg font-medium transition-colors"
                >
                  <Upload size={20} />
                  Upload from Gallery
                </button>
                <button
                  onClick={() => setStep("camera")}
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-lg font-medium transition-colors"
                >
                  <Camera size={20} />
                  Take Photo
                </button>
              </div>
              <p className="mt-6 text-sm text-white/50 flex items-center gap-1">
                {locating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Locating...
                  </>
                ) : location ? (
                  <>
                    <MapPin size={14} /> Location captured
                  </>
                ) : (
                  <>
                    <MapPin size={14} className="opacity-40" /> No location
                  </>
                )}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}

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
// PhotoQueueStatus — unchanged
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