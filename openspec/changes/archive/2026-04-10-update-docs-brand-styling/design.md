## Context

The archmax marketing website (`archmax_website`) has a defined visual identity:
- **Accent hue**: 257° purple on secondary, accent, and ring tokens
- **Grays**: Pure neutral (hue 0°) for all backgrounds, borders, and text
- **Typography**: Geist Sans + Geist Mono, `tracking-tight` on headings, `font-semibold` weight
- **Patterns**: `rounded-full` CTAs and active states, `rounded-xl` cards/containers, borderless cards with white background in light mode
- **Logo**: Black or white text, semi-bold weight

The docs site (`apps/docs`) uses Astro Starlight 0.38.x with its own token system (`--sl-color-*`). Starlight flips its gray numbering between themes — `:root` defines dark mode (gray-1=lightest), `:root[data-theme="light"]` flips it (gray-1=darkest text).

## Goals / Non-Goals

- **Goals**:
  - Pure neutral grays with no color tint — black/white/gray, not purple-ish
  - Cards and code blocks: borderless, white background in light mode
  - Active sidebar items: gray background, fully rounded (pill shape)
  - Logo/site title: foreground color (white in dark, black in light), semi-bold
  - 257° purple accent only on interactive elements (links, highlights)
  - Geist fonts load and render correctly
- **Non-Goals**:
  - Replicating animations or interactive elements from the website
  - Adding Tailwind CSS to the docs
  - Custom Starlight component overrides

## Decisions

### Color Token Mapping

The accent palette uses 257° purple, while all grays are pure neutral (0° hue). This matches the website where `--secondary`, `--accent`, and `--ring` carry hue 257° but `--background`, `--foreground`, `--muted`, and `--border` are all at hue 0°.

**Dark mode (`:root`)**

| Token | Value | Maps to |
|---|---|---|
| `--sl-color-accent-low` | `#2b2636` | accent bg tint |
| `--sl-color-accent` | `#a394c0` | links, highlights |
| `--sl-color-accent-high` | `#b5a8cd` | text on accent bg |
| `--sl-color-white` | `#f2f2f2` | heading text |
| `--sl-color-gray-1` | `#e5e5e5` | primary text |
| `--sl-color-gray-2` | `#a3a3a3` | secondary text |
| `--sl-color-gray-3` | `#737373` | tertiary |
| `--sl-color-gray-4` | `#525252` | muted |
| `--sl-color-gray-5` | `#262626` | borders |
| `--sl-color-gray-6` | `#1a1a1a` | surface bg |
| `--sl-color-black` | `#121212` | page bg |

**Light mode (`:root[data-theme="light"]`)**

| Token | Value | Maps to |
|---|---|---|
| `--sl-color-accent-low` | `#ece8f4` | accent bg tint |
| `--sl-color-accent` | `#8878a8` | links, highlights |
| `--sl-color-accent-high` | `#534e65` | text on accent bg |
| `--sl-color-white` | `#141414` | heading text |
| `--sl-color-gray-1` | `#1a1a1a` | darkest text |
| `--sl-color-gray-2` | `#333333` | text |
| `--sl-color-gray-3` | `#666666` | muted text |
| `--sl-color-gray-4` | `#a3a3a3` | lighter muted |
| `--sl-color-gray-5` | `#d4d4d4` | borders |
| `--sl-color-gray-6` | `#f5f5f5` | surfaces |
| `--sl-color-gray-7` | `#fafafa` | nav bg, code bg |
| `--sl-color-black` | `#ffffff` | page bg |

### Borderless Cards and Code Blocks

The website's cards use `bg-card rounded-xl` with no `border` class. Code sections follow the same pattern. In the docs:
- Starlight cards: `border: none` override
- Expressive Code: `borderWidth: '0px'` in config, `borderRadius: '0.75rem'`

### Sidebar Active State

The website uses `bg-muted/70` with `rounded-full` for active/hover states. Mapped to Starlight sidebar as `background-color: var(--sl-color-gray-6)` with `border-radius: 9999px`.

### Site Title

The website's logo uses foreground color (black in light, white in dark). Starlight defaults to accent color. Overridden to `var(--sl-color-white)` which resolves to the appropriate foreground in each theme.
