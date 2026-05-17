export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
};

export type LineItem = {
  id: string;
  category: "Material" | "Labor" | "Other";
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  taxable: boolean;
  total: number;
};

export type Project = {
  id: string;
  name: string;
  line_items: LineItem[];
};

export type Estimate = {
  id: string;
  client_id: string;
  estimate_number?: string;  // Add this line (optional since old estimates may not have it)
  description: string | null;
  notes: string | null;
  subtotal: number;
  markup: number;
  discount: number;
  tax_rate: number;
  total: number;
  deposit_amount: number;
  deposit_paid: boolean;
  status: "pending" | "approved" | "converted";
  signature: Signature | null;
  created_at: string;
  clients?: Client;
};

export type Invoice = {
  id: string;
  estimate_id: string | null;
  client_id: string;
  invoice_number: string;
  description: string | null;
  notes: string | null;
  subtotal: number;
  markup: number;
  discount: number;
  tax: number;
  total: number;
  deposit_amount: number;
  deposit_paid: boolean;
  amount_paid: number;
  remaining_balance: number;
  status: "pending" | "signed" | "paid" | "partial";
  signature: Signature | null;
  issue_date: string;
  due_date: string;
  created_at: string;
  clients?: Client;
};

export type Signature = {
  type: "draw" | "type";
  value: string;
  date: string;
};