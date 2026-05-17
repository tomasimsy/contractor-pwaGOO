"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./EditEstimateScreen.module.css";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";  

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

type Project = {
  id: string;
  name: string;
  lineItems: LineItem[];
};

export default function CreateEstimateScreen() {
  const router = useRouter();
  const params = useParams();

  const estimateId = params.id as string;

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);

  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");

  const [description, setDescription] = useState("");

  const [projects, setProjects] = useState<Project[]>([
    {
      id: crypto.randomUUID(),
      name: "",
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

  const [markup, setMarkup] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [taxRate, setTaxRate] = useState(0);

  const [coverProcessingFee, setCoverProcessingFee] = useState(false);
  const [autoGenerateInvoice, setAutoGenerateInvoice] = useState(false);
  const [expirationEnabled, setExpirationEnabled] = useState(false);

  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch clients
  useEffect(() => {
    const loadClients = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone, email, address")
        .order("name");

      if (error) {
        console.error("Error loading clients:", error);
        return;
      }

      setClients(data || []);
    };

    loadClients();
  }, []);

  // Fetch estimate data
  useEffect(() => {
    const loadEstimate = async () => {
      if (!estimateId) return;

      // LOAD ESTIMATE
      const { data: estimateData, error: estimateError } =
        await supabase
          .from("estimates")
          .select("*")
          .eq("id", estimateId)
          .single();

      if (estimateError || !estimateData) {
        console.error(estimateError);
        return;
      }

      // LOAD ITEMS
      const { data: itemsData, error: itemsError } =
        await supabase
          .from("estimate_items")
          .select("*")
          .eq("estimate_id", estimateId);

      if (itemsError) {
        console.error(itemsError);
        return;
      }

      // SET BASIC ESTIMATE INFO
      setClientId(estimateData.client_id);
      
      // Load the client details for selectedClient
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, phone, email, address")
        .eq("id", estimateData.client_id)
        .single();
      
      setSelectedClient(clientData as Client || null);
      setDescription(estimateData.description || "");
      setMarkup(estimateData.markup || 0);
      setDiscount(estimateData.discount || 0);
      setDeposit(estimateData.deposit || 0);
      setNotes(estimateData.notes || "");
      setTaxRate(0);
      setCoverProcessingFee(estimateData.cover_processing_fee || false);
      setAutoGenerateInvoice(estimateData.auto_generate_invoice || false);
      setExpirationEnabled(estimateData.expiration_enabled || false);

      // GROUP ITEMS INTO PROJECTS
      const groupedProjects: Record<string, Project> = {};

      itemsData.forEach((item) => {
        const projectName = item.project_name || "Untitled Project";

        if (!groupedProjects[projectName]) {
          groupedProjects[projectName] = {
            id: crypto.randomUUID(),
            name: projectName,
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

      const projectsArray = Object.values(groupedProjects);
      
      if (projectsArray.length > 0) {
        setProjects(projectsArray);
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

  // Calculate tax on subtotal + markup (before discount)
  const taxableBase = subtotal + markup;
  const taxAmount = taxableBase * (taxRate / 100);
  const totalBeforeDiscount = taxableBase + taxAmount;
  const total = totalBeforeDiscount - discount;

  // Handlers
  const handleAddProject = () => {
    setProjects((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
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

  const updateProjectName = (
    projectId: string,
    value: string
  ) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, name: value }
          : project
      )
    );
  };

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

  const handleRemoveLineItem = (
    projectId: string,
    lineItemId: string
  ) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              lineItems: project.lineItems.filter(
                (item) => item.id !== lineItemId
              ),
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
                item.id === lineItemId
                  ? { ...item, [field]: value }
                  : item
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
    setSelectedClient(client);
    setShowNewClientForm(false);
    setShowClientPicker(false);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientEmail("");
    setNewClientAddress("");
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
      // 1. Update estimate
      const { data: estimateData, error: estimateError } = await supabase
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
          status: "pending",
          cover_processing_fee: coverProcessingFee,
          auto_generate_invoice: autoGenerateInvoice,
          expiration_enabled: expirationEnabled,
          notes: notes || null,
        })
        .eq("id", estimateId)
        .select("id")
        .single();

      if (estimateError || !estimateData) {
        console.error("Estimate Error:", JSON.stringify(estimateError, null, 2));
        setError("Failed to save estimate.");
        setIsSaving(false);
        return;
      }

      const savedEstimateId = estimateData.id as string;

      // 2. Delete existing line items and insert new ones
      await supabase
        .from("estimate_items")
        .delete()
        .eq("estimate_id", savedEstimateId);

      const itemsPayload = projects.flatMap((project) =>
        project.lineItems.map((item) => ({
          estimate_id: savedEstimateId,
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
          console.log(JSON.stringify(itemsError, null, 2));
          setError("Estimate saved, but failed to save line items.");
          setIsSaving(false);
          return;
        }
      }

      // 3. Delete existing payments and insert new deposit if > 0
      await supabase
        .from("estimate_payments")
        .delete()
        .eq("estimate_id", savedEstimateId);

      if (deposit > 0) {
        const { error: paymentError } = await supabase
          .from("estimate_payments")
          .insert({
            estimate_id: savedEstimateId,
            type: "deposit",
            amount: deposit,
            due_date: null,
          });

        if (paymentError) {
          console.error(paymentError);
          setError("Estimate saved, but failed to save payment schedule.");
          setIsSaving(false);
          return;
        }
      }

      // Success → go back to estimates list
      router.push("/estimates");
    } catch (err) {
      console.error(err);
      setError("Unexpected error saving estimate.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button
          className={styles.headerIcon}
          onClick={() => router.back()}
          aria-label="Back"
        >
          ←
        </button>
        <div className={styles.headerTitle}>Edit Estimate </div>
        <button
          className={styles.headerIcon}
          onClick={handleSaveEstimate}
          disabled={isSaving}
          aria-label="Save"
        >
          ✓
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}

        {/* Client */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Client</div>
          {selectedClient ? (
            <button
              className={styles.clientButton}
              onClick={() => setShowClientPicker(true)}
            >
              <div className={styles.clientName}>{selectedClient.name}</div>
              <div className={styles.clientSub}>
                {selectedClient.phone || selectedClient.email || ""}
              </div>
            </button>
          ) : (
            <button
              className={styles.addClientButton}
              onClick={() => setShowClientPicker(true)}
            >
              + ADD CLIENT
            </button>
          )}
        </div>

        {/* Description */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Description</div>
          <textarea
            className={styles.textarea}
            placeholder="Describe the work to be done"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Projects */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Projects</div>

          {projects.map((project, projectIndex) => {
            const projectSubtotal = project.lineItems.reduce(
              (sum, item) => {
                return sum + item.quantity * item.unitPrice;
              },
              0
            );

            return (
              <div
                key={project.id}
                style={{
                  marginBottom: 30,
                  paddingBottom: 20,
                  borderBottom: "1px solid #2a2a2a",
                }}
              >
                <div className={styles.lineItemRow}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    Project {projectIndex + 1}
                  </div>

                  {projects.length > 1 && (
                    <button
                      className={styles.removeItem}
                      onClick={() =>
                        handleRemoveProject(project.id)
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>

                <input
                  className={styles.input}
                  placeholder="Project Name"
                  value={project.name}
                  onChange={(e) =>
                    updateProjectName(
                      project.id,
                      e.target.value
                    )
                  }
                  style={{ marginTop: 12 }}
                />

                {project.lineItems.map((item) => (
                  <div
                    key={item.id}
                    className={styles.lineItem}
                  >
                    <div className={styles.lineItemRow}>
                      <select
                        className={styles.select}
                        value={item.category}
                        onChange={(e) =>
                          updateLineItem(
                            project.id,
                            item.id,
                            "category",
                            e.target.value as LineItem["category"]
                          )
                        }
                      >
                        <option value="Material">
                          Material
                        </option>
                        <option value="Labor">
                          Labor
                        </option>
                        <option value="Other">
                          Other
                        </option>
                      </select>

                      <button
                        className={styles.removeItem}
                        onClick={() =>
                          handleRemoveLineItem(
                            project.id,
                            item.id
                          )
                        }
                      >
                        ✕
                      </button>
                    </div>

                    <input
                      className={styles.input}
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) =>
                        updateLineItem(
                          project.id,
                          item.id,
                          "name",
                          e.target.value
                        )
                      }
                    />

                    <textarea
                      className={styles.textareaSmall}
                      placeholder="Description (optional)"
                      value={item.description}
                      onChange={(e) =>
                        updateLineItem(
                          project.id,
                          item.id,
                          "description",
                          e.target.value
                        )
                      }
                    />

                    <div className={styles.lineItemRow}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          Qty
                        </label>

                        <input
                          type="number"
                          className={styles.input}
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(
                              project.id,
                              item.id,
                              "quantity",
                              Number(e.target.value) || 0
                            )
                          }
                        />
                      </div>

                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          Unit Price
                        </label>

                        <input
                          type="number"
                          className={styles.input}
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateLineItem(
                              project.id,
                              item.id,
                              "unitPrice",
                              Number(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className={styles.lineItemRow}>
                      <label className={styles.toggleLabel}>
                        <input
                          type="checkbox"
                          checked={item.taxable}
                          onChange={(e) =>
                            updateLineItem(
                              project.id,
                              item.id,
                              "taxable",
                              e.target.checked
                            )
                          }
                        />
                        Taxable
                      </label>

                      <div className={styles.lineItemTotal}>
                        $
                        {(
                          item.quantity * item.unitPrice
                        ).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}

                <div
                  className={styles.summaryRow}
                  style={{
                    marginTop: 10,
                    fontWeight: 700,
                  }}
                >
                  <span>
                    {project.name || "Untitled Project"} Total
                  </span>

                  <span>
                    ${projectSubtotal.toFixed(2)}
                  </span>
                </div>

                <button
                  className={styles.addLineItemButton}
                  onClick={() =>
                    handleAddLineItem(project.id)
                  }
                >
                  + ADD LINE ITEM
                </button>
              </div>
            );
          })}

          <button
            className={styles.addLineItemButton}
            onClick={handleAddProject}
          >
            + ADD PROJECT
          </button>
        </div>

        {/* Financial Summary */}
        <div className={styles.card}>
          <div className={styles.summaryRow}>
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          <div className={styles.summaryRow}>
            <span>Markup</span>
            <input
              type="number"
              className={styles.summaryInput}
              value={markup}
              onChange={(e) => setMarkup(Number(e.target.value) || 0)}
            />
          </div>

          <div className={styles.summaryRow}>
            <span>Discount</span>
            <input
              type="number"
              className={styles.summaryInput}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            />
          </div>

          <div className={styles.summaryRow}>
            <span>Request a Deposit</span>
            <input
              type="number"
              className={styles.summaryInput}
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value) || 0)}
            />
          </div>

          <div className={styles.summaryRow}>
            <span>Tax Rate (%)</span>
            <input
              type="number"
              className={styles.summaryInput}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
            />
          </div>

          <div className={styles.summaryRow}>
            <span>Tax</span>
            <span>${taxAmount.toFixed(2)}</span>
          </div>

          <div className={styles.summaryRowTotal}>
            <span>Total (USD)</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Toggles / Options */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Payments & Options</div>

          <label className={styles.toggleRow}>
            <span>Cover Payment Processing Fee</span>
            <input
              type="checkbox"
              checked={coverProcessingFee}
              onChange={(e) => setCoverProcessingFee(e.target.checked)}
            />
          </label>

          <label className={styles.toggleRow}>
            <span>Auto-generate Invoice</span>
            <input
              type="checkbox"
              checked={autoGenerateInvoice}
              onChange={(e) => setAutoGenerateInvoice(e.target.checked)}
            />
          </label>

          <label className={styles.toggleRow}>
            <span>Allow Document to Expire</span>
            <input
              type="checkbox"
              checked={expirationEnabled}
              onChange={(e) => setExpirationEnabled(e.target.checked)}
            />
          </label>
        </div>

        {/* Notes */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Notes for Client</div>
          <textarea
            className={styles.textarea}
            placeholder="Add notes for your client"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Client Picker Modal */}
      {showClientPicker && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>Select Client</div>
              <button
                className={styles.modalClose}
                onClick={() => setShowClientPicker(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {clients.length === 0 && (
                <div className={styles.emptyText}>No clients yet.</div>
              )}

              {clients.map((client) => (
                <button
                  key={client.id}
                  className={styles.clientListItem}
                  onClick={() => {
                    setClientId(client.id);
                    setSelectedClient(client);
                    setShowClientPicker(false);
                  }}
                >
                  <div className={styles.clientName}>{client.name}</div>
                  <div className={styles.clientSub}>
                    {client.phone || client.email || ""}
                  </div>
                </button>
              ))}

              {!showNewClientForm && (
                <button
                  className={styles.addClientInline}
                  onClick={() => setShowNewClientForm(true)}
                >
                  + Add New Client
                </button>
              )}

              {showNewClientForm && (
                <div className={styles.newClientForm}>
                  <input
                    className={styles.input}
                    placeholder="Client name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                  />
                  <input
                    className={styles.input}
                    placeholder="Phone"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                  />
                  <input
                    className={styles.input}
                    placeholder="Email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                  />
                  <input
                    className={styles.input}
                    placeholder="Address"
                    value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                  />

                  <button
                    className={styles.saveClientButton}
                    onClick={handleSaveNewClient}
                  >
                    Save Client
                  </button>
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