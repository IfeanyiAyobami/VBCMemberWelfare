# VBC Member Care v3.9 — two WhatsApp sending methods

This source continues v3.8. It integrates WhatsApp invitations into the existing person's journey. It does not add email/SMS sending, replace the WordPress form, change Home Cell roles or send messages automatically on registration.

## Deploy the source and database

1. On a database already running 019, run all of `supabase/020_whatsapp_dual_sending.sql` in Supabase SQL Editor. If upgrading directly from v3.7.1, first run 018, then 019, then 020. Do not rerun historical 017 afterward.
2. Copy this source into the existing repository, retaining the working environment variables. Run `npm ci`, `npm run test:whatsapp`, `npm run typecheck`, `npm run build`.
3. Commit and push to the Git branch connected to Netlify. The release adds no production dependency. Keep `WHATSAPP_API_ENABLED=false` initially.
4. In Follow-ups, open a person you are assigned to (or use a Coordinator account). Select **WhatsApp invitations** in the person's profile tabs.
5. A Coordinator creates the first invitation. The supplied Sunday flyer is already bundled at `/whatsapp/sunday-invitation.jpg`; it is shown before the text. Use the existing church crest/fonts/themes. The original uploaded flyer is unchanged.

No hosted SQL or real WhatsApp send was performed while preparing this release.

## Staff-assisted sending — available without Meta credentials

Select the invitation and Staff-assisted. Personalize the message, download the flyer, and click Prepare WhatsApp handoff. Then click Open WhatsApp. The signed-in WhatsApp account on that device is the sender; a dashboard link cannot select the church sender account. Staff must use a device/session signed into the intended church line if sending as the church.

The link prepares text only. Staff attach the downloaded flyer in WhatsApp, ideally as the image with the invitation text as its caption, and press Send themselves. The link cannot automatically attach a file or guarantee which contact is selected by a native share sheet, so this release uses an explicit download-and-attach flow. The flyer is first in the dashboard preview.

Preparing/opening WhatsApp is never counted as a sent message. Staff return to record Sent/awaiting reply, Replied/conversation held, or Could not send. Notes and an optional next-contact date are retained. Staff-reported sending does not count as a successful conversation; a reported reply does. Later developments can be added through the existing Record activity form. Saved outcomes are immutable to preserve their audit trail.

Staff-assisted chat contents, delivery/read receipts and replies remain in WhatsApp until staff record the outcome. This method incurs no API messaging fee. It is one person at a time, not unattended bulk sending.

## Official API sending — configure separately

This integration uses Meta's Cloud API directly. It avoids a third-party messaging-provider subscription/markup; Meta messaging charges still apply. API sends in this release are explicit, individual Coordinator actions, not automatic scheduled/bulk campaigns. The default daily cap is 100 dispatch attempts across all staff, measured in Africa/Lagos. Change it deliberately after deciding the church's budget.

Create/configure your Meta business portfolio and WhatsApp Business Account, set up an eligible church sender number and billing, and create a Meta app with the WhatsApp product. Follow the current onboarding instructions in Meta: requirements for existing WhatsApp app numbers/coexistence depend on your account and onboarding path. Do not migrate a working church number without checking that path first.

Use a production system-user access token with access to that WhatsApp account and the `whatsapp_business_messaging` and `whatsapp_business_management` permissions. The latter is needed to check template approval. Retain your existing Supabase server service-role key; it is used only by server routes to persist claims and signed webhook events.

In Netlify, Site configuration → Environment variables, add server-only variables for production:

| Variable | Value |
| --- | --- |
| APP_ORIGIN | `https://welfarevbc.netlify.app` (or the current canonical public site origin) |
| WHATSAPP_GRAPH_VERSION | A supported Graph API version from your Meta app, e.g. the exact `vNN.0` shown there; no guessed version is hardcoded |
| WHATSAPP_PHONE_NUMBER_ID | Meta's numeric Phone Number ID, not the church's actual telephone number |
| WHATSAPP_BUSINESS_ACCOUNT_ID | Numeric WhatsApp Business Account ID (WABA ID) |
| WHATSAPP_ACCESS_TOKEN | Production system-user token |
| WHATSAPP_APP_SECRET | Meta app secret |
| WHATSAPP_VERIFY_TOKEN | Your own random secret, at least 16 characters, for webhook verification |
| WHATSAPP_DAILY_LIMIT | `100` initially; valid range 1–10000 |
| WHATSAPP_API_ENABLED | Keep `false` during setup; set `true` only when ready |

Never prefix these keys with NEXT_PUBLIC_, commit them to Git, or paste them into chat. Redeploy after changing environment variables. Restrict live sending credentials to production; preview deploys should remain disabled.

## Create an approved image template

In WhatsApp Manager create a template for the invitation, using the appropriate category determined by Meta (budget general church programme invitations as marketing).

