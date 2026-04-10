## ADDED Requirements

### Requirement: Brand-Consistent Theming

The documentation site SHALL use color tokens, typography, and visual treatments consistent with the archmax marketing website.

The accent palette MUST use hue 257° purple tones for interactive elements (links, highlights), with separate values for light and dark modes.

The gray scale MUST be pure neutral (hue 0°) with no color tint, matching the website's black/white/gray backgrounds and text.

#### Scenario: Neutral grays in light mode

- **WHEN** a user views the documentation site in light mode
- **THEN** backgrounds are pure white (`#ffffff`), text is near-black (`#141414`), and surface grays carry no color tint

#### Scenario: Neutral grays in dark mode

- **WHEN** a user views the documentation site in dark mode
- **THEN** backgrounds are near-black (`#121212`), text is near-white (`#f2f2f2`), and surface grays carry no color tint

#### Scenario: Purple accent on interactive elements only

- **WHEN** a user views any page
- **THEN** the 257° purple accent appears only on links, active highlights, and focus rings
- **AND** backgrounds, borders, and text use pure neutral grays

### Requirement: Geist Font Loading

The documentation site SHALL load Geist Sans and Geist Mono variable font files self-hosted in the static assets.

#### Scenario: Geist fonts render on page load

- **WHEN** a user visits any documentation page
- **THEN** body text renders in Geist Sans and code blocks render in Geist Mono
- **AND** no external font requests are made

### Requirement: Borderless Cards and Code Blocks

Cards and code blocks SHALL have no visible border, matching the website's borderless card pattern with white background in light mode.

Code blocks MUST use rounded corners (`border-radius: 0.75rem`).

#### Scenario: Cards are borderless with white background

- **WHEN** a user views a page with card components in light mode
- **THEN** cards have no border and a white background

#### Scenario: Code blocks are borderless with rounded corners

- **WHEN** a user views a page with code blocks
- **THEN** code blocks have no border and `border-radius: 0.75rem`

### Requirement: Sidebar Active State

The active sidebar item SHALL use a gray background with fully rounded (pill-shaped) corners, matching the website's navigation active state pattern.

#### Scenario: Active sidebar item has pill shape

- **WHEN** a user is on a documentation page
- **THEN** the corresponding sidebar link has a gray background (`--sl-color-gray-6`) and `border-radius: 9999px`

### Requirement: Site Title Styling

The site title in the navigation bar SHALL use the foreground color (white in dark mode, black in light mode) with semi-bold weight, matching the website's logo treatment.

#### Scenario: Site title uses foreground color

- **WHEN** a user views the documentation navigation
- **THEN** the site title text uses the foreground color, not the accent color
