# Roofing Estimates Implementation - contractor-app-v2

## ✅ Completed: Service Layer Infrastructure

### Database Migrations
- **File**: `supabase/migrations/20260802000100_roofing_estimate_support.sql`
- **Tables Created**:
  - `estimate_areas` — roof sections with name, scope, sequence, total
  - `estimate_area_photos` — before/after photos per area
  - `estimates.estimate_type` column — discriminator (standard | roofing)
- **RLS**: Full row-level security on new tables (company_id filtering)
- **Shared Supabase**: Uses the same backend project as contractor-pwa v1

### Service Layer (Clean, Service-Oriented Architecture)
- **Interface**: `lib/services/roofingAreaService.ts`
  - Defines `RoofingArea`, `RoofingPhoto`, `RoofingAreaService` interface
  - Methods: `listForEstimate`, `getById`, `create`, `update`, `softDelete`, `restore`
  - Photo methods: `getPhotosForArea`, `createPhoto`, `deletePhoto`
  - No calculation logic — service only manages data persistence

- **Implementation**: `lib/services/supabase/roofingAreaService.ts`
  - Factory function: `createRoofingAreaService(supabase)`
  - Maps database rows to typed service models
  - Handles soft-delete via RLS + deleted_at filtering
  - Photo grouping by type (before/after)

### Service Wiring
- **Exported** from `lib/services/index.ts` as Layer 2 service
- **Added to** `lib/services-context.tsx` Services interface
- **Instantiated in** `components/providers/ServicesProvider.tsx`
  - Singleton Supabase client initialization
  - Available to all components via `useServices().roofingAreaService`

### UI Components
- **`components/estimates/RoofingAreasEditor.tsx`**
  - Add/remove roof areas
  - Edit area name, scope text, total
  - Persists via service callbacks (onSave, onDelete)
  - Placeholder for photo uploads
  - Responsive, accessible form UX

## 📋 Remaining: UI Integration

### 1. Update EstimateService Types
- Add `estimateType?: 'standard' | 'roofing'` to `Estimate` interface (lib/services/estimateService.ts)
- Update EstimateLineItem creation to accept roofing metadata
- Optional: add `roofingAreas?: RoofingArea[]` for convenience loading

### 2. Update EstimateForm Component
- Add estimate type selector (radio: Standard vs. Roofing)
- Conditional rendering:
  - Show `<RoofingAreasEditor>` when estimate_type === 'roofing'
  - Show `<LineItemEditor>` when estimate_type === 'standard'
- Pass `roofingAreaService` to the roofing editor
- Update form submission to handle both types:
  - Standard: create/update line items
  - Roofing: create/update roof areas (empty line items, use area totals for revenue)

### 3. Photo Upload Support (Phase 2)
- Create `app/api/estimate-photos/upload` route
  - Accept multipart form data (file + areaId + photoType)
  - Compress image (client-side initial, server validation)
  - Upload to Supabase storage at `estimate-photos/{estimateId}/{areaId}/{photoType}/{filename}`
  - Call `roofingAreaService.createPhoto()` to record DB entry
  - Return `{ id, storagePath }`

- Update `RoofingAreasEditor.tsx` to accept photo upload UI
  - File input per area (before/after tabs)
  - Upload state management (loading, error)
  - Photo preview gallery per area

### 4. PDF Generation
- Update `app/api/estimates/[id]/pdf` route to detect estimate_type
- When roofing:
  - Fetch estimate_areas with photos via service
  - Render per-area section: name, before photos, scope, area total, after photos
  - Group by sequence_number for proper order
  - Include financial summary (all area totals = estimate.total)

### 5. Estimate View/Detail Page
- Show "Roofing Estimate" in breadcrumb/title when applicable
- Display roof areas list (read-only or edit mode)
- Show before photos in summary view
- Add "Download PDF" button (reuses existing PDF route, detects type automatically)

### 6. Photo Gallery & Lifecycle
- Soft-delete photos (RLS + deleted_at filtering)
- Get signed URLs from Supabase storage for display
- Photo management: reorder, delete, upload additional after photos
- Consider: lazy-load photos to avoid N+1 on list views

## 🎯 Architecture Notes

### Why This Approach
1. **Single Supabase Project**: Shared backend with v1 (contractor-pwa) — reuses existing infrastructure
2. **Service-Only Pattern**: All roofing logic goes through `RoofingAreaService`
   - No direct Supabase calls in components
   - Services injected via `useServices()` (already established pattern)
   - Testable with in-memory doubles
3. **Estimate Type Discriminator**: Simple enum on estimates table
   - No separate roofing_estimates table (overengineering)
   - Reuse invoice/change-order/expense links (all reference estimate.id)
4. **Soft-Delete Discipline**: Matches v2 patterns (deleted_at + RLS filtering)
5. **No Financial Calculations**: Service doesn't compute area totals — UI/form logic handles that
   - Matches v2's financialCalculations.ts — centralized, testable
   - Roofing: treat each area total as a separate line item for profit calculations

### Integration Points
- **Forms**: `useServices().roofingAreaService` available in any form via ServicesProvider
- **API**: POST `/api/estimate-photos/upload` for photo storage
- **Database**: estimate_areas + estimate_area_photos on shared Supabase
- **PDF**: Existing route already handles by calling service for photo data

## 📦 Files Summary
```
✅ supabase/migrations/20260802000100_roofing_estimate_support.sql
✅ lib/services/roofingAreaService.ts
✅ lib/services/supabase/roofingAreaService.ts
✅ lib/services/index.ts (exports added)
✅ lib/services-context.tsx (imports + interface + wiring)
✅ components/providers/ServicesProvider.tsx (instantiation)
✅ components/estimates/RoofingAreasEditor.tsx

⏳ To do:
   - lib/services/estimateService.ts (add estimate_type field)
   - components/estimates/EstimateForm.tsx (type selector + conditional UI)
   - app/api/estimate-photos/upload (photo storage)
   - app/(app)/estimates/[id]/pdf (roofing PDF rendering)
   - Photo UI enhancements (gallery, upload, reorder)
```

## 🧪 Testing Checklist
- [ ] Migration runs successfully
- [ ] RoofingAreaService crud operations
- [ ] Service wiring in ServicesProvider
- [ ] RoofingAreasEditor component renders
- [ ] Create estimate with roofing type
- [ ] Add/edit/delete areas
- [ ] Photo upload (post-Phase 2)
- [ ] PDF generation for roofing estimate
- [ ] Profit calculations include area totals
- [ ] Standard estimate still works (regression)
