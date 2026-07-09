'use client';

import React, { useState } from 'react';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentList } from '@/components/documents/DocumentList';

export default function DocumentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploaded = () => {
    setRefreshKey(prev => prev + 1); // forces DocumentList to re‑mount and refetch
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Company Documents</h1>
      <DocumentUpload onUploaded={handleUploaded} />
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">All Documents</h2>
        <DocumentList key={refreshKey} />
      </div>
    </div>
  );
}