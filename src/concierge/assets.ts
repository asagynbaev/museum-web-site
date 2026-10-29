// Copied from ai-concierge/web/src/assets.ts by scripts/export-museum.mjs - edit it there and export again.
// Where the app's static files (worklets, the lip-sync model, avatars, light) are served from: the site root in the
// kiosk, a folder of their own when the concierge is embedded in another site (embed/bars-concierge.ts).
let base = '';

export function setAssetBase(b: string): void {
  base = b.replace(/\/+$/, '');
}

export const asset = (path: string): string => `${base}${path}`;
