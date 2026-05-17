"use client";

import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  // Header styles
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  companySection: {
    flex: 1,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  companyDetails: {
    fontSize: 9,
    color: "#666",
    marginBottom: 2,
  },
  estimateSection: {
    textAlign: "right",
  },
  estimateTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  estimateNumber: {
    fontSize: 10,
    color: "#666",
  },
  estimateDate: {
    fontSize: 10,
    color: "#666",
  },
  // Section styles
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    backgroundColor: "#f0f0f0",
    padding: 4,
  },
  // Customer info
  customerRow: {
    marginBottom: 4,
  },
  label: {
    fontWeight: "bold",
    width: 70,
  },
  // Table styles
  table: {
    width: "100%",
    marginTop: 10,
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2c3e50",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeaderText: {
    color: "white",
    fontSize: 9,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  colItem: { width: "30%", fontSize: 9 },
  colDescription: { width: "35%", fontSize: 9 },
  colQty: { width: "10%", fontSize: 9, textAlign: "center" },
  colPrice: { width: "12%", fontSize: 9, textAlign: "right" },
  colTotal: { width: "13%", fontSize: 9, textAlign: "right" },
  // Summary box
  summaryBox: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryLabel: {
    fontWeight: "bold",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    fontWeight: "bold",
  },
  // Project summary table
  projectSummaryRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  colProjectName: { width: "70%", fontSize: 10 },
  colProjectTotal: { width: "30%", fontSize: 10, textAlign: "right" },
  // Signature section
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 20,
  },
  signatureBlock: {
    width: "45%",
  },
  signatureLine: {
    marginTop: 30,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    width: "100%",
  },
  signatureLabel: {
    marginTop: 4,
    fontSize: 9,
    textAlign: "center",
  },
  // Deposit acknowledgment
  acknowledgmentBox: {
    marginTop: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#f9f9f9",
  },
  acknowledgmentTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
  },
  acknowledgmentText: {
    fontSize: 9,
    marginBottom: 10,
    lineHeight: 1.4,
  },
  signatureLineWithLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  signatureFieldLabel: {
    width: "30%",
    fontSize: 9,
  },
  signatureFieldLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    marginLeft: 5,
  },
  // Terms section
  termsSection: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
  },
  termsTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
  },
  termsText: {
    fontSize: 8,
    color: "#666",
    marginBottom: 4,
    lineHeight: 1.3,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#999",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 10,
  },
  projectTotalBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: "#f0f7ff",
    alignItems: "flex-end",
  },
  projectTotalText: {
    fontSize: 10,
    fontWeight: "bold",
  },
});

export type EstimatePdfProps = {
  estimateNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  projectDescription: string;
  items: any[];
  subtotal: number;
  depositAmount: number;
  balanceAmount: number;
  projects: Array<{ name: string; total: number }>;
  termsAndConditions: string;
};

