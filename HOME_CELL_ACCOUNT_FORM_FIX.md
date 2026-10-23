# Existing leadership accounts and form retention

This update requires **no new SQL** after migration 011.

## Leader creation

Enter the existing account's email in **Create / assign leader**. The server looks up an exact, case-insensitive email match. If found, it asks you to confirm adding the selected leadership role to that existing account. It reuses the original user ID and does not send another invitation, reset a password, recreate a member or remove current assignments. A new email still receives the standard invitation.

The separate **Assign existing account** option now accepts email; a Supabase UUID is no longer required. Existing server/database role and scope restrictions still apply, including protection against changing your own access. Central member records without an authentication login still need an invitation to establish login credentials.

## Date filters and form values

From/To show full **DD/MM/YYYY** dates. Edit them and press **Apply dates**. Incomplete or impossible dates produce validation feedback rather than reloading the page on every keystroke.

Data refreshes keep the form area mounted. Unsaved named fields are also retained in memory under their cell, meeting or form key, so returning to that context restores the draft. Visitor details and opt-out choices remain while date/area filters change. Drafts are not written to browser storage and are cleared on navigation/reload or successful save. These are temporary unsaved edits, not a replacement for saving a server draft.

## Fellowship selection

A fellowship is a dated home-cell gathering. It groups that gathering's attendance, visitors, finances and weekly report. On **Visitors**, use **Start or open a fellowship**, choose the home cell and date, then continue entering the visitor. There is no need to leave the visitor form for Attendance first. Existing dated fellowships remain selectable. If the date falls outside the current report range, opening the fellowship expands the displayed range to include it.

## Install

Extract the updated ZIP, keep your existing `.env.local`, then run:

```sh
npm ci
npm run dev
```

No migrations were changed. The navy palette, uploaded photos and Member Care application are retained.
