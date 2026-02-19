# Meta Embedded Signup - Setup Guide

> **PR-13**: WhatsApp Channel Onboarding via Meta Embedded Signup OAuth Flow

This guide covers the setup for merchant self-service WhatsApp channel onboarding using Meta's Embedded Signup feature.

## Prerequisites

- A Meta (Facebook) Developer Account
- A Meta App with WhatsApp Business Platform access
- Access to Meta Business Manager

## 1. Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Navigate to "My Apps" → "Create App"
3. Select "Business" as the app type
4. Fill in app details and create the app

## 2. Enable WhatsApp Business Platform

1. In your app dashboard, go to "Add Products"
2. Find "WhatsApp" and click "Set Up"
3. Complete the WhatsApp Business Platform setup wizard

## 3. Configure Embedded Signup

### 3.1 Create Configuration

1. In your app dashboard, go to **WhatsApp → API Setup → Embedded Signup**
2. Click "Create Configuration"
3. Configure the following settings:
   - **Name**: Your configuration name (e.g., "Production Onboarding")
   - **Permissions**: Enable the following:
     - `whatsapp_business_management`
     - `whatsapp_business_messaging`
   - **Fields**: Select the phone numbers field

4. Click "Create" and note down your **Configuration ID**

### 3.2 Get App Credentials

1. Go to **Settings → Basic** in your app dashboard
2. Note down:
   - **App ID**
   - **App Secret** (click "Show" to reveal)

## 4. Configure Environment Variables

Add the following to your `.env` file:

```bash
# PR-13: Meta Embedded Signup (WhatsApp Channel Onboarding)
META_APP_ID="your-meta-app-id"
META_APP_SECRET="your-meta-app-secret"
META_CONFIG_ID="your-config-id"
META_REDIRECT_URI="https://yourdomain.com/onboarding/whatsapp/callback"
```

**Important Notes:**

- `META_REDIRECT_URI` must be the **complete callback URL** including protocol and path
- This URL must be added to your Meta App's redirect URI allowlist (see next section)
- For development, you can use `http://localhost:3000/onboarding/whatsapp/callback`

## 5. Configure OAuth Redirect URIs in Meta App

1. Go to your app dashboard → **Settings → Basic**
2. Scroll to **"OAuth Redirect URIs"** (or add under Products → Facebook Login → Settings)
3. Click "Add Platform" → "Website"
4. Add your callback URL:
   - Production: `https://yourdomain.com/onboarding/whatsapp/callback`
   - Development: `http://localhost:3000/onboarding/whatsapp/callback`
5. Save changes

## 6. Webhook Configuration

The onboarding flow will automatically subscribe webhooks for the connected WhatsApp Business Account. Ensure your webhook endpoint is configured:

1. In your app dashboard, go to **WhatsApp → Configuration → Webhook Configuration**
2. Set **Callback URL**: `https://yourdomain.com/webhooks/whatsapp`
3. Set **Verify Token**: Your `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value
4. Subscribe to webhook fields:
   - `messages`
   - `message_status` (optional for delivery receipts)

## 7. Test the Flow

### 7.1 Start Development Server

```bash
pnpm dev
```

### 7.2 Initiate OAuth Flow

1. Ensure you have a merchant session (authenticated via `/auth/google` or `/auth/microsoft`)
2. Navigate to: `http://localhost:3000/onboarding/whatsapp/start`
3. You should be redirected to Meta's OAuth consent screen
4. Authorize the app and select a WhatsApp Business Account
5. You'll be redirected back to `/dashboard?status=success&channelId=...`

### 7.3 Verify Channel Creation

Check the database:

```sql
SELECT id, merchant_id, type, external_id, waba_id, status, webhook_subscribed
FROM channels
WHERE type = 'WHATSAPP'
ORDER BY created_at DESC
LIMIT 1;
```

Expected result:
- `status`: `connected`
- `webhook_subscribed`: `true`
- `waba_id`: Your WABA ID

## 8. Troubleshooting

### State Mismatch (403 Forbidden)

**Issue**: Callback returns 403 with "Invalid state parameter (CSRF protection)"

**Causes**:
- Cookie `meta_oauth_state` expired (5 min TTL)
- Browser blocked cookies (sameSite/secure settings)
- Multiple OAuth flows started simultaneously

