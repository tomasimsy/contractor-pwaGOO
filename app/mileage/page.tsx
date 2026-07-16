'use client';

import { MileageTracker } from '@/components/mileage';
import DesktopShell from '@/components/layout/DesktopShell';

async function uploadImage(file: File): Promise<string> {
  console.log('📸 GPS-only: no upload, returning placeholder');
  return 'https://via.placeholder.com/300?text=No+Image'; // or a data URI
}

export default function MileagePage() {
  return (
    <DesktopShell title="Mileage">
      <MileageTracker uploadImage={uploadImage} />
    </DesktopShell>
  );
}