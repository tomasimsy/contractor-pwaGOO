import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface CompanySettings {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_website: string;
  tax_id: string;
  terms_conditions: string;
}

export const useCompanySettings = () => {
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: "One Square Roof LLC",
    company_address: "Charlotte, North Carolina",
    company_phone: "(704) 303-4112",
    company_email: "onesquareroof@gmail.com",
    company_website: "",
    tax_id: "",
    terms_conditions: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data } = await supabase
      .from("company_settings")
      .select("*")
      .single();
    
    if (data) {
      setSettings({
        company_name: data.company_name || "One Square Roof LLC",
        company_address: data.company_address || "Charlotte, North Carolina",
        company_phone: data.company_phone || "(704) 303-4112",
        company_email: data.company_email || "onesquareroof@gmail.com",
        company_website: data.company_website || "",
        tax_id: data.tax_id || "",
        terms_conditions: data.terms_conditions || "",
      });
    }
    setLoading(false);
  }

  return { settings, loading };
};