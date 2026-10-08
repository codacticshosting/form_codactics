// Client- and server-safe. Which image formats admins may add to a form
// (logo, background, option pictures…). Deliberately no SVG: an SVG can
// carry script, and form images are served from this site's own domain —
// see the schema-assets route for the headers that also neutralize any
// SVG saved before this rule existed.
export const FORM_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// For <input type="file" accept=…>.
export const FORM_IMAGE_ACCEPT = FORM_IMAGE_MIME_TYPES.join(",");
