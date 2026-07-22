"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import EstimateForm from "@/components/estimates/EstimateForm";

export default function CreateEstimatePage() {
  return (
    <ProtectedRoute>
      <EstimateForm mode="create" />
    </ProtectedRoute>
  );
}
