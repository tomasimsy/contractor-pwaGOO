'use client';

import React, { useEffect, useState } from 'react';
import { Document } from './types';
import { DocumentCard } from './DocumentCard';
import { supabase } from '@/lib/supabase/client';
import { getCompanyId } from '@/lib/supabase/getCompanyId';
import toast from 'react-hot-toast';

export function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast.error('Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  if (loading) return <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>;
  if (documents.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">No documents uploaded yet. Use the form above.</div>;
  }
  return <div className="space-y-2">{documents.map((doc) => <DocumentCard key={doc.id} doc={doc} onDelete={fetchDocuments} />)}</div>;
}