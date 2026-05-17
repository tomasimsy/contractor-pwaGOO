"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/components/CreateEstimateScreen.module.css";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type LineItem = {
  id: string;
  category: "Material" | "Labor" | "Other";
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
};

type ProjectImage = {
  id: string;
  url: string;
};

type Project = {
  id: string;
  name: string;
  images: ProjectImage[];
  lineItems: LineItem[];
};

export default function CreateEstimateScreen() {
  const router = useRouter();
  const params = useParams();
  const estimateId = params.id as string;
  const isEditMode_ = !!estimateId;

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);

  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");

  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [markup, setMarkup] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [taxRate, setTaxRate] = useState(0);

  const [coverProcessingFee, setCoverProcessingFee] = useState(false);
  const [autoGenerateInvoice, setAutoGenerateInvoice] = useState(false);
  const [expirationEnabled, setExpirationEnabled] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Status for view mode
  const [status, setStatus] = useState<"pending" | "approved" | "declined">("pending");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [projects, setProjects] = useState<Project[]>([
    {
      id: crypto.randomUUID(),
      name: "",
      images: [],
      lineItems: [
        {
          id: crypto.randomUUID(),
          category: "Material",
          name: "",
          description: "",
          quantity: 1,
          unitPrice: 0,
          taxable: false,
        },
      ],
    },
  ]);

  // Fetch clients
  useEffect(() => {
    const fetchClients = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone, email, address")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setClients(data as Client[]);
      }
    };

    fetchClients();
  }, []);

  // Load estimate data if editing
  useEffect(() => {
    const loadEstimate = async () => {
      if (!estimateId) return;

      try {
        // Load estimate
        const { data: estimateData, error: estimateError } = await supabase
          .from("estimates")
          .select("*")
          .eq("id", estimateId)
          .single();

        if (estimateError || !estimateData) {
          console.error(estimateError);
          return;
        }

        // Set status
        setStatus(estimateData.status || "pending");
        
        // Set client
        setClientId(estimateData.client_id);
        
        // Set basic info
        setDescription(estimateData.description || "");
        setNotes(estimateData.notes || "");
        setMarkup(estimateData.markup || 0);
        setDiscount(estimateData.discount || 0);
        setDeposit(estimateData.deposit || 0);
        setTaxRate(estimateData.tax_rate || 0);
        setCoverProcessingFee(estimateData.cover_processing_fee || false);
        setAutoGenerateInvoice(estimateData.auto_generate_invoice || false);
        setExpirationEnabled(estimateData.expiration_enabled || false);

        // Load items
        const { data: itemsData } = await supabase
          .from("estimate_items")
          .select("*")
          .eq("estimate_id", estimateId);

        // Load images from estimate_images table if it exists
        let imagesData: any[] = [];
        try {
          const { data } = await supabase
            .from("estimate_images")
            .select("*")
            .eq("estimate_id", estimateId);
          imagesData = data || [];
        } catch (err) {
          console.log("No estimate_images table yet, skipping...");
        }

        // Group into projects
        const groupedProjects: Record<string, Project> = {};

        itemsData?.forEach((item) => {
          const projectName = item.project_name || "Untitled Project";

          if (!groupedProjects[projectName]) {
            groupedProjects[projectName] = {
              id: crypto.randomUUID(),
              name: projectName,
              images: [],
              lineItems: [],
            };
          }

          groupedProjects[projectName].lineItems.push({
            id: item.id,
            category: item.category,
            name: item.name,
            description: item.description || "",
            quantity: item.quantity,
            unitPrice: item.unit_price,
            taxable: item.taxable,
          });
        });

        // Add images to projects
        imagesData?.forEach((img) => {
          const projectName = img.project_name || "Untitled Project";
          if (groupedProjects[projectName]) {
            groupedProjects[projectName].images.push({
              id: img.id,
              url: img.image_url,
            });
          }
        });

        const projectsArray = Object.values(groupedProjects);
        if (projectsArray.length > 0) {
          setProjects(projectsArray);
        }
      } catch (err) {
        console.error(err);
      }
    };

    loadEstimate();
  }, [estimateId]);

  // Calculations
  const subtotal = projects.reduce((projectSum, project) => {
    const projectTotal = project.lineItems.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return sum + (isNaN(lineTotal) ? 0 : lineTotal);
    }, 0);
    return projectSum + projectTotal;
  }, 0);

  const taxAmount = subtotal * (taxRate / 100);

  const totalBeforeDiscount = subtotal + markup + taxAmount;
  const total = totalBeforeDiscount - discount;

  // Handlers
  const handleAddProject = () => {
    setProjects((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        images: [],
        lineItems: [
          {
            id: crypto.randomUUID(),
            category: "Material",
            name: "",
            description: "",
            quantity: 1,
            unitPrice: 0,
            taxable: false,
          },
        ],
      },
    ]);
  };

  const handleRemoveProject = (projectId: string) => {
    setProjects((prev) =>
      prev.filter((project) => project.id !== projectId)
    );
  };

  const updateProjectName = (projectId: string, value: string) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, name: value } : project
      )
    );
  };

  // WORKING IMAGE UPLOAD - Same pattern as your working code
  const handleProjectImageUpload = async (projectId: string, file: File) => {
    if (!file) return;

    setUploadingImage(true);
    setImageError(null);

    // Create unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("project-images")
      .upload(fileName, file);

    if (uploadError) {
      console.error(uploadError);
      setImageError(uploadError.message);
      alert(uploadError.message);
      setUploadingImage(false);
      return;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("project-images")
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // If editing existing estimate, save to database immediately
    if (estimateId) {
      try {
        const { error: dbError } = await supabase
          .from("estimate_images")
          .insert({
            estimate_id: estimateId,
            project_name: projects.find(p => p.id === projectId)?.name || "Untitled Project",
            image_url: publicUrl,
          });

        if (dbError) {
          console.error(dbError);
          // Continue anyway - we'll still show the image locally
        }
      } catch (err) {
        console.error("DB insert error:", err);
      }
    }

    // Update local state
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              images: [
                ...project.images,
                {
                  id: crypto.randomUUID(),
                  url: publicUrl,
                },
              ],
            }
          : project
      )
    );

    setUploadingImage(false);
    alert("Image uploaded successfully!");
  };

  // WORKING IMAGE DELETE - Same pattern as your working code
  const handleRemoveProjectImage = async (projectId: string, imageId: string) => {
    const project = projects.find(p => p.id === projectId);
    const image = project?.images.find(img => img.id === imageId);
    
    if (!image) return;

    // Extract filename from URL
    const fileName = image.url.split("/").pop();
    
    if (fileName) {
      // Remove from storage
      const { error: storageError } = await supabase.storage
        .from("project-images")
        .remove([fileName]);

      if (storageError) {
        console.error(storageError);
        alert(storageError.message);
        return;
      }
    }

    // Remove from database if editing
    if (estimateId) {
      try {
        await supabase
          .from("estimate_images")
          .delete()
          .eq("image_url", image.url);
      } catch (err) {
        console.error("DB delete error:", err);
      }
    }

    // Update local state
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              images: project.images.filter((img) => img.id !== imageId),
            }
          : project
      )
    );

    alert("Image deleted successfully");
  };

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const handleAddLineItem = (projectId: string) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              lineItems: [
                ...project.lineItems,
                {
                  id: crypto.randomUUID(),
                  category: "Material",
                  name: "",
                  description: "",
                  quantity: 1,
                  unitPrice: 0,
                  taxable: false,
                },
              ],
            }
          : project
      )
    );
  };

  const handleRemoveLineItem = (projectId: string, lineItemId: string) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              lineItems: project.lineItems.filter((item) => item.id !== lineItemId),
            }
          : project
      )
    );
  };

  const updateLineItem = (
    projectId: string,
    lineItemId: string,
    field: keyof LineItem,
    value: any
  ) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              lineItems: project.lineItems.map((item) =>
                item.id === lineItemId ? { ...item, [field]: value } : item
              ),
            }
          : project
      )
    );
  };

  const handleSaveNewClient = async () => {
    if (!newClientName.trim()) return;

    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: newClientName.trim(),
        phone: newClientPhone || null,
        email: newClientEmail || null,
        address: newClientAddress || null,
      })
      .select("id, name, phone, email, address")
      .single();

    if (error) {
      console.error("Supabase Error:", JSON.stringify(error, null, 2));
      return;
    }

    const client = data as Client;
    setClients((prev) => [client, ...prev]);
    setClientId(client.id);
    setShowNewClientForm(false);
    setShowClientPicker(false);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientEmail("");
    setNewClientAddress("");
  };

  const handleStatusChange = async (newStatus: "pending" | "approved" | "declined") => {
    if (updatingStatus || !estimateId) return;
    
    try {
      setUpdatingStatus(true);
      
      const { error } = await supabase
        .from("estimates")
        .update({ status: newStatus })
        .eq("id", estimateId);

      if (error) {
        console.error(error);
        alert("Failed to update status");
        return;
      }

      setStatus(newStatus);
      alert(`Estimate ${newStatus === "approved" ? "approved" : newStatus === "declined" ? "declined" : "reset to pending"} successfully!`);
    } catch (err) {
      console.error(err);
      alert("Error updating status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveEstimate = async () => {
    setError(null);

    if (!clientId) {
      setError("Please select a client.");
      return;
    }

    if (projects.length === 0) {
      setError("Please add at least one project.");
      return;
    }

    setIsSaving(true);

    try {
      let currentEstimateId = estimateId;

      if (!estimateId) {
        // Insert new estimate
        const { data: estimateData, error: estimateError } = await supabase
          .from("estimates")
          .insert({
            client_id: clientId,
            description: description || null,
            subtotal,
            markup,
            discount,
            deposit,
            tax: taxAmount,
            total,
            status: "pending",
            cover_processing_fee: coverProcessingFee,
            auto_generate_invoice: autoGenerateInvoice,
            expiration_enabled: expirationEnabled,
            notes: notes || null,
          })
          .select("id")
          .single();

        if (estimateError || !estimateData) {
          console.error("Estimate Error:", estimateError);
          setError("Failed to save estimate.");
          setIsSaving(false);
          return;
        }

        currentEstimateId = estimateData.id;

        // Insert line items
        const itemsPayload = projects.flatMap((project) =>
          project.lineItems.map((item) => ({
            estimate_id: currentEstimateId,
            project_name: project.name || "Untitled Project",
            category: item.category,
            name: item.name || "Item",
            description: item.description || null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            taxable: item.taxable,
            total: item.quantity * item.unitPrice,
          }))
        );

        const { error: itemsError } = await supabase
          .from("estimate_items")
          .insert(itemsPayload);

        if (itemsError) {
          console.error("Items Error:", itemsError);
          setError("Estimate saved, but failed to save line items.");
          setIsSaving(false);
          return;
        }

        // Insert images
        const imagesPayload = projects.flatMap((project) =>
          project.images.map((img) => ({
            estimate_id: currentEstimateId,
            project_name: project.name || "Untitled Project",
            image_url: img.url,
          }))
        );

        if (imagesPayload.length > 0) {
          try {
            await supabase.from("estimate_images").insert(imagesPayload);
          } catch (err) {
            console.error("Images insert error:", err);
          }
        }

        // Insert deposit
        if (deposit > 0) {
          await supabase.from("estimate_payments").insert({
            estimate_id: currentEstimateId,
            type: "deposit",
            amount: deposit,
            due_date: null,
          });
        }
      } else {
        // Update existing estimate
        const { error: updateError } = await supabase
          .from("estimates")
          .update({
            client_id: clientId,
            description: description || null,
            subtotal,
            markup,
            discount,
            deposit,
            tax: taxAmount,
            total,
            cover_processing_fee: coverProcessingFee,
            auto_generate_invoice: autoGenerateInvoice,
            expiration_enabled: expirationEnabled,
            notes: notes || null,
          })
          .eq("id", estimateId);

        if (updateError) {
          console.error("Update Error:", updateError);
          setError("Failed to update estimate.");
          setIsSaving(false);
          return;
        }

        // Delete and reinsert items
        await supabase.from("estimate_items").delete().eq("estimate_id", estimateId);
        
        const itemsPayload = projects.flatMap((project) =>
          project.lineItems.map((item) => ({
            estimate_id: estimateId,
            project_name: project.name || "Untitled Project",
            category: item.category,
            name: item.name || "Item",
            description: item.description || null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            taxable: item.taxable,
            total: item.quantity * item.unitPrice,
          }))
        );

        if (itemsPayload.length > 0) {
          const { error: itemsError } = await supabase
            .from("estimate_items")
            .insert(itemsPayload);

          if (itemsError) {
            console.error("Items Error:", itemsError);
            setError("Estimate updated, but failed to save line items.");
            setIsSaving(false);
            return;
          }
        }
      }

      router.push("/estimates");
    } catch (err) {
      console.error(err);
      setError("Unexpected error saving estimate.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedClient = clients.find((c) => c.id === clientId) || null;

  return (
    <div className={styles.screen}>
      {/* HEADER */}
      <div className={styles.header}>
        <button className={styles.headerIcon} onClick={() => router.back()}>
          ←
        </button>
        
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div className={styles.headerTitle}>
            {estimateId ? "Proposal" : "New Estimate"}
          </div>
          {estimateId && (
            <div
              style={{
                marginTop: 6,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                paddingBottom: 4,
                borderBottom:
                  status === "approved"
                    ? "2px solid #16a34a"
                    : status === "declined"
                    ? "2px solid #dc2626"
                    : "2px solid #eab308",
                color:
                  status === "approved"
                    ? "#16a34a"
                    : status === "declined"
                    ? "#dc2626"
                    : "#a16207",
                display: "inline-block",
              }}
            >
              {status}
            </div>
          )}
        </div>

        <div className={styles.headerActions}>
          {estimateId && (
            <Link href={`/estimates/${estimateId}/pdf`} target="_blank">
              <button className={styles.headerIcon}>📄</button>
            </Link>
          )}
          
          {estimateId && (
            <button
              className={`${styles.headerIcon} ${isEditMode ? styles.activeIcon : ""}`}
              onClick={() => setIsEditMode(!isEditMode)}
            >
              ✏️
            </button>
          )}
          
          <button className={styles.headerIcon} onClick={handleSaveEstimate} disabled={isSaving}>
            ✓
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}

        {/* Status Buttons - Only for existing estimates in view mode */}
        {estimateId && !isEditMode && status === "pending" && (
          <div className={styles.card}>
            <div className={styles.cardLabel}>Review Estimate</div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => handleStatusChange("approved")}
                disabled={updatingStatus}
                style={{
                  background: "#16a34a",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 8,
                  cursor: updatingStatus ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  flex: 1,
                }}
              >
                ✓ Approve
              </button>
              <button
                onClick={() => handleStatusChange("declined")}
                disabled={updatingStatus}
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 8,
                  cursor: updatingStatus ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  flex: 1,
                }}
              >
                ✗ Decline
              </button>
            </div>
          </div>
        )}

        {estimateId && !isEditMode && status !== "pending" && (
          <div className={styles.card}>
            <div className={styles.cardLabel}>Status</div>
            <div style={{ padding: "12px", borderRadius: 8, backgroundColor: status === "approved" ? "#f0fdf4" : "#fef2f2", textAlign: "center" }}>
              This estimate has been <strong>{status}</strong>.
              {status === "approved" && " Thank you for your business!"}
              {status === "declined" && " Please contact us if you'd like to discuss further."}
            </div>
          </div>
        )}

        {/* Client */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Client</div>
          {selectedClient ? (
            <button className={styles.clientButton} onClick={() => setShowClientPicker(true)} disabled={estimateId && !isEditMode}>
              <div className={styles.clientName}>{selectedClient.name}</div>
              <div className={styles.clientSub}>{selectedClient.phone || selectedClient.email || ""}</div>
            </button>
          ) : (
            <button className={styles.addClientButton} onClick={() => setShowClientPicker(true)}>
              + ADD CLIENT
            </button>
          )}
        </div>

        {/* Description */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Description</div>
          {!estimateId || isEditMode ? (
            <textarea
              className={styles.textarea}
              placeholder="Describe the work to be done"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          ) : (
            <div className={styles.descriptionText}>{description || "No description provided"}</div>
          )}
        </div>

        {/* Projects */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>{!estimateId || isEditMode ? "Projects" : "Projects Summary"}</div>

          {projects.map((project, projectIndex) => {
            const projectSubtotal = project.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

            return (
              <div key={project.id} style={{ marginBottom: 30, paddingBottom: 20, borderBottom: "1px solid #e9ecef" }}>
                <div className={styles.lineItemRow}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Project {projectIndex + 1}</div>
                  {(!estimateId || isEditMode) && projects.length > 1 && (
                    <button className={styles.removeItem} onClick={() => handleRemoveProject(project.id)}>✕</button>
                  )}
                </div>

                {!estimateId || isEditMode ? (
                  <>
                    <input
                      className={styles.input}
                      placeholder="Project Name"
                      value={project.name}
                      onChange={(e) => updateProjectName(project.id, e.target.value)}
                      style={{ marginTop: 12 }}
                    />

                    {/* Image Upload Section - Using working pattern */}
                    

                    {/* Line Items */}
                    {project.lineItems.map((item) => (
                      <div key={item.id} className={styles.lineItem}>
                        <div className={styles.lineItemRow}>
                          <select
                            className={styles.select}
                            value={item.category}
                            onChange={(e) => updateLineItem(project.id, item.id, "category", e.target.value)}
                          >
                            <option value="Material">Material</option>
                            <option value="Labor">Labor</option>
                            <option value="Other">Other</option>
                          </select>
                          <button className={styles.removeItem} onClick={() => handleRemoveLineItem(project.id, item.id)}>✕</button>
                        </div>

                        <input className={styles.input} placeholder="Item name" value={item.name} onChange={(e) => updateLineItem(project.id, item.id, "name", e.target.value)} />
                        <textarea className={styles.textareaSmall} placeholder="Description (optional)" value={item.description} onChange={(e) => updateLineItem(project.id, item.id, "description", e.target.value)} />

                        <div className={styles.lineItemRow}>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Qty</label>
                            <input type="number" className={styles.input} value={item.quantity} onChange={(e) => updateLineItem(project.id, item.id, "quantity", Number(e.target.value) || 0)} />
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Unit Price</label>
                            <input type="number" className={styles.input} value={item.unitPrice} onChange={(e) => updateLineItem(project.id, item.id, "unitPrice", Number(e.target.value) || 0)} />
                          </div>
                        </div>

                        <div className={styles.lineItemRow}>
                          <label className={styles.toggleLabel}>
                            <input type="checkbox" checked={item.taxable} onChange={(e) => updateLineItem(project.id, item.id, "taxable", e.target.checked)} />
                            Taxable
                          </label>
                          <div className={styles.lineItemTotal}>${(item.quantity * item.unitPrice).toFixed(2)}</div>
                        </div>
                      </div>
                    ))}

                    <div className={styles.summaryRow} style={{ marginTop: 10, fontWeight: 700 }}>
                      <span>{project.name || "Untitled Project"} Total</span>
                      <span>${projectSubtotal.toFixed(2)}</span>
                    </div>

                    <button className={styles.addLineItemButton} onClick={() => handleAddLineItem(project.id)}>+ ADD LINE ITEM</button>
                  </>
                ) : (
                  // View mode - just show project name, images, and totals
                  <>
                    <div style={{ fontWeight: 700, marginTop: 12 }}>{project.name || "Untitled Project"}</div>
                    
                    {project.images.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8, marginTop: 12 }}>
                        {project.images.map((image) => (
                          <img key={image.id} src={image.url} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8 }} />
                        ))}
                      </div>
                    )}

                    {project.lineItems.map((item) => (
                      <div key={item.id} className={styles.summaryRow}>
                        <span>{item.name} x{item.quantity}</span>
                        <span>${(item.quantity * item.unitPrice).toFixed(2)}</span>
                      </div>
                    ))}
                    
                    <div className={styles.summaryRow} style={{ fontWeight: 700 }}>
                      <span>Total</span>
                      <span>${projectSubtotal.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {(!estimateId || isEditMode) && (
            <button className={styles.addLineItemButton} onClick={handleAddProject}>+ ADD PROJECT</button>
          )}
        </div>

        {/* Financial Summary */}
        <div className={styles.card}>
          <div className={styles.summaryRow}><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          <div className={styles.summaryRow}>
            <span>Markup</span>
            {(!estimateId || isEditMode) ? (
              <input type="number" className={styles.summaryInput} value={markup} onChange={(e) => setMarkup(Number(e.target.value) || 0)} />
            ) : (
              <span>${markup.toFixed(2)}</span>
            )}
          </div>
          <div className={styles.summaryRow}>
            <span>Discount</span>
            {(!estimateId || isEditMode) ? (
              <input type="number" className={styles.summaryInput} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            ) : (
              <span>-${discount.toFixed(2)}</span>
            )}
          </div>
          <div className={styles.summaryRow}>
            <span>Request a Deposit</span>
            {(!estimateId || isEditMode) ? (
              <input type="number" className={styles.summaryInput} value={deposit} onChange={(e) => setDeposit(Number(e.target.value) || 0)} />
            ) : (
              <span>${deposit.toFixed(2)}</span>
            )}
          </div>
          <div className={styles.summaryRow}>
            <span>Tax Rate (%)</span>
            {(!estimateId || isEditMode) ? (
              <input type="number" className={styles.summaryInput} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} />
            ) : (
              <span>{taxRate}%</span>
            )}
          </div>
          <div className={styles.summaryRow}><span>Tax</span><span>${taxAmount.toFixed(2)}</span></div>
          <div className={styles.summaryRowTotal}><span>Total (USD)</span><span>${total.toFixed(2)}</span></div>
        </div>

        {/* Options */}
 

        {/* Notes */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Notes for Client</div>
          {(!estimateId || isEditMode) ? (
            <textarea className={styles.textarea} placeholder="Add notes for your client" value={notes} onChange={(e) => setNotes(e.target.value)} />
          ) : (
            <div className={styles.notesText}>{notes || "No additional notes"}</div>
          )}
        </div>
      </div>

      {/* Client Picker Modal */}
      {showClientPicker && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>Select Client</div>
              <button className={styles.modalClose} onClick={() => setShowClientPicker(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {clients.length === 0 && <div className={styles.emptyText}>No clients yet.</div>}
              {clients.map((client) => (
                <button key={client.id} className={styles.clientListItem} onClick={() => { setClientId(client.id); setShowClientPicker(false); }}>
                  <div className={styles.clientName}>{client.name}</div>
                  <div className={styles.clientSub}>{client.phone || client.email || ""}</div>
                </button>
              ))}
              {!showNewClientForm && (
                <button className={styles.addClientInline} onClick={() => setShowNewClientForm(true)}>+ Add New Client</button>
              )}
              {showNewClientForm && (
                <div className={styles.newClientForm}>
                  <input className={styles.input} placeholder="Client name" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                  <input className={styles.input} placeholder="Phone" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} />
                  <input className={styles.input} placeholder="Email" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} />
                  <input className={styles.input} placeholder="Address" value={newClientAddress} onChange={(e) => setNewClientAddress(e.target.value)} />
                  <button className={styles.saveClientButton} onClick={handleSaveNewClient}>Save Client</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Saving overlay */}
      {isSaving && (
        <div className={styles.savingOverlay}>
          <div className={styles.savingBox}>Saving estimate…</div>
        </div>
      )}
    </div>
  );
}