# Auto Prime Conversions API

Worker que recebe o evento `Lead` do simulador e o envia à Meta Conversions API.

O token `META_CAPI_ACCESS_TOKEN` deve existir somente como secret do Cloudflare Worker.

```bash
npm run worker:types
npx wrangler secret put META_CAPI_ACCESS_TOKEN --config cloudflare/autoprime-conversions-api/wrangler.jsonc
npm run worker:check
npm run worker:deploy
```
