# Auto Prime Conversions API

Worker que recebe o evento `Lead` do simulador, envia à Meta Conversions API,
aciona os webhooks configurados e arquiva cada lead no GitHub.

Os tokens devem existir somente como secrets do Cloudflare Worker:

- `META_CAPI_ACCESS_TOKEN`
- `GITHUB_LEADS_TOKEN`
- `LEAD_DESTINATION_WEBHOOK_URLS` (opcional; URLs separadas por vírgula ou quebra de linha)

```bash
npm run worker:types
npx wrangler secret put META_CAPI_ACCESS_TOKEN --config cloudflare/autoprime-conversions-api/wrangler.jsonc
npx wrangler secret put GITHUB_LEADS_TOKEN --config cloudflare/autoprime-conversions-api/wrangler.jsonc
npx wrangler secret put LEAD_DESTINATION_WEBHOOK_URLS --config cloudflare/autoprime-conversions-api/wrangler.jsonc
npm run worker:check
npm run worker:deploy
```
