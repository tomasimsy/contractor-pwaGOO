import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';

export const softDeleteEstimate = async (id: string) => {
  const { error } = await supabase
    .from("estimates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  
  if (error) throw error;
  return true;
};

export const softDeleteInvoice = async (id: string) => {
  const { error } = await supabase
    .from("invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  
  if (error) throw error;
  return true;
};

export const softDeleteClient = async (id: string) => {
  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  
  if (error) throw error;
  return true;
};

// Restore functions
export const restoreEstimate = async (id: string) => {
  const { error } = await supabase
    .from("estimates")
    .update({ deleted_at: null })
    .eq("id", id);
  
  if (error) throw error;
  return true;
};