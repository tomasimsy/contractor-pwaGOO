'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import type { FormRoofingArea } from '@/lib/queries/estimates';
import { uploadRoofingPhoto, deleteRoofingPhoto } from '@/app/actions/estimate-images';
import { compressImage } from '@/components/mileage/imageCompression';

export function RoofingAreasSection({
  estimateId,
  areas,
  onChange,
}: {
  estimateId: string;
  areas: FormRoofingArea[];
  onChange: (areas: FormRoofingArea[]) => void;
}) {
  const [uploadingPhotoIds, setUploadingPhotoIds] = useState<Set<string>>(new Set());
  const [photoPreviewMap, setPhotoPreviewMap] = useState<Map<string, string[]>>(new Map());

  const handleAddArea = useCallback(() => {
    const newArea: FormRoofingArea = {
      id: crypto.randomUUID(),
      area_name: '',
      scope_items: '',
      area_total: 0,
    };
    onChange([...areas, newArea]);
  }, [areas, onChange]);

  const handleUpdateArea = useCallback(
    (id: string, field: keyof FormRoofingArea, value: any) => {
      onChange(
        areas.map((area) =>
          area.id === id ? { ...area, [field]: value } : area
        )
      );
    },
    [areas, onChange]
  );

  const handleDeleteArea = useCallback(
    (id: string) => {
      onChange(areas.filter((area) => area.id !== id));
    },
    [areas, onChange]
  );

  const handleUploadPhoto = useCallback(
    async (areaId: string, photoType: 'before' | 'after', file: File) => {
      const photoId = `${areaId}-${photoType}`;
      setUploadingPhotoIds((prev) => new Set(prev).add(photoId));

      try {
        // Compress the image first
        const compressed = await compressImage(file);
        const result = await uploadRoofingPhoto(
          estimateId,
          areaId,
          compressed,
          compressed.name,
          photoType
        );

        const previewUrl = result.url;
        setPhotoPreviewMap((prev) => {
          const key = `${areaId}-${photoType}`;
          const existing = prev.get(key) || [];
          return new Map(prev).set(key, [...existing, previewUrl]);
        });
      } catch (error) {
        console.error('Photo upload failed:', error);
        alert(`Failed to upload photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setUploadingPhotoIds((prev) => {
          const updated = new Set(prev);
          updated.delete(photoId);
          return updated;
        });
      }
    },
    [estimateId]
  );

  const handleDeletePhoto = useCallback(async (photoId: string) => {
    try {
      await deleteRoofingPhoto(photoId);
      // TODO: Remove from local state/preview
    } catch (error) {
      console.error('Photo deletion failed:', error);
      alert(`Failed to delete photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Roof Areas</h3>
        <button
          type="button"
          onClick={handleAddArea}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Add Area
        </button>
      </div>

      {areas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No roof areas added yet. Click "Add Area" to get started.</p>
      ) : (
        <div className="space-y-4">
          {areas.map((area, index) => (
            <div
              key={area.id}
              className="rounded-lg border border-input bg-card p-4 space-y-4"
            >
              {/* Area Header */}
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium">Area {index + 1}</h4>
                <button
                  type="button"
                  onClick={() => handleDeleteArea(area.id)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  aria-label="Delete area"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {/* Area Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Area Name *</label>
                  <input
                    type="text"
                    value={area.area_name}
                    onChange={(e) => handleUpdateArea(area.id, 'area_name', e.target.value)}
                    placeholder="Front Slope, Back Roof, etc."
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Area Total</label>
                  <input
                    type="number"
                    value={area.area_total || ''}
                    onChange={(e) => handleUpdateArea(area.id, 'area_total', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
                  />
                </div>
              </div>

              {/* Scope Items */}
              <div>
                <label className="text-sm font-medium">Scope / Items</label>
                <textarea
                  value={area.scope_items || ''}
                  onChange={(e) => handleUpdateArea(area.id, 'scope_items', e.target.value)}
                  placeholder="Tear off, new shingles, new gutters..."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
                />
              </div>

              {/* Photos Section */}
              <PhotosSubsection
                areaId={area.id}
                beforePhotos={photoPreviewMap.get(`${area.id}-before`) || []}
                afterPhotos={photoPreviewMap.get(`${area.id}-after`) || []}
                onUploadPhoto={handleUploadPhoto}
                uploadingPhotoIds={uploadingPhotoIds}
                isAreaSaved
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PhotosSubsection({
  areaId,
  beforePhotos,
  afterPhotos,
  onUploadPhoto,
  uploadingPhotoIds,
  isAreaSaved,
}: {
  areaId: string;
  beforePhotos: string[];
  afterPhotos: string[];
  onUploadPhoto: (areaId: string, type: 'before' | 'after', file: File) => void;
  uploadingPhotoIds: Set<string>;
  isAreaSaved: boolean;
}) {
  const handleFileSelect = async (type: 'before' | 'after', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isAreaSaved) {
      onUploadPhoto(areaId, type, file);
    }
    event.target.value = '';
  };

  return (
    <div className="space-y-3 border-t border-input pt-4">
      {/* Before Photos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Before Photos</label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-primary hover:text-primary/90">
            <Upload className="size-3" />
            Upload
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect('before', e)}
              disabled={!isAreaSaved || uploadingPhotoIds.has(`${areaId}-before`)}
              className="hidden"
            />
          </label>
        </div>
        {beforePhotos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {beforePhotos.map((url, idx) => (
              <div key={idx} className="relative aspect-square rounded-lg bg-muted overflow-hidden">
                <img src={url} alt="Before" className="size-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isAreaSaved ? 'No before photos yet' : 'Save area first to upload photos'}
          </p>
        )}
      </div>

      {/* After Photos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">After Photos</label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-primary hover:text-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
            <Upload className="size-3" />
            Upload
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect('after', e)}
              disabled={!isAreaSaved || uploadingPhotoIds.has(`${areaId}-after`)}
              className="hidden"
            />
          </label>
        </div>
        {afterPhotos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {afterPhotos.map((url, idx) => (
              <div key={idx} className="relative aspect-square rounded-lg bg-muted overflow-hidden">
                <img src={url} alt="After" className="size-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isAreaSaved ? 'No after photos yet' : 'Save area first to upload photos'}
          </p>
        )}
      </div>
    </div>
  );
}
