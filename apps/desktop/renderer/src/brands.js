// 0.7.30: the apps' own logos (Simple Icons, CC0 drawings; the marks belong to their companies and only show which
// app is meant). Brands that do not allow their logo there (and custom apps) keep letters.
export const BRAND_ICONS = new Set(["asana", "atlassian", "box", "figma", "github", "gmail", "googlecalendar", "googledocs", "googledrive", "googlesheets", "hostinger", "hubspot", "intercom", "kleinanzeigen", "linear", "malwarebytes", "miro", "netlify", "notion", "paypal", "posthog", "railway", "render", "sentry", "shopify", "spotify", "square", "stripe", "supabase", "typeform", "vercel", "webflow", "wix", "zoom"]);
export const brandIcon = (slug) => (slug && BRAND_ICONS.has(slug) ? `./brands/${slug}.svg` : "");
