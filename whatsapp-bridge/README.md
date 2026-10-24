# Menuhub WhatsApp QR bridge (non-official test integration)

This service links a WhatsApp account using the WhatsApp Web protocol via Baileys. It is **not an official Meta API integration**; WhatsApp may log out the session or restrict the number. Use a test number and follow WhatsApp's terms. This bridge currently handles connection/QR/session only; it does not send automated order-status messages yet.

## Deploy as a persistent Node service
Do not deploy this process as a Vercel Function. It must remain running and have a persistent disk mounted at `/data` (or set `WHATSAPP_AUTH_DIR` to the disk path). Deploy the `whatsapp-bridge` directory as a Docker/Node service on a host that supports persistent volumes, such as a paid persistent service on Render or Railway. Use one running instance initially.

Required environment variables on the bridge host:
- `SUPABASE_URL`: the same Supabase project URL used by the Menuhub test environment.
- `SUPABASE_ANON_KEY`: the Supabase anon/publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key, server-side only. Never expose it in the frontend.
- `WHATSAPP_AUTH_DIR=/data/whatsapp-sessions`
- `PORT`: set by the host, usually automatically.

Mount a persistent disk at `/data`. Restrict access to this service to HTTPS. The bridge validates each request's Supabase bearer token and checks that the authenticated user owns the selected restaurant.

## Connect the frontend
Set `VITE_WHATSAPP_BRIDGE_URL` in the Menuhub **test/preview** environment to the public HTTPS base URL of this service, without a trailing slash, then redeploy the test branch. The QR appears inside Admin > Bot do WhatsApp. Scan it on the phone in WhatsApp > Linked devices > Link a device.

## Important
- QR/session data is sensitive. Do not share screenshots of the QR.
- The auth folder contains credentials that can link to the WhatsApp account; protect the persistent disk and backups.
- Logging out in the Menuhub panel deletes this bridge's local session files. You can also unlink the device from WhatsApp on the phone.
- Use a separate test number. Do not enable order messaging based on this QR connection until a separate messaging implementation, customer opt-in, deduplication, and delivery handling are in place.
