"use client";

import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import EstimateForm from "@/components/estimates/EstimateForm";

export default function EditEstimatePage() {
  const { id } = useParams();

  return (
    <ProtectedRoute>
      <EstimateForm mode="edit" estimateId={id as string} />
    </ProtectedRoute>
  );
}
