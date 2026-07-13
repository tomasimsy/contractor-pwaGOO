"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { useNotifications } from "@/context/NotificationContext";

const LAST_CHECK_KEY = "notification_last_check";
const NOTIFICATION_COOLDOWN_MS = 5000;

export default function RealtimeNotificationListener() {
  const { addNotification } = useNotifications();
  const lastCheckRef = useRef<Date>(new Date(0)); // temporary initial value
  const notifiedEstimateIdsRef = useRef<Map<string, number>>(new Map());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const isInitializedRef = useRef(false);

  const shouldNotify = (estimateId: string): boolean => {
    const lastNotified = notifiedEstimateIdsRef.current.get(estimateId);
    const now = Date.now();
    if (lastNotified && (now - lastNotified) < NOTIFICATION_COOLDOWN_MS) {
      return false;
    }
    notifiedEstimateIdsRef.current.set(estimateId, now);
    return true;
  };

  const notifyEstimate = (estimateNumber: string, clientName: string) => {
    addNotification(
      "Estimate Signed",
      `${clientName} signed Estimate #${estimateNumber}.`
    );
  };

  const fetchNewApproved = async () => {
    console.log("🔍 Polling for approved estimates since", lastCheckRef.current.toISOString());
    
    const { data: estimates, error } = await supabase
      .from("estimates")
      .select("id, estimate_number, client_id")
      .eq("status", "approved")
      .gte("updated_at", lastCheckRef.current.toISOString());

    if (error) {
      console.error("Polling error:", error);
      return;
    }

    if (estimates && estimates.length > 0) {
      const clientIds = [...new Set(estimates.map(e => e.client_id))];
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds)
        .is("deleted_at", null);

      const clientMap = new Map();
      clients?.forEach(c => clientMap.set(c.id, c.name));

      estimates.forEach((estimate) => {
        if (shouldNotify(estimate.id)) {
          const clientName = clientMap.get(estimate.client_id) || "A customer";
          notifyEstimate(estimate.estimate_number || estimate.id.slice(0, 8), clientName);
        }
      });

      const newLastCheck = new Date();
      lastCheckRef.current = newLastCheck;
      if (typeof window !== 'undefined') {
        localStorage.setItem(LAST_CHECK_KEY, newLastCheck.toISOString());
      }
    }
  };

  // Initialize lastCheckRef from localStorage on client side only
  useEffect(() => {
    if (typeof window !== 'undefined' && !isInitializedRef.current) {
      const stored = localStorage.getItem(LAST_CHECK_KEY);
      if (stored) {
        try {
          lastCheckRef.current = new Date(stored);
        } catch (e) {}
      }
      isInitializedRef.current = true;
    }
  }, []);

  useEffect(() => {
    let realtimeTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel('realtime-estimates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'estimates', filter: 'status=eq.approved' },
        async (payload) => {
          console.log("🔥 Realtime event received:", payload);
          const estId = payload.new.id;
          if (!shouldNotify(estId)) return;

          const { data: estimate, error } = await supabase
            .from("estimates")
            .select("estimate_number, client_id")
            .eq("id", estId)
            .single();
          if (!error && estimate) {
            const { data: client } = await supabase
              .from("clients")
              .select("name")
              .eq("id", estimate.client_id)
              .is("deleted_at", null)
              .single();
            const clientName = client?.name || "A customer";
            notifyEstimate(estimate.estimate_number || estId.slice(0, 8), clientName);
          } else {
            addNotification(
              "Estimate Signed",
              `Estimate #${payload.new.estimate_number || estId.slice(0, 8)} was signed.`
            );
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Subscription status:", status);
        if (status === 'SUBSCRIBED') {
          if (realtimeTimeout) clearTimeout(realtimeTimeout);
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          fetchNewApproved();
        } else if (status === 'CHANNEL_ERROR') {
          console.warn("Realtime failed, falling back to polling.");
          startPolling();
        }
      });

    realtimeChannelRef.current = channel;

    realtimeTimeout = setTimeout(() => {
      console.warn("No realtime event after 5s, falling back to polling.");
      startPolling();
    }, 5000);

    const startPolling = () => {
      if (pollingIntervalRef.current) return;
      fetchNewApproved();
      pollingIntervalRef.current = setInterval(fetchNewApproved, 10000);
    };

    fetchNewApproved();

    return () => {
      if (realtimeTimeout) clearTimeout(realtimeTimeout);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    };
  }, [addNotification]);

  return null;
}