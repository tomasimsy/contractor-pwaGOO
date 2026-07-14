export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  company_id: string | null;
  role: "owner" | "member";
};

export type CompanyInvite = {
  id: string;
  token: string;
  company_id: string;
  invited_by: string | null;
  role: "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
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
  estimate_number?: string;
  title?: string | null;
  description: string | null;
  notes: string | null;
  subtotal: number;
  markup: number;
  discount: number;
  tax_rate: number;
  total: number;
  deposit_amount: number;
  deposit_paid: boolean;
  status: "pending" | "approved" | "converted" | "completed";  // ← Add "completed" here
  signature: Signature | null;
  created_at: string;
  clients?: Client;
  // Tracking fields
  opened_at?: string;
  opened_count?: number;
  opened_device?: string;
  opened_ip?: string;
  view_locations?: any[];
  unique_locations?: number;
  is_completed: boolean;
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
  is_locked?: boolean;
  locked_at?: string | null;
  locked_by?: string | null;
    paid_at?: string | null;        // ✅ Add this
 
};

export type Signature = {
  type: "draw" | "type";
  value: string;
  date: string;
};

 