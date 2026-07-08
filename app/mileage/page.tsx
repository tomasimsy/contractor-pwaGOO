'use client';

import { MileageTracker } from '@/components/mileage';

async function uploadImage(file: File): Promise<string> {
  console.log('📸 GPS-only: no upload, returning placeholder');
  return 'https://via.placeholder.com/300?text=No+Image'; // or a data URI
}

export default function MileagePage() {
  return <MileageTracker uploadImage={uploadImage} />;
}