export const EstimateDocument: React.FC<EstimatePdfProps> = (props) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Group items by project
  const projectGroups = props.items.reduce((acc: any, item: any) => {
    const projectName = item.project_name || "Main Project";
    if (!acc[projectName]) {
      acc[projectName] = { items: [], total: 0 };
    }
    acc[projectName].items.push(item);
    acc[projectName].total += item.total || 0;
    return acc;
  }, {});

  const projects = Object.entries(projectGroups).map(([name, data]: any) => ({
    name,
    items: data.items,
    total: data.total,
  }));

  const grandTotal = projects.reduce((sum, p) => sum + p.total, 0);

  return (
    <Document>
      {/* PAGE 1 - Cover Page */}
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companySection}>
            <Text style={styles.companyName}>One Square Roof LLC</Text>
            <Text style={styles.companyDetails}>Charlotte, North Carolina</Text>
            <Text style={styles.companyDetails}>Phone: (704) 303-4112</Text>
            <Text style={styles.companyDetails}>Email: onesquareroof@gmail.com</Text>
          </View>
          <View style={styles.estimateSection}>
            <Text style={styles.estimateTitle}>ESTIMATE</Text>
            <Text style={styles.estimateNumber}>#{props.estimateNumber}</Text>
            <Text style={styles.estimateDate}>Date: {props.date}</Text>
          </View>
        </View>

        {/* Customer Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Information</Text>
          <View style={styles.customerRow}>
            <Text>
              <Text style={styles.label}>Name: </Text>
              {props.customerName}
            </Text>
          </View>
          <View style={styles.customerRow}>
            <Text>
              <Text style={styles.label}>Phone: </Text>
              {props.customerPhone}
            </Text>
          </View>
          <View style={styles.customerRow}>
            <Text>
              <Text style={styles.label}>Address: </Text>
              {props.customerAddress}
            </Text>
          </View>
        </View>

        {/* Project Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Overview</Text>
          <Text>{props.projectDescription || "Detailed scope of work outlined on following pages."}</Text>
        </View>

        {/* Estimate Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estimate Summary</Text>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Estimate Amount:</Text>
              <Text>{formatCurrency(props.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Deposit Required (50%):</Text>
              <Text>{formatCurrency(props.depositAmount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Balance Due Upon Completion:</Text>
              <Text>{formatCurrency(props.balanceAmount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Page 1 of 3</Text>
        </View>
      </Page>

      {/* PAGE 2 - Items Details */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Project Details</Text>

        {projects.map((project, idx) => (
          <View key={idx} style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 8 }}>
              {project.name}
            </Text>

            {/* Items Table */}
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.colItem]}>Item</Text>
                <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
                <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
                <Text style={[styles.tableHeaderText, styles.colPrice]}>Price</Text>
                <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
              </View>

              {project.items.map((item: any, itemIdx: number) => (
                <View key={itemIdx} style={styles.tableRow}>
                  <Text style={styles.colItem}>{item.name || "-"}</Text>
                  <Text style={styles.colDescription}>{item.description || "-"}</Text>
                  <Text style={styles.colQty}>{item.quantity || 0}</Text>
                  <Text style={styles.colPrice}>{formatCurrency(item.unit_price || 0)}</Text>
                  <Text style={styles.colTotal}>{formatCurrency(item.total || 0)}</Text>
                </View>
              ))}
            </View>

            {/* Project Total */}
            <View style={styles.projectTotalBox}>
              <Text style={styles.projectTotalText}>
                Project Total: {formatCurrency(project.total)}
              </Text>
            </View>
          </View>
        ))}

        {/* Initials Section */}
        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Client Approval (Initials)</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Contractor Approval (Initials)</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Page 2 of 3</Text>
        </View>
      </Page>

      {/* PAGE 3 - Summary Page */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Estimate Summary</Text>

        {/* Project Summary Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colProjectName]}>Project Name</Text>
            <Text style={[styles.tableHeaderText, styles.colProjectTotal]}>Total Amount</Text>
          </View>

          {projects.map((project, idx) => (
            <View key={idx} style={styles.projectSummaryRow}>
              <Text style={styles.colProjectName}>{project.name}</Text>
              <Text style={styles.colProjectTotal}>{formatCurrency(project.total)}</Text>
            </View>
          ))}

          <View style={[styles.projectSummaryRow, { backgroundColor: "#f0f0f0", fontWeight: "bold" }]}>
            <Text style={[styles.colProjectName, { fontWeight: "bold" }]}>GRAND TOTAL</Text>
            <Text style={[styles.colProjectTotal, { fontWeight: "bold" }]}>{formatCurrency(grandTotal)}</Text>
          </View>
        </View>

        {/* Deposit & Payment Information */}
        <View style={styles.acknowledgmentBox}>
          <Text style={styles.acknowledgmentTitle}>Deposit & Payment Information</Text>
          <View style={styles.summaryRow}>
            <Text>Deposit Amount (50% due at signing):</Text>
            <Text>{formatCurrency(props.depositAmount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Final Payment (due upon completion):</Text>
            <Text>{formatCurrency(props.balanceAmount)}</Text>
          </View>
        </View>

        {/* Deposit Paid Acknowledgment */}
        <View style={styles.acknowledgmentBox}>
          <Text style={styles.acknowledgmentTitle}>DEPOSIT PAID ACKNOWLEDGMENT</Text>
          <Text style={styles.acknowledgmentText}>
            We, the undersigned, confirm that the deposit amount of {formatCurrency(props.depositAmount)} has been paid.
          </Text>
          <View style={styles.signatureLineWithLabel}>
            <Text style={styles.signatureFieldLabel}>Owner Signature:</Text>
            <View style={styles.signatureFieldLine} />
          </View>
          <View style={styles.signatureLineWithLabel}>
            <Text style={styles.signatureFieldLabel}>Contractor Signature:</Text>
            <View style={styles.signatureFieldLine} />
          </View>
          <View style={styles.signatureLineWithLabel}>
            <Text style={styles.signatureFieldLabel}>Date:</Text>
            <View style={styles.signatureFieldLine} />
          </View>
        </View>

        {/* Final Payment Received Acknowledgment */}
        <View style={styles.acknowledgmentBox}>
          <Text style={styles.acknowledgmentTitle}>FINAL PAYMENT RECEIVED ACKNOWLEDGMENT</Text>
          <Text style={styles.acknowledgmentText}>
            We, the undersigned, confirm that the final payment has been received in full
            and that all work outlined in this agreement has been completed to satisfaction.
          </Text>
          <View style={styles.signatureLineWithLabel}>
            <Text style={styles.signatureFieldLabel}>Owner Signature:</Text>
            <View style={styles.signatureFieldLine} />
          </View>
          <View style={styles.signatureLineWithLabel}>
            <Text style={styles.signatureFieldLabel}>Contractor Signature:</Text>
            <View style={styles.signatureFieldLine} />
          </View>
          <View style={styles.signatureLineWithLabel}>
            <Text style={styles.signatureFieldLabel}>Date:</Text>
            <View style={styles.signatureFieldLine} />
          </View>
        </View>

        {/* Terms & Conditions */}
        <View style={styles.termsSection}>
          <Text style={styles.termsTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>1. This estimate is valid for 30 days from the date issued.</Text>
          <Text style={styles.termsText}>2. A 50% deposit is required to begin work. Remaining balance due upon completion.</Text>
          <Text style={styles.termsText}>3. Any changes or additions to scope must be approved in writing and may incur additional charges.</Text>
          <Text style={styles.termsText}>4. Client is responsible for providing safe access to work areas.</Text>
          <Text style={styles.termsText}>5. By signing below, you agree to all terms and conditions stated in this estimate.</Text>
        </View>

        <View style={styles.footer}>
          <Text>Page 3 of 3</Text>
        </View>
      </Page>
    </Document>
  );
};