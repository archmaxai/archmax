## 1. Font Loading

- [x] 1.1 Copy Geist Sans and Geist Mono variable font files (woff2) into `apps/docs/public/fonts/`
- [x] 1.2 Add `@font-face` declarations in `custom.css`

## 2. Color Tokens

- [x] 2.1 Set dark mode accent tokens (`:root`) with 257° purple values
- [x] 2.2 Set light mode accent tokens (`:root[data-theme="light"]`) with 257° purple values
- [x] 2.3 Set dark mode gray scale with pure neutral (0° hue) values
- [x] 2.4 Set light mode gray scale with flipped pure neutral values including gray-7

## 3. Cards and Code Blocks

- [x] 3.1 Remove border from Starlight card components (`border: none`)
- [x] 3.2 Configure Expressive Code with `borderRadius: 0.75rem` and `borderWidth: 0px`

## 4. Sidebar

- [x] 4.1 Override active sidebar item: gray background (`--sl-color-gray-6`), pill shape (`border-radius: 9999px`), foreground color

## 5. Site Title

- [x] 5.1 Override site title color to foreground (`--sl-color-white`) instead of accent

## 6. Typography and Content

- [x] 6.1 Add `letter-spacing: -0.025em` to content headings
- [x] 6.2 Add subtle underline + transition to content links
- [x] 6.3 Round inline code, asides, and hero CTA buttons

## 7. Verification

- [x] 7.1 Test static build completes without errors
