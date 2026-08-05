"use client";

/**
 * UI for managing Before/After photos for an estimate (not per-area).
 * Separate from RoofingAreasEditor which handles per-area photos.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { EstimatePhoto } from "@/lib/services/estimatePhotoService";
import type { UUID } from "@/lib/services/types";

export interface EstimatePhotosEditorProps {
  estimateId: UUID;
  photos: {
    before: EstimatePhoto[];
    after: EstimatePhoto[];
  };
  onChange: (photos: { before: EstimatePhoto[]; after: EstimatePhoto[] }) => void;
  onDelete: (photoId: UUID) => Promise<void>;
  onPhotoUpload?: (photo: EstimatePhoto) => void;
}

export function EstimatePhotosEditor({ estimateId, photos, onChange, onDelete, onPhotoUpload }: EstimatePhotosEditorProps) {
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [photoUrls, setPhotoUrls] = useState<{ [photoId: string]: string }>({});
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Generate signed URLs for photos
  useEffect(() => {
    const loadPhotoUrls = async () => {
      const urls: { [photoId: string]: string } = {};
      const allPhotos = [...photos.before, ...photos.after];

      for (const photo of allPhotos) {
        if (!photoUrls[photo.id]) {
          // Use the storage path as direct URL for public bucket
          // In production, you'd generate a signed URL here
          urls[photo.id] = `/api/estimate-photos/download?path=${encodeURIComponent(photo.storagePath)}`;
        }
      }

      if (Object.keys(urls).length > 0) {
        setPhotoUrls((prev) => ({ ...prev, ...urls }));
      }
    };

    loadPhotoUrls();
  }, [photos]);

  const handlePhotoUpload = useCallback(
    async (photoType: "before" | "after", file: File) => {
      const uploadKey = `${photoType}`;
      setUploading((prev) => ({ ...prev, [uploadKey]: true }));
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("estimateId", estimateId);
        formData.append("photoType", photoType);

        const res = await fetch("/api/estimate-photos/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Failed to upload photo");
        }

        const data = await res.json();
        if (data.photo && onPhotoUpload) {
          onPhotoUpload(data.photo);
        }
        // Optionally show success message
        // alert(`${photoType.charAt(0).toUpperCase() + photoType.slice(1)} photo uploaded successfully!`);
      } catch (error) {
        console.error("Photo upload error:", error);
        alert("Failed to upload photo. Please try again.");
      } finally {
        setUploading((prev) => ({ ...prev, [uploadKey]: false }));
      }
    },
    [estimateId]
  );

  const handleDeletePhoto = useCallback(
    async (photoId: UUID) => {
      if (!confirm("Delete this photo?")) return;
      try {
        await onDelete(photoId);
      } catch (error) {
        console.error("Failed to delete photo:", error);
        alert("Failed to delete photo. Please try again.");
      }
    },
    [onDelete]
  );

  return (
    <div className="space-y-3">
      {["before", "after"].map((type) => (
        <div key={type} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold capitalize text-foreground">{type}</label>
            <button
              type="button"
              onClick={() => fileInputRefs.current[type]?.click()}
              disabled={uploading[type]}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              <Upload className="size-3.5" />
              Add {type} Photo
            </button>
            <input
              ref={(el) => {
                if (el) fileInputRefs.current[type] = el;
              }}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handlePhotoUpload(type as "before" | "after", file);
                  e.target.value = "";
                }
              }}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {photos[type as "before" | "after"].map((photo) => (
              <div key={photo.id} className="relative overflow-hidden rounded-lg border border-border">
                <img
                  src={photoUrls[photo.id] || photo.storagePath}
                  alt={`${type} photo`}
                  className="h-24 w-full object-cover"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(photo.id)}
                  className="absolute right-1 top-1 rounded-md bg-red-600 p-1 text-white hover:bg-red-700"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>

          {photos[type as "before" | "after"].length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
              <p className="text-xs text-gray-600">No {type} photos yet</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
