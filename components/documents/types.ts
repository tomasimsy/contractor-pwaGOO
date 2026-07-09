export interface Document {
  id: string;
  title: string;
  description?: string;
  category: string;
  file_name: string;
  file_url: string;
  file_size?: number;
  uploaded_by?: string;
  uploaded_at: string;
  updated_at: string;
}