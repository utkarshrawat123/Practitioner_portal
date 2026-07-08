export interface SyncResult {
  ok: boolean;
  detail: string;
}

export interface AffiliateProvider {
  name: string;
  createAffiliate(input: { code: string; name: string; email: string }): Promise<SyncResult>;
}

export interface EmailProvider {
  name: string;
  sendWelcome(input: {
    name: string;
    email: string;
    code: string;
    link: string;
  }): Promise<SyncResult>;
}
