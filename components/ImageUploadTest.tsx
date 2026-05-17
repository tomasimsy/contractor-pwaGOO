"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ImageUploadTest({ estimateId }: { estimateId: string }) {
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!estimateId) {
      console.error("No estimateId found");
      return;
    }

    setUploading(true);

    const filePath = `estimates/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("estimate-images")
      .upload(filePath, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      setUploading(false);
      return;
    }

    const { data: publicData } = supabase.storage
      .from("estimate-images")
      .getPublicUrl(filePath);

    const publicUrl = publicData.publicUrl;

    const { error: dbError } = await supabase
      .from("estimates")
      .update({ image_url: publicUrl })
      .eq("id", estimateId);

    if (dbError) {
      console.error("DB error:", dbError);
      setUploading(false);
      return;
    }

    setImageUrl(publicUrl);
    setUploading(false);
  };

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleUpload} />

      {uploading && <p>Uploading...</p>}

      {imageUrl && (
        <img
          src={imageUrl}
          alt="Uploaded"
          style={{ width: "100%", marginTop: 20, borderRadius: 12 }}
        />
      )}
    </div>
  );
}
