// lib/utils/estimateNumber.ts
import { supabase } from "@/lib/supabase/client";

export const generateEstimateNumber = async () => {
  const currentYear = new Date().getFullYear();
  
  const { data: estimates } = await supabase
    .from("estimates")
    .select("id")
    .order("created_at", { ascending: false });
  
  // Just use sequential number based on count
  const count = estimates?.length || 0;
  const nextNum = count + 1;
  const paddedNum = nextNum.toString().padStart(4, '0');
  
  return `EST${currentYear}${paddedNum}`;
};