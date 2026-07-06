"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { Upload, X, Loader2, Trash2, Images, ZoomIn } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EstimateImageStage = "before" | "during" | "after";

export type EstimateImage = {
  id: string;
  estimate_id: string;
  project_name: string | null;
  stage: EstimateImageStage;
  storage_path: string | null;
  url: string;
  file_name: string;
  caption: string | null;
  tag: string | null;
  latitude: number | null;
  longitude: number | null;
  captured_at: string | null;
  created_at: string;
};

const BUCKET = "estimate-images";

// ---------------------------------------------------------------------------
// Shared fetch — used by both the uploader and the gallery
// ---------------------------------------------------------------------------

async function fetchEstimateImages(estimateId: string): Promise<EstimateImage[]> {
  const { data, error } = await supabase
    .from("estimate_images")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load estimate images:", error);
    return [];
  }
  return data || [];
}

// ---------------------------------------------------------------------------
// EstimateImageUploader — editable, use on the create/edit estimate page
// ---------------------------------------------------------------------------

export function EstimateImageUploader({
  estimateId,
  projectName,
  className = "",
}: {
  estimateId: string;
  projectName?: string;
  className?: string;
}) {
  const [images, setImages] = useState<EstimateImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingStage, setUploadingStage] = useState<EstimateImageStage | null>(null);
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const duringInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!estimateId) return;
    fetchEstimateImages(estimateId).then((imgs) => {
      setImages(imgs);
      setLoading(false);
    });
  }, [estimateId]);

  const beforeImages = images.filter((img) => img.stage === "before");
  const duringImages = images.filter((img) => img.stage === "during");
  const afterImages = images.filter((img) => img.stage === "after");

  const handleUpload = useCallback(
    async (files: FileList | null, stage: EstimateImageStage) => {
      if (!files || files.length === 0) return;
      setUploadingStage(stage);
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) {
            toast.error(`${file.name} isn't an image — skipped.`);
            continue;
          }
          const ext = file.name.split(".").pop() || "jpg";
          const fileName = `${stage}-${crypto.randomUUID()}.${ext}`;
          const path = `${estimateId}/${stage}/${fileName}`;

          const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: "3600",
            upsert: true,
          });
          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

          const { data: inserted, error: insertError } = await supabase
            .from("estimate_images")
            .insert({
              estimate_id: estimateId,
              project_name: projectName || null,
              stage,
              storage_path: path,
              url: publicUrlData.publicUrl,
              image_url: publicUrlData.publicUrl,
              file_name: fileName,
            })
            .select()
            .single();
          if (insertError) throw insertError;

          setImages((prev) => [...prev, inserted as EstimateImage]);
        }
        toast.success(`Photo${files.length > 1 ? "s" : ""} uploaded.`);
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Failed to upload image.");
      } finally {
        setUploadingStage(null);
      }
    },
    [estimateId, projectName]
  );

  const handleDelete = useCallback(async (image: EstimateImage) => {
    const confirmed = window.confirm("Remove this photo?");
    if (!confirmed) return;
    try {
      if (image.storage_path) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([image.storage_path]);
        if (storageError) throw storageError;
      }
      const { error: dbError } = await supabase.from("estimate_images").delete().eq("id", image.id);
      if (dbError) throw dbError;
      setImages((prev) => prev.filter((img) => img.id !== image.id));
      toast.success("Photo removed.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to remove photo.");
    }
  }, []);

  const renderColumn = (
    stage: EstimateImageStage,
    label: string,
    list: EstimateImage[],
    inputRef: React.RefObject<HTMLInputElement>
  ) => (
    <div className="flex-1 min-w-[180px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}</span>
        <span className="text-[10px] text-slate-400">
          {list.length} photo{list.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {list.map((img) => (
          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={label} className="w-full h-full object-cover" />
            {/* Remove button — always visible with a semi‑transparent background */}
            <button
              onClick={() => handleDelete(img)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 transition-colors hover:bg-red-600"
              title="Remove photo"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploadingStage === stage}
          className="aspect-square rounded-lg border-2 border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/40 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
        >
          {uploadingStage === stage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span className="text-[9px] font-medium">Add</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleUpload(e.target.files, stage);
          e.target.value = "";
        }}
      />
    </div>
  );

  return (
    <div className={`bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Images size={16} className="text-emerald-600" />
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Project Photos</h3>
      </div>

      {loading ? (
        <div className="text-[11px] text-slate-400 py-4 text-center">Loading photos...</div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4">
          {/* {renderColumn("before", "Before", beforeImages, beforeInputRef)}
          {renderColumn("during", "During", duringImages, duringInputRef)}
          {renderColumn("after", "After", afterImages, afterInputRef)} */}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EstimateImageGallery — read-only, use on invoice / public / private estimate pages
// ---------------------------------------------------------------------------

export function EstimateImageGallery({
  estimateId,
  refreshKey,
  className = "",
}: {
  estimateId: string;
  refreshKey?: number;
  className?: string;
}) {
  const [images, setImages] = useState<EstimateImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<EstimateImage | null>(null);

  useEffect(() => {
    if (!estimateId) return;
    setLoading(true);
    fetchEstimateImages(estimateId).then((imgs) => {
      setImages(imgs);
      setLoading(false);
    });
  }, [estimateId, refreshKey]);

  // Nothing to show — render nothing at all, rather than an empty card
  if (loading || images.length === 0) return null;

  const beforeImages = images.filter((img) => img.stage === "before");
  const duringImages = images.filter((img) => img.stage === "during");
  const afterImages = images.filter((img) => img.stage === "after");

  const renderGrid = (label: string, list: EstimateImage[]) => {
    if (list.length === 0) return null;
    return (
      <div className="flex-1 min-w-[160px]">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{label}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {list.map((img) => (
            <button
              key={img.id}
              onClick={() => setLightbox(img)}
              className="relative aspect-square rounded-md overflow-hidden border border-slate-200 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                <ZoomIn size={14} className="text-white opacity-0 group-hover:opacity-100" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Images size={14} className="text-emerald-600" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Project Photos</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          {renderGrid("Before", beforeImages)}
          {renderGrid("During", duringImages)}
          {renderGrid("After", afterImages)}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white">
            <X size={22} />
          </button>
          <div className="max-w-full max-h-full flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.url} alt={lightbox.stage} className="max-w-full max-h-[80vh] rounded-lg object-contain" />
            {lightbox.caption && <p className="text-white/80 text-sm text-center max-w-md">{lightbox.caption}</p>}
          </div>
        </div>
      )}
    </>
  );
}