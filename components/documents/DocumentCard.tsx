"use client";

import React from "react";
import { Document } from "./types";
import {
  FileText,
  Download,
  Trash2,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import toast from "react-hot-toast";
import { formatDate } from "@/components/mileage/utils";

interface DocumentCardProps {
  doc: Document;
  onDelete: () => void;
}

export function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  const handleDelete = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();

    if (!confirm(`Delete "${doc.title}"?`)) return;

    try {
      const filePath = doc.file_url.split("/").pop();

      if (filePath) {
        await supabase.storage.from("documents").remove([filePath]);
      }

      const companyId = await getCompanyId();
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id)
        .eq("company_id", companyId);

      if (error) throw error;

      toast.success("Document deleted.");
      onDelete();
    } catch (error: any) {
      toast.error(error.message || "Delete failed.");
    }
  };

  const openDocument = () => {
    window.open(doc.file_url, "_blank", "noopener,noreferrer");
  };

  const downloadDocument = (
    e: React.MouseEvent<HTMLAnchorElement>
  ) => {
    e.stopPropagation();
  };

  const categoryColors: Record<string, string> = {
    insurance: "bg-blue-100 text-blue-800",
    irs: "bg-purple-100 text-purple-800",
    policy: "bg-green-100 text-green-800",
    other: "bg-gray-100 text-gray-800",
  };

  return (
    <div
      onClick={openDocument}
      className="group bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
          <FileText size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">
              {doc.title}
            </h3>

            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                categoryColors[doc.category] ||
                "bg-gray-100 text-gray-800"
              }`}
            >
              {doc.category}
            </span>
          </div>

          {doc.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {doc.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar size={13} />
              {formatDate(doc.uploaded_at)}
            </span>

            <span className="truncate">{doc.file_name}</span>

            <span>
              {doc.file_size
                ? `${(doc.file_size / 1024).toFixed(1)} KB`
                : "Unknown size"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Open */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDocument();
            }}
            className="p-2 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition"
            title="Open"
          >
            <ExternalLink size={17} />
          </button>

          {/* Download */}
          <a
            href={doc.file_url}
            download={doc.file_name}
            target="_blank"
            rel="noopener noreferrer"
            onClick={downloadDocument}
            className="p-2 rounded-lg text-gray-500 hover:bg-green-50 hover:text-green-600 transition"
            title="Download"
          >
            <Download size={17} />
          </a>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
            title="Delete"
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink size={13} />
        Click anywhere to open
      </div>
    </div>
  );
}