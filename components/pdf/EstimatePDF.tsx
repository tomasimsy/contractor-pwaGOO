// components/EstimatePDF.tsx - Simplified version
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
} from "@react-pdf/renderer";

const formatCurrency = (value: number | string) => {
  const num = Number(value || 0);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
};

const formatDate = () => {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a2e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: "1px solid #2c3e50",
  },
  companyName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 8,
  },
  companyDetails: {
    fontSize: 9,
    color: "#666",
    marginBottom: 2,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "right",
    marginBottom: 8,
  },
  documentNumber: {
    fontSize: 9,
    color: "#666",
    textAlign: "right",
  },
  clientSection: {
    marginBottom: 25,
    padding: 15,
    backgroundColor: "#f5f5f5",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
    textTransform: "uppercase",
    color: "#2c3e50",
  },
  clientName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  clientDetails: {
    fontSize: 9,
    color: "#666",
    marginBottom: 2,
  },
  descriptionSection: {
    marginBottom: 25,
  },
  descriptionText: {
    fontSize: 10,
    lineHeight: 1.5,
    marginTop: 5,
    textTransform: "capitalize",
   },
  projectPage: {
    padding: 40,
  },
  projectHeader: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: "1px solid #3498db",
  },
  projectTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2c3e50",
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 15,
    marginBottom: 5,
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "white",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  colItem: { width: "25%", fontSize: 9 },
  colDescription: { width: "35%", fontSize: 9 },
  colQty: { width: "10%", fontSize: 9, textAlign: "center" },
  colPrice: { width: "15%", fontSize: 9, textAlign: "right" },
  colTotal: { width: "15%", fontSize: 9, textAlign: "right" },
  projectTotalBox: {
    marginTop: 15,
    padding: 10,
    backgroundColor: "#f0f7ff",
    alignItems: "flex-end",
  },
  projectTotalAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#3498db",
    marginTop: 4,
  },
  summaryCard: {
    marginTop: 10,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#2c3e50",
  },
  summaryHeaderText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "white",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 10,
    backgroundColor: "#f0f7ff",
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#3498db",
  },
  depositSection: {
    marginTop: 15,
    padding: 15,
    backgroundColor: "#fff8e1",
  },
  depositTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#e67e22",
    marginBottom: 8,
  },
  depositRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  signatureLineWithLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 8,
    width: "30%",
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#2c3e50",
    width: "65%",
    marginLeft: 5,
  },
  termsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  termsTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 10,
  },
  termsText: {
    fontSize: 8,
    color: "#666",
    marginBottom: 4,
    lineHeight: 1.4,
  },
  signatureSection: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBox: {
    width: "45%",
    fontSize: 10
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
 
 
  // FIXED: Project name column with proper width and wrapping
  summaryProjectName: {
    width: "70%",
    fontSize: 10,
    paddingRight: 10,
    flexWrap: "wrap",
  },
  // FIXED: Total amount column with fixed width and right alignment
  summaryProjectTotal: {
    width: "30%",
    fontSize: 10,
    textAlign: "right",
  },
 
 
});

