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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: "1px solid #ccc",
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
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
    textAlign: "right",
    marginBottom: 8,
  },
  documentNumber: {
    fontSize: 9,
    color: "#666",
    textAlign: "right",
  },
  clientSection: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#f5f5f5",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
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
  colItem: { width: "30%", fontSize: 9 },
  colDescription: { width: "40%", fontSize: 9 },
  colQty: { width: "10%", fontSize: 9, textAlign: "center" },
  colPrice: { width: "10%", fontSize: 9, textAlign: "right" },
  colTotal: { width: "10%", fontSize: 9, textAlign: "right" },
  totalRow: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#f0f7ff",
    alignItems: "flex-end",
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: "bold",
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
});

export default function InvoicePDF({ invoice, client, items }: any) {
  const subtotal = items?.reduce((sum: number, item: any) => sum + (item.total || 0), 0) || 0;

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
            <Text style={styles.documentNumber}>{invoice?.invoice_number || invoice?.id?.slice(0, 8)}</Text>
            <Text style={styles.documentNumber}>Date: {new Date(invoice?.created_at).toLocaleDateString()}</Text>
            {invoice?.due_date && (
              <Text style={styles.documentNumber}>Due: {new Date(invoice.due_date).toLocaleDateString()}</Text>
            )}
          </View>
        </View>

        <View style={styles.clientSection}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={styles.clientName}>{client?.name || "Client Name"}</Text>
          {client?.phone && <Text style={styles.clientDetails}>Phone: {client.phone}</Text>}
          {client?.email && <Text style={styles.clientDetails}>Email: {client.email}</Text>}
          {client?.address && <Text style={styles.clientDetails}>Address: {client.address}</Text>}
        </View>

        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colItem]}>Item</Text>
            <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>Price</Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
          </View>

          {items?.map((item: any) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.colItem}>{item.name || "-"}</Text>
              <Text style={styles.colDescription}>{item.description || "-"}</Text>
              <Text style={styles.colQty}>{item.quantity || 0}</Text>
              <Text style={styles.colPrice}>${(item.unit_price || 0).toFixed(2)}</Text>
              <Text style={styles.colTotal}>${(item.total || 0).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalAmount}>Total Due: ${subtotal.toFixed(2)}</Text>
        </View>

        {invoice?.signature && (
          <View style={{ marginTop: 30 }}>
            <Text style={styles.sectionTitle}>Customer Signature</Text>
            <View style={{ borderBottomWidth: 1, borderBottomColor: "#000", width: 200, marginTop: 10 }} />
            <Text style={{ fontSize: 8, marginTop: 5 }}>
              Signed on {new Date(invoice.signature.date).toLocaleDateString()}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>Thank you for your business!</Text>
        </View>
      </Page>
    </Document>
  );
}