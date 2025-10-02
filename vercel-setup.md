Vercel deployment notes for this minimal Shopify OAuth + webhook scaffold

1. Commit and push

- Commit the new `api/` and `lib/` files to your repository and push to GitHub.

2. Import into Vercel

- Go to https://vercel.com/new and import your repository.

3. Set Environment Variables (Project > Settings > Environment Variables)

- SHOPIFY_API_KEY: your app's API key
- SHOPIFY_API_SECRET: your app's secret
- SCOPES: e.g. "write_orders,write_draft_orders,write_products"
- HOST: https://your-app.vercel.app (set this after first deploy if needed)
- SUPABASE_URL: your Supabase project URL
- SUPABASE_KEY: your Supabase service_role key (secure)

4. Deploy and configure Shopify app settings

- After deploy, add the redirect URL in the Shopify Partners dashboard:
  - Redirect URL: <HOST>/api/oauth/callback
  - App URL: <HOST>

5. Test the flow

- Visit: <HOST>/api/oauth/start?shop=your-dev-store.myshopify.com to begin install.
