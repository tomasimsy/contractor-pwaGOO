import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushSubscription, PushSubscriptionInput, PushSubscriptionService } from "../pushSubscriptionService";
import type { UUID } from "../types";

interface PushSubscriptionRow {
  id: string;
  company_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

function mapRow(row: PushSubscriptionRow): PushSubscription {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    userId: row.user_id as UUID,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    createdAt: row.created_at,
  };
}

export function createSupabasePushSubscriptionService(supabase: SupabaseClient): PushSubscriptionService {
  return {
    async subscribe(input: PushSubscriptionInput) {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            company_id: input.companyId,
            user_id: input.userId,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            deleted_at: null,
          },
          { onConflict: "endpoint" }
        )
        .select()
        .single();
      if (error) throw new Error(`Failed to save push subscription: ${error.message}`);
      return mapRow(data as PushSubscriptionRow);
    },

    async unsubscribe(endpoint: string) {
      const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      if (error) throw new Error(`Failed to remove push subscription: ${error.message}`);
    },

    async listForCompany(companyId: UUID) {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw new Error(`Failed to load push subscriptions: ${error.message}`);
      return (data || []).map(mapRow);
    },
  };
}
