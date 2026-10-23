# Member Care reference style and church photos

This update changes Home Cell presentation and local assets only. Database functions, migration 011, roles, workflows and existing Member Care behavior remain unchanged.

## Reference styling

The latest user instruction sets **#000956 as the default navy**, applied to the page canvas, sidebar, header, mobile navigation and login. Other tones follow the supplied Member Care screenshot:

- Page canvas: `#000956`
- Card surfaces: `#0F0F59`
- Sidebar: `#000956`
- Top bar and input background: `#000956`
- Raised controls: `#1C1C6B`
- Borders: `#303077`
- Primary red: `#E51B25`
- Text: `#F5F5FF`; muted labels: `#B9B9DB`

Anton display headings and Poppins interface/body text reuse the project's existing local fonts. The new reference theme defaults to dark. Light mode remains available through the theme toggle, with its choice stored independently of Member Care. Existing functional text and real database records are preserved; the screenshot's test-guest name and sample values are not hardcoded into operational screens.

## Hardcoded local photographs

Original image bytes are copied into `public/home-cell/photos`. CSS controls their displayed framing and overlays; no faces or image pixels were regenerated or retouched. They are decorative church photographs, not leadership avatars or identity records.

| Local file | Uploaded source | Placement |
| --- | --- | --- |
| `fellowship.jpg` | `IMG_9987.jpg.jpeg` | Login, overview, area/cell and settings banners |
| `community.jpg` | `756339084_1482811813874259_8375845873415068073_n(1).jpg` | Members banner and area cards |
| `welcome.jpg` | `825292073_1043240605206263_8042547471489530795_n.jpg` | Visitor-registration banner |
| `worship.jpg` | `800115247_1598727721634024_4182530065518534656_n.jpg` | Attendance/communications banners and sidebar supporting panel |
| `prayer.jpg` | `755296968_1482732490548858_8838661965983553057_n.jpg` | Reporting, finances and leadership banners |

## Install

Extract this updated project and retain your existing `.env.local`. From the project folder:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000/home-cell`. Since you already applied migration 011 successfully, **no further SQL is required for this visual update**.

Main changed files: `HomeCellWorkspace.tsx`, `workspace.css`, Home Cell login `page.tsx`/`login.css`, the five local photo assets and the browser test's reference-colour assertions. Read `HOME_CELL_STAGE3.md` for unchanged workflow setup and live deployment limits.
