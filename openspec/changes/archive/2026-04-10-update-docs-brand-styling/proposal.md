# Change: Align docs site visual identity with archmax marketing website

## Why

The documentation site (`apps/docs`) uses Starlight's default indigo accent and generic gray scale, which looks disconnected from the marketing website at `archmax_website`. The fonts (Geist Sans/Mono) are declared in CSS variables but never loaded, so visitors see system fonts. Aligning the visual identity builds trust and recognition as users move between the website and docs.

## What Changes

- **Accent palette**: Replace indigo accents with the website's hue-257° purple for both light and dark modes
- **Gray scale**: Tint Starlight's gray tokens with a subtle 257° purple hue for both themes, following Starlight's light/dark flip architecture
- **Font loading**: Bundle Geist Sans and Geist Mono variable woff2 files as self-hosted static assets with `@font-face` declarations
- **Typography**: Add `tracking-tight` (`letter-spacing: -0.025em`) to content headings matching the website's heading style
- **Content links**: Subtle underline with accent color and smooth hover transitions
- **Rounded UI**: Code blocks, asides, and inline code with rounded corners matching the website's `rounded-xl` pattern; hero CTA buttons as pills (`rounded-full`)
- **Code blocks**: Expressive Code configured with `borderRadius: 0.75rem`

## Impact

- Affected specs: `documentation-site`
- Affected code: `apps/docs/src/styles/custom.css`, `apps/docs/astro.config.mjs`, `apps/docs/public/fonts/`
