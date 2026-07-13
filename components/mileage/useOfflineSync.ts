import { useEffect, useState, useCallback } from "react";
import { Trip, TripStatus, TripInput } from "./types";
import { isOnline, generateId } from "./utils";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/supabase/getCompanyId";

export function useOfflineSync(userId: string | null) {

  const [trips, setTrips] = useState<Trip[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const storageKey = userId
    ? `mileage_trips_offline_${userId}`
    : "mileage_trips_offline_temp";


  // Load local trips
  useEffect(() => {
    if (!userId) return;

    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        setTrips(JSON.parse(stored));
      } catch {
        setTrips([]);
      }
    }

  }, [userId, storageKey]);


  // Save local trips
  useEffect(() => {
    if (!userId) return;

    localStorage.setItem(
      storageKey,
      JSON.stringify(trips)
    );

  }, [trips, userId, storageKey]);



  // Add local trip
  const addTrip = useCallback(
    (trip: TripInput) => {

      if (!userId) return null as any;


      const newTrip: Trip = {
        ...trip,
        user_id: userId,
        id: generateId(),
        status: "pending",
        created_at: new Date().toISOString(),
      };


      setTrips(prev => [
        newTrip,
        ...prev
      ]);


      return newTrip;

    },
    [userId]
  );



  // Update trip
  const updateTrip = useCallback(
    async (
      id: string,
      updates: Partial<Trip>
    ) => {

      if (!userId) return;


      setTrips(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, ...updates }
            : t
        )
      );


      if (isOnline()) {

        const companyId = await getCompanyId();


        const { error } = await supabase
          .from("mileage_trips")
          .update({
            ...updates,
            company_id: companyId
          })
          .eq("id", id)
          .eq("user_id", userId);


        if (error) {
          console.error(
            "Update error",
            error
          );
        }

      }

    },
    [userId]
  );



  // Delete trip
  const removeTrip = useCallback(
    async (
      id: string
    ) => {

      if (!userId) return;


      setTrips(prev =>
        prev.filter(
          t => t.id !== id
        )
      );


      if (isOnline()) {

        const { error } = await supabase
          .from("mileage_trips")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);


        if (error) {
          console.error(
            "Delete error",
            error
          );
        }

      }

    },
    [userId]
  );



  const updateTripStatus = useCallback(
    (
      id: string,
      status: TripStatus
    ) => {

      setTrips(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, status }
            : t
        )
      );

    },
    []
  );



  // Sync offline trips
  const syncPending = useCallback(
    async () => {

      if (
        !userId ||
        !isOnline() ||
        isSyncing
      ) return;


      const pending = trips.filter(
        t =>
          t.status === "pending" ||
          t.status === "error"
      );


      if (pending.length === 0) {
        console.log("✅ No pending trips");
        return;
      }


      setIsSyncing(true);


      try {

        const companyId = await getCompanyId();


        for (const trip of pending) {


          const insertData = {

            company_id: companyId,

            user_id: userId,

            estimate_id:
              trip.estimate_id || null,

            start_image:
              trip.start_image,

            end_image:
              trip.end_image,

            start_lat:
              trip.start_lat,

            start_lng:
              trip.start_lng,

            end_lat:
              trip.end_lat,

            end_lng:
              trip.end_lng,

            start_time:
              trip.start_time,

            end_time:
              trip.end_time,

            distance_miles:
              trip.distance_miles,

            distance_meters:
              trip.distance_meters,

            duration_seconds:
              Math.round(
                trip.duration_seconds
              ),

            duration_minutes:
              Math.round(
                trip.duration_minutes
              ),

            route_summary:
              trip.route_summary,

            reimbursement:
              trip.reimbursement,

            status:
              "completed",

          };



          const { error } =
            await supabase
              .from("mileage_trips")
              .insert(insertData);



          if (error) {

            console.error(
              "❌ Sync failed for trip",
              trip.id,
              JSON.stringify(error, null, 2)
            );


            updateTripStatus(
              trip.id!,
              "error"
            );


          } else {

            console.log(
              "✅ Synced trip",
              trip.id
            );


            updateTripStatus(
              trip.id!,
              "synced"
            );

          }

        }


      } catch(error) {

        console.error(
          "Sync error",
          error
        );


      } finally {

        setIsSyncing(false);

      }

    },
    [
      userId,
      trips,
      isSyncing,
      updateTripStatus
    ]
  );



  // Fetch trips
  const fetchRemoteTrips = useCallback(
    async () => {

      if (
        !userId ||
        !isOnline() ||
        isFetching
      ) return;


      setIsFetching(true);


      try {

        const { data, error } =
          await supabase
            .from("mileage_trips")
            .select("*")
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order(
              "created_at",
              {
                ascending:false
              }
            );


        if(error){
          console.error(
            "Fetch error",
            error
          );
          return;
        }


        const remoteTrips: Trip[] =
          data.map((row:any)=>({
            ...row,
            status:"synced"
          }));


        const localPending =
          trips.filter(
            t =>
            t.status==="pending" ||
            t.status==="error"
          );


        setTrips([
          ...remoteTrips,
          ...localPending
        ]);


      } catch(err){

        console.error(
          "Fetch remote error",
          err
        );

      }
      finally {

        setIsFetching(false);

      }

    },
    [
      userId,
      trips,
      isFetching
    ]
  );



  const refresh = useCallback(()=>{
    fetchRemoteTrips();
  },[fetchRemoteTrips]);



  useEffect(()=>{

    if(
      userId &&
      isOnline() &&
      !isSyncing
    ){

      const hasPending =
        trips.some(
          t =>
          t.status==="pending" ||
          t.status==="error"
        );


      if(hasPending){
        syncPending();
      }

    }

  },[
    trips,
    userId,
    isSyncing,
    syncPending
  ]);



  useEffect(()=>{

    const handleOnline = ()=>{

      if(userId){
        fetchRemoteTrips();
      }

    };


    window.addEventListener(
      "online",
      handleOnline
    );


    return ()=>{

      window.removeEventListener(
        "online",
        handleOnline
      );

    };

  },[
    userId,
    fetchRemoteTrips
  ]);



  useEffect(()=>{

    if(userId && isOnline()){
      syncPending();
    }

  },[userId]);



  useEffect(()=>{

    if(userId && isOnline()){
      fetchRemoteTrips();
    }

  },[userId]);



  return {

    trips,

    addTrip,

    removeTrip,

    updateTrip,

    syncPending,

    refresh,

    isSyncing,

    isFetching,

    isOnline:isOnline(),

  };

}