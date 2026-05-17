"use client";

import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, borderBottom: "1px solid #ccc", paddingBottom: 10 },
  companyName: { fontSize: 18, fontWeight: "bold" },
  documentTitle: { fontSize: 16, fontWeight: "bold", textAlign: "right" },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 5 },
  table: { width: "100%", marginTop: 10 },
  tableHeader: { backgroundColor: "#2c3e50", padding: 6, color: "white" },
  tableRow: { borderBottom: "1px solid #eee", padding: 6 },
  total: { marginTop: 15, textAlign: "right", fontWeight: "bold", fontSize: 14 },
});

export default function InvoicePDF({ invoice, client, items }: any) {
  const subtotal = items?.reduce((s: number, i: any) => s + (i.total || 0), 0) || 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>One Square Roof LLC</Text>
            <Text>Charlotte, NC</Text>
            <Text>(704) 303-4112</Text>
          </View>
          <View>
            <Text style={styles.documentTitle}>INVOICE</Text>
            <Text>{invoice?.invoice_number}</Text>
            <Text>Date: {new Date(invoice?.created_at).toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text>{client?.name}</Text>
          <Text>{client?.address}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text>Item</Text>
            <Text>Qty</Text>
            <Text>Price</Text>
            <Text>Total</Text>
          </View>
          {items?.map((item: any) => (
            <View key={item.id} style={styles.tableRow}>
              <Text>{item.name}</Text>
              <Text>{item.quantity}</Text>
              <Text>${(item.unit_price || 0).toFixed(2)}</Text>
              <Text>${(item.total || 0).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.total}>
          <Text>Total: ${subtotal.toFixed(2)}</Text>
        </View>
      </Page>
    </Document>
  );
}