import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
} from "@react-pdf/renderer";

const COLORS = {
  navy: "#0b1630",
  gold: "#d4a048",
  green: "#2ecc71",
  gray: "#666",
  lightGray: "#f5f5f5",
};

const formatCurrency = (value: number | string) => {
  const num = Number(value || 0);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
};

const formatDate = (date?: string) => {
  if (date) return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
    color: COLORS.navy,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: `1px solid ${COLORS.gold}`,
  },
  companyName: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.navy,
    marginBottom: 8,
  },
  companyDetails: {
    fontSize: 9,
    color: COLORS.gray,
    marginBottom: 2,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.gold,
    textAlign: "right",
    marginBottom: 8,
  },
  invoiceNumber: {
    fontSize: 9,
    color: COLORS.gray,
    textAlign: "right",
  },
  clientSection: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: COLORS.lightGray,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
    textTransform: "uppercase",
    color: COLORS.navy,
  },
  clientName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.navy,
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
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 20,
    backgroundColor: "#f0f7ff",
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.gold,
  },
  signatureBox: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navy,
    width: 200,
    marginTop: 10,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: COLORS.gray,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 10,
  },
});

export default function InvoicePDF({ invoice, client, items, payments, signature }) {
  const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const remainingBalance = (invoice?.total || 0) - totalPaid;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>One Square Roof LLC</Text>
            <Text style={styles.companyDetails}>Charlotte, North Carolina</Text>
            <Text style={styles.companyDetails}>Phone: (704) 303-4112</Text>
            <Text style={styles.companyDetails}>Email: onesquareroof@gmail.com</Text>
          </View>
          <View>
            <Text style={styles.documentTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>Invoice #{invoice?.invoice_number || invoice?.id?.slice(0, 8)}</Text>
            <Text style={styles.invoiceNumber}>Date: {formatDate(invoice?.created_at)}</Text>
            {invoice?.due_date && (
              <Text style={styles.invoiceNumber}>Due Date: {formatDate(invoice.due_date)}</Text>
            )}
          </View>
        </View>

        <View style={styles.clientSection}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={styles.clientName}>{client?.name || "Client Name"}</Text>
          {client?.phone && <Text style={styles.companyDetails}>Phone: {client.phone}</Text>}
          {client?.email && <Text style={styles.companyDetails}>Email: {client.email}</Text>}
          {client?.address && <Text style={styles.companyDetails}>Address: {client.address}</Text>}
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colItem]}>Item</Text>
          <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
          <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
          <Text style={[styles.tableHeaderText, styles.colPrice]}>Unit Price</Text>
          <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
        </View>

        {items?.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            <Text style={styles.colItem}>{item.name || "-"}</Text>
            <Text style={styles.colDescription}>{item.description || "-"}</Text>
            <Text style={[styles.colQty, { textAlign: "center" }]}>{item.quantity || 0}</Text>
            <Text style={[styles.colPrice, { textAlign: "right" }]}>{formatCurrency(item.unit_price || 0)}</Text>
            <Text style={[styles.colTotal, { textAlign: "right" }]}>{formatCurrency(item.total || 0)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={{ fontWeight: "bold" }}>TOTAL DUE</Text>
          <Text style={styles.totalAmount}>{formatCurrency(remainingBalance)}</Text>
        </View>

        {totalPaid > 0 && (
          <View style={{ marginTop: 10, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 9, color: COLORS.green }}>
              Amount Paid: {formatCurrency(totalPaid)}
            </Text>
          </View>
        )}

        {signature && (
          <View style={styles.signatureBox}>
            <Text style={styles.sectionTitle}>Customer Signature</Text>
            {signature.type === "type" ? (
              <Text style={{ fontSize: 12, marginTop: 5 }}>Signed by: {signature.value}</Text>
            ) : (
              <Text style={{ fontSize: 10 }}>[Electronic signature on file]</Text>
            )}
            <Text style={{ fontSize: 8, marginTop: 5 }}>Date: {formatDate(signature.date)}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>Thank you for your business! • Payment is due upon receipt unless otherwise specified</Text>
        </View>
      </Page>
    </Document>
  );
}