## 1. Frontend — Settings Page

- [x] 1.1 Add a "Project Identity" card at the top of the settings page with editable fields for project name (title) and slug
- [x] 1.2 Wire title and slug fields to the existing PUT `/api/projects/:id` endpoint with inline save (on blur or enter)
- [x] 1.3 Auto-regenerate slug suggestion when title changes (user can override)
- [x] 1.4 Remove spinner buttons from the MCP Items Per Page number input via CSS (`appearance: textfield` / `::-webkit-inner-spin-button` hidden) or by switching to `type="text"` with `inputMode="numeric"`
- [x] 1.5 Validate slug format client-side (lowercase alphanumeric + hyphens, min 2 chars)
