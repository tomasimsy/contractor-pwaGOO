'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';

interface DocumentUploadProps {
  onUploaded: () => void;
}

export function DocumentUpload({ onUploaded }: DocumentUploadProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('insurance');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) {
      toast.error('Please select a file and enter a title.');
      return;
    }
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);
      const fileUrl = urlData.publicUrl;

      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          category,
          file_name: file.name,
          file_url: fileUrl,
          file_size: file.size,
        });
      if (insertError) throw insertError;

      toast.success('Document uploaded.');
      setTitle('');
      setDescription('');
      setCategory('insurance');
      setFile(null);
      const input = document.getElementById('file-upload') as HTMLInputElement;
      if (input) input.value = '';
      onUploaded();
    } catch (error: any) {
      toast.error(error.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Upload Document</h3>
      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g., General Liability Insurance)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="insurance">Insurance</option>
          <option value="irs">IRS / Tax</option>
          <option value="policy">Company Policy</option>
          <option value="other">Other</option>
        </select>
        <input
          id="file-upload"
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.png"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          required
        />
        {file && <p className="text-xs text-gray-500">Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
        <button
          type="submit"
          disabled={isUploading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          {isUploading ? 'Uploading...' : <><Upload size={18} /> Upload</>}
        </button>
      </div>
    </form>
  );
}