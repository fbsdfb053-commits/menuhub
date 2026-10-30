# Menuhub WhatsApp QR bridge (non-official test integration)

This service links a WhatsApp account using the WhatsApp Web protocol via Baileys. It is **not an official Meta API integration**; WhatsApp may log out the session or restrict the number. Use a test number and follow WhatsApp's terms. The bridge handles QR/session, inbound auto-replies, and customer order notifications when the restaurant owner enables the bot in Menuhub. It recognizes common keywords for menu, opening hours, and payment; menu requests return currently available products from Supabase. When a new order is created, it sends the customer a receipt with items, quantities, prices, total, payment method, delivery/pickup details, observations, and change information when available. It also sends a message when the order status changes, using the configured templates where available and a generic update for other statuses.

## Temporary free Render test

The root `render.yaml` is currently configured for Render's free web service so the integration can be tested without paying. The free service may sleep after inactivity, and its local filesystem is ephemeral. Therefore, WhatsApp session credentials saved under `/tmp/whatsapp-sessions` can be lost after a restart or redeploy, requiring the QR pairing again. This setup is for initial testing only and is **not reliable for continuous customer support**. Do not rely on it for business-critical messages.

Do not deploy this process as a Vercel Function. Use one running instance initially.

Required environment variables on the bridge host:
- `SUPABASE_URL`: the exact Supabase project URL used by the Menuhub **test/preview** frontend.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key from that same project, server-side only. Never expose it in the frontend. The bridge uses this key to validate the Menuhub session and verify restaurant ownership; if either value points to another project, authorization will fail.
- `WHATSAPP_AUTH_DIR=/tmp/whatsapp-sessions` for temporary free testing; a persistent host should use a directory on its persistent disk, e.g. `/data/whatsapp-sessions`.
- `PORT`: set by the host, usually automatically.

Restrict access to this service to HTTPS. The bridge validates each request's Supabase bearer token and checks that the authenticated user owns the selected restaurant. It now returns distinct errors for expired/mismatched sessions, missing restaurants, and ownership mismatches instead of hiding them behind one generic message.

## Connect the frontend

Set `VITE_WHATSAPP_BRIDGE_URL` in the Menuhub **test/preview** environment to the public HTTPS base URL of this service, without a trailing slash, then redeploy the test branch. After changing this variable in Vercel, a new Preview deployment is required for Vite to include it in the frontend build. The QR appears inside Admin > Bot do WhatsApp. Scan it on the phone in WhatsApp > Linked devices > Link a device. Each restaurant has its own session, stored by restaurant ID. The bridge also stores a private phone-to-restaurant binding in `whatsapp_bot_connections`; the same WhatsApp number cannot be linked to two restaurants. Logging out releases that number.

## Important

- QR/session data is sensitive. Do not share screenshots of the QR.
- The auth folder contains credentials that can link to the WhatsApp account; protect them.
- Logging out in the Menuhub panel deletes this bridge's local session files. You can also unlink the device from WhatsApp on the phone.
- Use a separate test number first. The bot replies only to direct incoming text messages (not groups/status messages), only when the saved `enabled` setting is on, and uses the saved welcome/menu/hours/payment texts. Test with a few trusted contacts before relying on it for customers.
- Replies are basic keyword-based rules, not an AI agent; unknown messages receive the welcome message. The current duplicate guard and rate limit are in-memory and reset when the service restarts.
- Order notifications use Supabase Realtime on `public.pedidos` and the `whatsapp_status_enviados` table for persistent deduplication. The database must have the `notificacoes_pedidos_realtime` migration applied and the unique `(pedido_id, status)` index on `whatsapp_status_enviados`.
