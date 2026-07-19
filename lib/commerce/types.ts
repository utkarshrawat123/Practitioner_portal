export interface CatalogProduct {
  id: string;
  title: string;
  imageUrl: string;
  price: number; // GBP major units
  currency: 'GBP';
}

export interface DraftOrderItem {
  productRef: string;
  title: string;
  unitPrice: number;
  qty: number;
}

export interface DraftOrderInput {
  token: string;
  patientName: string;
  patientEmail: string | null;
  items: DraftOrderItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  practitionerId: number;
}

export interface DraftOrderResult {
  externalId: string;
  payUrl: string;
}