export default function EstimatePDF({ estimate, client, items }) {
  // Group items by project
  const groupedProjects = (items || []).reduce((acc, item) => {
    const name = item.project_name || "Untitled Project";
    if (!acc[name]) {
      acc[name] = { items: [] };
    }
    acc[name].items.push(item);
    return acc;
  }, {});

  const projects = Object.entries(groupedProjects);
  
  const subtotal = projects.reduce((sum, [, p]) => {
    return sum + p.items.reduce((s, i) => s + Number(i.total || 0), 0);
  }, 0);
  
  const depositAmount = estimate.deposit || subtotal * 0.5;
  const balanceDue = subtotal - depositAmount;

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>One Square Roof LLC</Text>
            <Text style={styles.companyDetails}>Charlotte, North Carolina</Text>
            <Text style={styles.companyDetails}>Phone: (704) 303-4112</Text>
            <Text style={styles.companyDetails}>Email: onesquareroof@gmail.com</Text>
          </View>
          <View>
            <Text style={styles.documentTitle}> ESTIMATE</Text>
            <Text style={styles.documentNumber}>Estimate #{estimate.id?.slice(0, 8) || "0000"}</Text>
            <Text style={styles.documentNumber}>Date: {formatDate()}</Text>
          </View>
        </View>

        <View style={styles.clientSection}>
          <Text style={styles.sectionTitle}>Customer Information</Text>
          <Text style={styles.clientName}>{client?.name || "Client Name"}</Text>
          {client?.phone && <Text style={styles.clientDetails}>Phone: {client.phone}</Text>}
          {client?.email && <Text style={styles.clientDetails}>Email: {client.email}</Text>}
          {client?.address && <Text style={styles.clientDetails}>Address: {client.address}</Text>}
        </View>

        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Project Overview</Text>
          <Text style={styles.descriptionText}>
            {estimate.description || "Detailed scope of work outlined in following pages."}
          </Text>
        </View>

        <View style={styles.depositSection}>
          <Text style={styles.depositTitle}>Estimate Summary</Text>
          <View style={styles.depositRow}>
            <Text>Total Estimate Amount</Text>
            <Text>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.depositRow}>
            <Text>Deposit Required (50%)</Text>
            <Text>{formatCurrency(depositAmount)}</Text>
          </View>
          <View style={styles.depositRow}>
            <Text>Balance Due Upon Completion</Text>
            <Text>{formatCurrency(balanceDue)}</Text>
          </View>
        </View>

        {/* <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <Text>Client Signature</Text>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: 8 }}>Date: _____________</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text>Contractor Signature</Text>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: 8 }}>Date: _____________</Text>
          </View>
        </View> */}

        <View style={styles.footer}>
          <Text>Thank you for choosing One Square Roof LLC • Insured</Text>
        </View>
      </Page>

      {/* Project Pages */}
      {projects.map(([projectName, projectData], index) => {
        const projectTotal = projectData.items.reduce(
          (sum, item) => sum + Number(item.total || 0),
          0
        );

        return (
          <Page key={projectName} size="A4" style={styles.projectPage}>
            <View style={styles.projectHeader}>
              <Text style={styles.projectTitle}>Project {index + 1}: {projectName}</Text>
            </View>

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colItem]}>Item</Text>
              <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
              <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
              <Text style={[styles.tableHeaderText, styles.colPrice]}>Unit Price</Text>
              <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
            </View>

            {projectData.items.map((item, idx) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={styles.colItem}>{item.name || "-"}</Text>
                <Text style={styles.colDescription}>{item.description || "-"}</Text>
                <Text style={[styles.colQty, { textAlign: "center" }]}>{item.quantity || 0}</Text>
                <Text style={[styles.colPrice, { textAlign: "right" }]}>{formatCurrency(item.unit_price || 0)}</Text>
                <Text style={[styles.colTotal, { textAlign: "right" }]}>{formatCurrency(item.total || 0)}</Text>
              </View>
            ))}

            <View style={styles.projectTotalBox}>
              <Text>Project Total</Text>
              <Text style={styles.projectTotalAmount}>{formatCurrency(projectTotal)}</Text>
            </View>

            <View style={styles.signatureSection}>
              <View style={styles.signatureBox}>
                <Text>Client Approval</Text>
                <View style={styles.signatureLine} />
              </View>
              <View style={styles.signatureBox}>
                <Text>Contractor Approval</Text>
                <View style={styles.signatureLine} />
              </View>
            </View>

            <View style={styles.footer}>
              <Text>Page {index + 2} of {projects.length + 2}</Text>
            </View>
          </Page>
        );
      })}

