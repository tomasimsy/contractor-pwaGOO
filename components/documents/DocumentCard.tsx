'use client';

import React from 'react';
import { Document } from './types';
import { FileText, Download, Trash2, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { formatDate } from '@/components/mileage/utils';

interface DocumentCardProps {
  doc: Document;
  onDelete: () => void;
}

export function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  const handleDelete = async () => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    try {
      const filePath = doc.file_url.split('/').pop();
      if (filePath) await supabase.storage.from('documents').remove([filePath]);
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;
      toast.success('Document deleted.');
      onDelete();
    } catch (error: any) {
      toast.error(error.message || 'Delete failed.');
    }
  };

  const categoryColors: Record<string, string> = {
    insurance: 'bg-blue-100 text-blue-800',
    irs: 'bg-purple-100 text-purple-800',
    policy: 'bg-green-100 text-green-800',
    other: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 hover:shadow-md transition">
      <div className="flex items-start gap-3">
        <FileText size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-800 truncate">{doc.title}</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${categoryColors[doc.category] || 'bg-gray-100 text-gray-800'}`}>
              {doc.category}
            </span>
          </div>
          {doc.description && <p className="text-xs text-gray-500 truncate">{doc.description}</p>}
          <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(doc.uploaded_at)}</span>
            <span>{doc.file_name}</span>
            <span>{(doc.file_size ? (doc.file_size / 1024).toFixed(1) : '?')} KB</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full transition">
            <Download size={16} />
          </a>
          {/* <button onClick={handleDelete} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition">
            <Trash2 size={16} />
          </button> */}
        </div>
      </div>
    </div>
  );
}