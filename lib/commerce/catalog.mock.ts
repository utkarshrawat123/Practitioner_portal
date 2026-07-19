import type { CatalogProduct } from './types';

// Real Wild Nutrition products (public Shopify CDN images) for the demo catalog.
export const MOCK_CATALOG: CatalogProduct[] = [
  { id: 'lions-mane',  title: "Lion's Mane Plus",            price: 39.50, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/A_Lion_s_Mane_PDP_01_2048_x_2048.jpg?v=1784014358' },
  { id: 'high-fibre',  title: 'High Fibre Plus',             price: 28.00, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/A_HighFibrePlus_PDP_01_2048x2048_a519727a-d319-43c1-bb53-479448465a74.jpg?v=1780482452' },
  { id: 'shatavari',   title: 'SRI-81™ Shatavari Plus',      price: 17.00, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/W_Shatavari_PDP_01_2048x2048_d7b38dd6-0a3f-44e2-a57b-5f5496043f50.jpg?v=1775825777' },
  { id: 'magnesium',   title: 'Magnesium',                   price: 20.50, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/A_Magnesium_Trial_PDP_01_2048_x_2048.png?v=1776762418' },
  { id: 'omega-3',     title: 'Omega 3',                     price: 25.00, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/3for2_Omega_PDP_01_2048x2048_7f405c59-f7e0-4d04-9a9b-1f80b5c7f6b3.jpg?v=1782899183' },
  { id: 'ashwagandha', title: 'Ashwagandha',                 price: 24.50, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/A_Ashwagandha_Trial_01_2048x2048_a368e614-b922-49c1-8789-c07db499a1db.jpg?v=1718118580' },
  { id: 'immune',      title: 'Immune Support',              price: 42.00, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/A_Immune_Support_4000_x_5000.webp?v=1769607462' },
  { id: 'menopause',   title: 'Food-Grown® Menopause Complex', price: 39.00, currency: 'GBP', imageUrl: 'https://cdn.shopify.com/s/files/1/0260/7667/6158/files/W_Menopause_Complex_PDP_01_2048_x_2048.jpg?v=1784015111' },
];