- Header: **Image**. Use the supplied flyer as the example media during submission.
- Body: copy the exact body entered in the dashboard invitation, including line breaks and punctuation.
- Personalization: either plain text or exactly one positional `{{1}}`, for the person's full central-record name. Named parameters, multiple variables and buttons are not supported in this release.
- Optional footer: static text only.
- Record the exact template name and language code (such as `en` or `en_US`) in the dashboard invitation.

Example body:

```
Hi {{1}},
We would love to see you this Sunday at Vine Branch Church.
Spring Service: 8 AM. Glorious Worship: 10 AM.
No 1, Olubadan Palace Road, off Queen Elizabeth Road, Mokola, Ibadan.
Would you like help with directions?
```

Meta sends the flyer as the image header before the template body. The exact approved body is checked server-side before each send; editing the API invitation text to differ from Meta's approved template is not permitted. The free-text editor is available in staff-assisted mode.

The public flyer URL must load without staff login and be reachable by Meta: `https://welfarevbc.netlify.app/whatsapp/sunday-invitation.jpg`. No person's private information is placed in this public asset. This release bundles the supplied flyer, not a general-purpose upload library. Future flyer versions should use a new versioned asset/campaign rather than silently changing artwork on existing invitation records.

## Configure webhooks

Callback URL: `https://welfarevbc.netlify.app/api/whatsapp/webhook`

Verify token: the exact WHATSAPP_VERIFY_TOKEN you set in Netlify.

Subscribe the Meta app/WABA to the **messages** webhook field so both message statuses and inbound replies are delivered. A verified callback alone is insufficient; ensure the app is subscribed to the actual WhatsApp Business Account and sender number.

The GET challenge validates your verify token. POST events are verified with HMAC-SHA256 over raw bytes using WHATSAPP_APP_SECRET and X-Hub-Signature-256. Only the configured WABA and Phone Number ID are processed. Public webhook requests bypass staff-session refresh but still require signature/account validation for event writes.

Once the subscription, billing and template are ready, enable WHATSAPP_API_ENABLED and redeploy. For a first live test use an explicitly opted-in test recipient, the approved invitation and a small daily cap. Check accepted → sent → delivered/read status and a reply before wider use. This live step was not executed during development.

## Permissions and outcomes

Assigned Follow-through Friends and Coordinators can prepare staff-assisted invitations and record their activities. Only Coordinators can create invitations or trigger paid API sends. Foundation-only access does not expose WhatsApp messages/replies. Current assignments, active staff status and archive status are checked at the database, not only in the interface.

Existing contact opt-outs and paused/inactive/declined outreach block both sending methods. A separate explicit WhatsApp permission record is required for the API. This does not change existing default-on preferences for other channels. Evidence can be recorded in the WhatsApp permission section by authorized staff. A WhatsApp opt-out blocks both modes; re-enabling requires new recorded permission.

API acceptance means Meta accepted the request, not that the recipient received/read it. Delivery/read/failure states come from authenticated provider webhooks and are labelled accordingly. Staff-reported outcomes remain separate. Provider IDs are visible for troubleshooting, not credentials.

Incoming text or button replies are stored privately for the current assigned friend/Coordinator. Unsupported media replies appear as a type label; this release does not download inbound attachments or provide an API reply/chat composer. Only replies from numbers associated with existing API invitation records are matched. Ambiguous shared-number replies are not guessed onto a person. STOP/UNSUBSCRIBE/CANCEL disables WhatsApp outreach; shared-number stop requests conservatively opt out known current matching records. Automated inbound replies/delivery receipts do not by themselves count as a successful care conversation; staff record the assessed care outcome.

Staff-recorded activities feed the existing contact history/reporting. API provider receipts are shown in WhatsApp invitation history; they are not falsely counted as successful follow-up conversations in the standard conversion scoreboard.

## Duplicate prevention and recovery

- Stable request IDs and database claims allow only one caller to submit an invitation.
- Only one unresolved/accepted API attempt per person/campaign is allowed, including across reloads.
- Template approval, permissions, active campaign and current recipient identity are checked before dispatch, then permissions/identity are checked again immediately before the provider POST.
- The original sender can resume an unclaimed Queued request using **Resume paid queued send**. It reuses the original ID and cannot create another provider send after a claim.
- Provider POSTs are never automatically retried.
- Definite pre-acceptance rejection permits an explicit **Review safe retry**, followed by a fresh paid-send confirmation. The previous attempt stays in history.
- Timeouts, malformed success responses or provider 5xx responses leave the result **uncertain** and block another attempt. A valid provider callback can resolve that result later using the message ID/callback correlation. Do not create another campaign as a workaround for an uncertain send.
- If an application process stops after claiming a send, it remains Submitting until a callback resolves it. Check Meta's logs; never infer that no message was sent. This deliberately favors avoiding duplicate charges over automatic recovery.
- Duplicate and out-of-order callbacks cannot downgrade read/delivered evidence or overwrite it with a late HTTP acknowledgement.
- Application audit events retain staff actions. Separate private provider-event records retain verified status/opt-out evidence without falsely attributing automated actions to a human staff account.

No secret or real recipient is required to run the local tests. The test provider is simulated and no outbound WhatsApp message is sent.