**Solution**:
- Restart the flow from `/onboarding/whatsapp/start`
- Check browser console for cookie warnings
- Ensure `NODE_ENV=production` sets `secure: true` for cookies

### Phone Number Already Connected (409 Conflict)

**Issue**: Callback returns 409 with "Phone number already connected to another merchant"

**Cause**: The `phone_number_id` is already linked to a different merchant

**Solution**:
- Use a different WhatsApp number
- Or disconnect the number from the other merchant first

### Webhook Subscription Failed

**Issue**: Channel created with `webhook_subscribed: false` and `status_reason` contains error

**Causes**:
- Invalid `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Webhook URL not reachable from Meta servers
- Incorrect permissions on WABA

**Solution**:
1. Check webhook configuration in Meta App Dashboard
2. Ensure your server is publicly accessible (use ngrok for local dev)
3. Use the retry endpoint: `POST /onboarding/whatsapp/:channelId/subscribe-webhook`

### Retry Webhook Subscription

If webhook subscription failed during onboarding, you can manually retry:

```bash
curl -X POST "http://localhost:3000/onboarding/whatsapp/{channelId}/subscribe-webhook" \
  -H "Cookie: session_id=your-session-id"
```

**Note**: This endpoint is rate-limited to 5 requests per minute per merchant.

## 9. Production Checklist

Before going to production, ensure:

- [ ] `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` are set in production environment
- [ ] `META_REDIRECT_URI` points to your production callback URL
- [ ] Production callback URL is added to Meta App's OAuth Redirect URIs allowlist
- [ ] Webhook URL is publicly accessible and configured in Meta App Dashboard
- [ ] `NODE_ENV=production` is set (enables `secure: true` for cookies)
- [ ] `AUTH_REDIRECT_URL` is set to your production domain
- [ ] SSL/TLS certificate is valid for your domain
- [ ] Rate limiting is configured appropriately (default: 5 req/min per merchant)

## 10. Security Considerations

### Anti-CSRF Protection

The flow uses a `state` parameter stored in an httpOnly cookie with 5-minute TTL. This prevents:
- Cross-Site Request Forgery (CSRF) attacks
- Replay attacks (expired state cookies)

### Credentials Storage

Channel credentials (`accessToken`, `wabaId`, `phoneNumberId`, `appSecret`) are stored in the `credentials` JSON field. 

**TODO**: Encrypt credentials at rest using a key management service (planned for future PR).

### Rate Limiting

The retry webhook endpoint is rate-limited to prevent abuse:
- **Limit**: 5 requests per minute per merchant
- **Scope**: Per merchant (not global)
- **Response**: 429 Too Many Requests if limit exceeded

## 11. API Reference

### Endpoints

#### `GET /onboarding/whatsapp/start`

**Auth**: Required (SessionAuthGuard)

**Response**: 302 redirect to Meta OAuth URL

**Cookies Set**:
- `meta_oauth_state`: UUID v4, httpOnly, sameSite=lax, 5min TTL

---

#### `GET /onboarding/whatsapp/callback`

**Auth**: Required (SessionAuthGuard)

**Query Parameters**:
- `code` (string): Authorization code from Meta
- `state` (string): State parameter for CSRF protection

**Success**: 302 redirect to `/dashboard?status=success&channelId={id}`

**Errors**:
- `403 Forbidden`: State mismatch (CSRF protection)
- `409 Conflict`: Phone number already connected to another merchant
- `302 redirect`: Other errors (invalid code, WABA fetch failed) → `/dashboard?status=error&reason={reason}`

---

#### `POST /onboarding/whatsapp/:channelId/subscribe-webhook`

**Auth**: Required (SessionAuthGuard)

**Rate Limit**: 5 requests per minute per merchant

**Response**:
```json
{
  "success": true,
  "message": "Webhook subscription successful"
}
```

**Errors**:
- `403 Forbidden`: Channel not owned by merchant
- `404 Not Found`: Channel not found
- `429 Too Many Requests`: Rate limit exceeded

---

## 12. Further Reading

- [Meta Embedded Signup Documentation](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [OAuth 2.0 Authorization Code Flow](https://oauth.net/2/grant-types/authorization-code/)

---

**Last Updated**: PR-13  
**Next Steps**: See PR-14 for Channel Health + Status Management (auto-healing, diagnostics)
