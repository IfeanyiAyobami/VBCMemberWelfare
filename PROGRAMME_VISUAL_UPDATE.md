# Programme visual update v0.7.1

- Programme cards now use locally packaged illustrative photo graphics inspired by the approved mockup, with overlaid event titles, dates, status and clear action buttons.
- All three demo programme graphics are stored in `public/programme-images/`. For a future real programme, `event.image` may be set to an approved local image path. The existing programme editor remains a demo; uploading programme images is **not** implemented.
- The Overview heading and large date stamp use the live current date in the Africa/Lagos timezone. Birthday/anniversary sample counts use the same live date. The rest of the demo data remains fictional; scheduled campaigns and other hardcoded demo dates are not converted into real scheduled data.
- No changes to WordPress, guest form, Supabase schema, or authentication.
- Test with `npm ci`, `npm run build`, then deploy the modified code via GitHub/Netlify.
