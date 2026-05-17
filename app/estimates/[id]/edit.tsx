"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CreateEstimateScreen from "@/components/CreateEstimateScreen";

export default function EditEstimatePage() {
  const { id } = useParams();
  const [estimateData, setEstimateData] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("estimates")
        .select("*, estimate_items(*)")
        .eq("id", id)
        .single();

      setEstimateData(data);
    };

    load();
  }, [id]);

  if (!estimateData) return <div>Loading…</div>;

  return <CreateEstimateScreen existingEstimate={estimateData} />;
}
