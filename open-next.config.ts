import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// OpenNext Cloudflare adapter config. Defaults are fine for this app — the
// Worker entry is generated at `.open-next/worker.js` by `opennextjs-cloudflare
// build`, and bindings (D1 `DB`, R2 `BUCKET`) come from wrangler.toml.
export default defineCloudflareConfig({});