{/* Summary Page */}
<Page size="A4" style={styles.page}>
  <View style={styles.header}>
    <Text style={styles.documentTitle}>Estimate Summary</Text>
  </View>

  {/* Project Summary Table */}
  <View style={styles.summaryCard}>
    <View style={styles.summaryHeader}>
      <Text style={[styles.summaryHeaderText, { width: "70%" }]}>Project Name</Text>
      <Text style={[styles.summaryHeaderText, { width: "30%", textAlign: "right" }]}>Total Amount</Text>
    </View>

    {projects.map(([projectName, projectData]) => {
      const projectTotal = projectData.items.reduce(
        (sum, item) => sum + Number(item.total || 0),
        0
      );
      return (
        <View key={projectName} style={styles.summaryRow}>
          <Text style={styles.summaryProjectName}>{projectName}</Text>
          <Text style={styles.summaryProjectTotal}>{formatCurrency(projectTotal)}</Text>
        </View>
      );
    })}

    <View style={styles.totalRow}>
      <Text style={{ fontWeight: "bold" }}>GRAND TOTAL</Text>
      <Text style={styles.totalAmount}>{formatCurrency(subtotal)}</Text>
    </View>
  </View>

  {/* Deposit & Payment Information */}
  <View style={styles.depositSection}>
    <Text style={styles.depositTitle}>Deposit & Payment Information</Text>
    <View style={styles.depositRow}>
      <Text>Deposit Amount (50% due at signing):</Text>
      <Text>{formatCurrency(depositAmount)}</Text>
    </View>
    <View style={styles.depositRow}>
      <Text>Final Payment (due upon completion):</Text>
      <Text>{formatCurrency(balanceDue)}</Text>
    </View>

    {/* ========== LINE 1: DEPOSIT PAID ACKNOWLEDGMENT ========== */}
    <View style={{ marginTop: 5, marginBottom: 10 }}>
      <Text style={{ fontWeight: "bold", marginBottom: 6 }}>
        DEPOSIT PAID ACKNOWLEDGMENT
      </Text>
      <Text style={{ fontSize: 9, marginBottom: 8 }}>
        We, the undersigned, confirm that the deposit amount of {formatCurrency(depositAmount)} has been paid.
      </Text>
      <View style={styles.signatureLineWithLabel}>
        <Text style={styles.signatureLabel}>Owner Signature:</Text>
        <View style={styles.signatureLine} />
      </View>
      <View style={styles.signatureLineWithLabel}>
        <Text style={styles.signatureLabel}>Contractor Signature:</Text>
        <View style={styles.signatureLine} />
      </View>
      <View style={styles.signatureLineWithLabel}>
        <Text style={styles.signatureLabel}>Date:</Text>
        <View style={styles.signatureLine} />
      </View>
    </View>
    <View style={{ marginTop: 20, marginBottom: 10 }}>
  <Text style={{ fontWeight: "bold", marginBottom: 6 }}>
    FINAL PAYMENT RECEIVED ACKNOWLEDGMENT
  </Text>

  <Text style={{ fontSize: 9, marginBottom: 8 }}>
    We, the undersigned, confirm that the final payment has been received in full
    and that all work outlined in this agreement has been completed to satisfaction. Any additional work or 
    changes requested after this acknowledgment may be subject to additional charges and will require a new agreement.
  </Text>

  <View style={styles.signatureLineWithLabel}>
    <Text style={styles.signatureLabel}>Owner Signature:</Text>
    <View style={styles.signatureLine} />
  </View>

  <View style={styles.signatureLineWithLabel}>
    <Text style={styles.signatureLabel}>Client Signature:</Text>
    <View style={styles.signatureLine} />
  </View>

  <View style={styles.signatureLineWithLabel}>
    <Text style={styles.signatureLabel}>Date:</Text>
    <View style={styles.signatureLine} />
  </View>
</View>

    {/* ========== LINE 2: FINAL PAYMENT ACKNOWLEDGMENT ========== */}
    <View style={{ marginTop: 5, marginBottom: 2 }}>
      <Text style={{ fontWeight: "bold", marginBottom: 4 }}>
        FINAL PAYMENT
      </Text>
      <Text style={{ fontSize: 9 }}>
        Final payment of {formatCurrency(balanceDue)} is due upon completion of the work.
      </Text>
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

  {/* Signatures */}
  {/* <View style={styles.signatureSection}>
    <View style={styles.signatureBox}>
      <Text>Client Signature</Text>
      <View style={styles.signatureLine} />
      <Text style={{ fontSize: 8 }}> </Text>
      <Text style={{ fontSize: 8 }}>Date: _____________</Text>
    </View>
    
    <View style={styles.signatureBox}>
      <Text>Contractor Signature</Text>
      <View style={styles.signatureLine} />
      <Text style={{ fontSize: 8 }}> </Text>
      <Text style={{ fontSize: 8 }}>Date: _____________</Text>
    </View>
  </View> */}

  <View style={styles.footer}>
    <Text>Thank you for your business! • One Square Roof LLC • (704) 303-4112</Text>
  </View>
</Page>
    </Document>
  );
}