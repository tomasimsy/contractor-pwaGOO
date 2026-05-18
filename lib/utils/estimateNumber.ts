import { supabase } from "@/lib/supabase/client";

export const generateEstimateNumber = async () => {
  const currentYear = new Date().getFullYear();
  
  // Get the highest number for this year from estimates
  const { data: estimates } = await supabase
    .from("estimates")
    .select("estimate_number")
    .ilike("estimate_number", `OSR${currentYear}%`)
    .order("created_at", { ascending: false });
  
  let maxNum = 0;
  
  if (estimates && estimates.length > 0) {
    estimates.forEach(est => {
      const match = est.estimate_number?.match(new RegExp(`OSR${currentYear}(\\d+)`));
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
  }
  
  const nextNum = maxNum + 1;
  const paddedNum = nextNum.toString().padStart(4, '0');
  
  return `OSR${currentYear}${paddedNum}`;
};