# Existing guest review workflow — v0.6.1

For the working WordPress Gateway connection, start with **[GATEWAY_SETUP.md](GATEWAY_SETUP.md)**. The old HMAC plugin is not part of that setup. The guest queue, review decisions and member relationships below are already implemented.

## Review an incoming or manually saved guest

Use fictional details and an email address you control. No messages are sent.

1. Click **Record a guest card**. Complete the four steps; a Nigerian phone number is required. Birthday and wedding anniversary are optional month/day values such as `02-29` and `11-04`.
2. Select visit/follow-up permission, then independently choose email, SMS and message topics. Record how the choices were confirmed. Click **Save for review**.
3. Refresh. The card should still appear as **Pending review**.
4. Open the card. Check every answer and the choices/evidence. Click **Create visitor record**, then **Confirm creation**. Open the saved member profile and check the permission choices.
5. Record another card with the same phone or email. Open it, select the matching profile, click **Link selected member** and confirm that you checked identity. The existing profile, milestone dates and permission choices must stay unchanged.
6. Archive that profile and submit another matching test card. Creation/linking should be blocked until the profile is restored. **Reject card** requires a reason of at least 10 characters and retains the card in the rejected view.
7. A viewer can read cards but cannot record or review them. An inactive/non-staff account cannot read the queue.

Contact matches are review clues, including shared family contacts. There is no automatic merge. Creating a member with a phone/email already in the directory, including archived members, remains blocked by the database.


Follow-up consent from Gateway v1.1.3 is recorded as true; the five sending choices remain false because that form does not supply them. Record separate permissions/evidence later in the existing member profile controls. No outbound provider jobs are created by intake.
