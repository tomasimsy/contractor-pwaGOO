import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';

// Simple counter (resets when server restarts - fine for now)
let counter = 0;

export const generateDocumentNumber = async () => {
  const year = new Date().getFullYear();
  counter++;
  const padded = counter.toString().padStart(4, '0');
  return `OSR${year}${padded}`;
};

// Alternative: Get next number from database (more reliable)
export const generateDocumentNumberFromDB = async () => {
  const year = new Date().getFullYear();
  
  // Get the highest number for this year from estimates
  const { data: estimates } = await supabase
    .from("estimates")
    .select("estimate_number")
    .ilike("estimate_number", `OSR${year}%`)
    .order("created_at", { ascending: false });
  
  let maxNum = 0;
  if (estimates && estimates.length > 0) {
    estimates.forEach(est => {
      const match = est.estimate_number?.match(new RegExp(`OSR${year}(\\d+)`));
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
  }
  
  const nextNum = maxNum + 1;
  const padded = nextNum.toString().padStart(4, '0');
  return `OSR${year}${padded}`;
};