"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyIdOrNull } from "@/lib/supabase/getCompanyId";
import { CompanySettings, mergeCompanyDefaults } from "@/lib/company";

// Single place every authenticated page/component reads company branding
// from, so a Settings edit shows up everywhere immediately without each
// component running its own query. Not used on the public (anonymous)
// signing pages — those have no logged-in session to resolve a company_id
// from, so they load company data straight off the public bundle RPCs.
type CompanyContextType = {
  company: CompanySettings;
  loading: boolean;
  reload: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<CompanySettings>(mergeCompanyDefaults(null));
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const companyId = await getCompanyIdOrNull();
    if (!companyId) {
      setCompany(mergeCompanyDefaults(null));
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("company_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();
    setCompany(mergeCompanyDefaults(data));
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <CompanyContext.Provider value={{ company, loading, reload }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany() must be used within a CompanyProvider (see app/layout.tsx)");
  }
  return ctx;
}
