"use client";

/**
 * UI for editing roof areas within a roofing estimate.
 * Allows adding/removing areas, editing scope and totals,
 * and managing before/after photos.
 *
 * Integrates with RoofingAreaService via useServices().
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { useServices } from "@/components/providers/ServicesProvider";
import type { RoofingArea, RoofingPhoto } from "@/lib/services";
import type { UUID } from "@/lib/services/types";

export interface RoofingAreaEditorProps {
  estimateId: UUID;
  areas: RoofingArea[];
  onChange: (areas: RoofingArea[]) => void;
  onSave: (area: { id?: UUID; estimateId: UUID; companyId: UUID; areaName: string; sequenceNumber: number; scopeItems: string | null; areaTotal: number }) => Promise<void>;
  onDelete: (areaId: UUID) => Promise<void>;
}

export function RoofingAreasEditor({ estimateId, areas, onChange, onSave, onDelete }: RoofingAreaEditorProps) {
  const { roofingAreaService } = useServices();
  const [savingAreaIds, setSavingAreaIds] = useState<Set<UUID>>(new Set());
  const [deletingAreaIds, setDeletingAreaIds] = useState<Set<UUID>>(new Set());
  const [savedAreaIds, setSavedAreaIds] = useState<Set<UUID>>(new Set());
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [areaPhotos, setAreaPhotos] = useState<{ [areaId: string]: { before: RoofingPhoto[]; after: RoofingPhoto[] } }>({});
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Load photos for all areas when they change
  useEffect(() => {
    const loadPhotos = async () => {
      const photos: { [areaId: string]: { before: RoofingPhoto[]; after: RoofingPhoto[] } } = {};

      for (const area of areas) {
        try {
          const areaPhotosData = await roofingAreaService.getPhotosForArea(area.id);
          photos[area.id] = areaPhotosData;
        } catch (err) {
          console.error(`Failed to load photos for area ${area.id}:`, err);
          photos[area.id] = { before: [], after: [] };
        }
      }

      setAreaPhotos(photos);
    };

    if (areas.length > 0) {
      loadPhotos();
    }
  }, [areas, roofingAreaService]);

  const handlePhotoUpload = useCallback(
    async (areaId: UUID, photoType: "before" | "after", file: File) => {
      // Validate that the area has been saved (has a company_id)
      const area = areas.find((a) => a.id === areaId);
      if (!area?.companyId) {
        alert("Please save the roof area first before uploading photos.");
        return;
      }

      console.log("Starting photo upload:", { areaId, photoType, fileName: file.name });
      const uploadKey = `${areaId}-${photoType}`;
      setUploading((prev) => ({ ...prev, [uploadKey]: true }));
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("estimateId", estimateId);
        formData.append("areaId", areaId);
        formData.append("photoType", photoType);

        console.log("Uploading to /api/estimate-photos/upload");
        const res = await fetch("/api/estimate-photos/upload", {
          method: "POST",
          body: formData,
        });

        console.log("Upload response:", res.status);

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to upload photo");
        }

        console.log("Photo uploaded successfully, loading photos for area");

        // Photo was successfully uploaded and saved to database
        // Reload photos for this area
        try {
          const updatedPhotos = await roofingAreaService.getPhotosForArea(areaId);
          console.log("Photos loaded:", updatedPhotos);
          setAreaPhotos((prev) => ({
            ...prev,
            [areaId]: updatedPhotos,
          }));
        } catch (err) {
          console.error("Failed to reload photos:", err);
        }
      } catch (error) {
        console.error("Photo upload error:", error);
        alert(`Failed to upload photo: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        setUploading((prev) => ({ ...prev, [uploadKey]: false }));
      }
    },
    [estimateId, roofingAreaService]
  );

  const handleDeletePhoto = useCallback(
    async (areaId: UUID, photoId: UUID) => {
      if (!confirm("Delete this photo?")) return;
      try {
        await roofingAreaService.deletePhoto(photoId, "Deleted by user");
        setAreaPhotos((prev) => ({
          ...prev,
          [areaId]: {
            before: prev[areaId].before.filter((p) => p.id !== photoId),
            after: prev[areaId].after.filter((p) => p.id !== photoId),
          },
        }));
      } catch (error) {
        console.error("Failed to delete photo:", error);
        alert("Failed to delete photo. Please try again.");
      }
    },
    [roofingAreaService]
  );

  const handleAddArea = useCallback(() => {
    const newArea: Partial<RoofingArea> = {
      id: crypto.randomUUID() as UUID,
      estimateId,
      areaName: `Area ${areas.length + 1}`,
      sequenceNumber: areas.length,
      scopeItems: "",
      areaTotal: 0,
      companyId: "" as UUID, // Will be set by service
    };
    onChange([...areas, newArea as RoofingArea]);
  }, [areas, estimateId, onChange]);

  const handleUpdateArea = useCallback(
    (id: UUID, updates: Partial<RoofingArea>) => {
      onChange(
        areas.map((a) =>
          a.id === id ? { ...a, ...updates } : a
        )
      );
    },
    [areas, onChange]
  );

  const handleSaveArea = useCallback(
    async (area: RoofingArea) => {
      console.log("handleSaveArea called with area:", area.id, area.areaName);
      if (!area.areaName.trim()) {
        alert("Area name is required.");
        return;
      }
      setSavingAreaIds((prev) => new Set([...prev, area.id]));
      try {
        console.log("Saving area:", area.id);
        await onSave({
          id: area.id,
          estimateId: area.estimateId,
          companyId: area.companyId,
          areaName: area.areaName,
          sequenceNumber: area.sequenceNumber,
          scopeItems: area.scopeItems,
          areaTotal: area.areaTotal,
        });
        console.log("Area saved successfully:", area.id);
        setSavedAreaIds((prev) => new Set([...prev, area.id]));
        setTimeout(() => {
          setSavedAreaIds((prev) => {
            const next = new Set(prev);
            next.delete(area.id);
            return next;
          });
        }, 2000);
      } catch (error) {
        console.error("Failed to save area:", area.id, error instanceof Error ? error.message : JSON.stringify(error));
        alert("Failed to save roof area. Please try again.");
      } finally {
        setSavingAreaIds((prev) => {
          const next = new Set(prev);
          next.delete(area.id);
          return next;
        });
      }
    },
    [onSave]
  );

  const handleDeleteArea = useCallback(
    async (areaId: UUID) => {
      if (!confirm("Delete this roof area?")) return;
      setDeletingAreaIds((prev) => new Set([...prev, areaId]));
      try {
        await onDelete(areaId);
        onChange(areas.filter((a) => a.id !== areaId));
      } catch (error) {
        console.error("Failed to delete area:", areaId, error);
        alert("Failed to delete roof area. Please try again.");
      } finally {
        setDeletingAreaIds((prev) => {
          const next = new Set(prev);
          next.delete(areaId);
          return next;
        });
      }
    },
    [areas, onChange, onDelete]
  );

  if (areas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-600 mb-3">No roof areas yet</p>
        <button
          type="button"
          onClick={handleAddArea}
          disabled={savingAreaIds.size > 0 || deletingAreaIds.size > 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="size-4" /> Add First Area
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {areas.map((area, idx) => (
        <div
          key={area.id}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="font-medium text-gray-900">
              Area {idx + 1}: {area.areaName}
            </h3>
            <button
              type="button"
              onClick={() => handleDeleteArea(area.id)}
              disabled={deletingAreaIds.has(area.id) || savingAreaIds.has(area.id)}
              className="text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Area Name
              </label>
              <input
                type="text"
                value={area.areaName}
                onChange={(e) =>
                  handleUpdateArea(area.id, { areaName: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="e.g., Front Slope, Back Roof"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Scope / Work Description
              </label>
              <textarea
                value={area.scopeItems || ""}
                onChange={(e) =>
                  handleUpdateArea(area.id, { scopeItems: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Tear off, new shingles, gutters, etc."
                rows={2}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Area Total
              </label>
              <input
                type="number"
                value={area.areaTotal || ""}
                onChange={(e) =>
                  handleUpdateArea(area.id, {
                    areaTotal: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            <div className="space-y-2 rounded bg-gray-50 p-3">
              <div className="text-xs font-medium text-gray-700">Photos (Optional)</div>

              {(["before", "after"] as const).map((type) => (
                <div key={type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 capitalize">{type} Photos</span>
                    <input
                      ref={(el) => {
                        if (el) fileInputRefs.current[`${area.id}-${type}`] = el;
                      }}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handlePhotoUpload(area.id, type, file);
                          e.target.value = "";
                        }
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        fileInputRefs.current[`${area.id}-${type}`]?.click()
                      }
                      disabled={uploading[`${area.id}-${type}`] || !area.companyId}
                      title={!area.companyId ? "Save area first" : ""}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="size-3" />
                      Add {type === "before" ? "Before" : "After"}
                    </button>
                  </div>

                  {/* Display uploaded photos */}
                  {(areaPhotos[area.id]?.[type] || []).length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {(areaPhotos[area.id]?.[type] || []).map((photo) => (
                        <div key={photo.id} className="relative overflow-hidden rounded-lg border border-gray-200">
                          <img
                            src={`/api/estimate-photos/download?path=${encodeURIComponent(photo.storagePath)}`}
                            alt={`${type} photo`}
                            className="h-20 w-full object-cover"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(area.id, photo.id)}
                            className="absolute right-1 top-1 rounded-md bg-red-600 p-1 text-white hover:bg-red-700"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No {type} photos yet</p>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                console.log("Save Area clicked for area:", area.id, area.areaName);
                handleSaveArea(area);
              }}
              disabled={savingAreaIds.has(area.id)}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium text-white ${
                savedAreaIds.has(area.id)
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-blue-600 hover:bg-blue-700"
              } disabled:opacity-50`}
            >
              {savingAreaIds.has(area.id)
                ? "Saving..."
                : savedAreaIds.has(area.id)
                ? "✓ Saved"
                : "Save Area"}
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddArea}
        disabled={savingAreaIds.size > 0 || deletingAreaIds.size > 0}
        className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
      >
        <Plus className="inline size-4 mr-1" /> Add Another Area
      </button>
    </div>
  );
}
