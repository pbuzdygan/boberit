# Boberit UI color system

## Purpose

The interface palette comes directly from the approved brand files `branding/boberit-icon.png` and `branding/boberit_banner.png`. It combines the technical, professional character of the brand with a light, compact workspace. Navy builds identity; it must not flood the whole application.

Tokens are implemented as CSS variables in `:root` of `apps/web/src/styles.css`. Use the variables instead of repeating hex values.

## Brand tokens

| CSS variable | Value | Use |
|---|---:|---|
| `--navy` | `#00102F` | navigation panel, browser theme color |
| `--navy-2` | `#001B48` | dark surfaces and gradients |
| `--blue` | `#0068E8` | primary actions, links, selection |
| `--electric` | `#0088F8` | highlights, hover, gradient accent |
| `--blue-50` | `#EDF6FF` | active backgrounds, category icons |
| `--silver` | `#D0E0F0` | cool surfaces inspired by the logo's tail |

## Neutral and semantic tokens

| CSS variable | Value | Use |
|---|---:|---|
| `--paper` | `#F3F7FB` | application background |
| `--surface` | `#FFFFFF` | content surfaces |
| `--ink` | `#0A1D38` | primary text |
| `--muted` | `#65758A` | secondary text |
| `--line` | `#D8E2ED` | borders |
| `--success` | `#087F60` | success state |
| `--danger` | `#C9384A` | warning and error state |

## Usage rules

- The dark navy sidebar anchors the brand and showcases the logo.
- The main workspace stays light and information-dense.
- Cobalt blue is reserved for actions, selection, filters, and links.
- Electric blue appears sparingly, in gradients and hover states.
- Red and green are semantic colors only, never decoration, and are always paired with text or an icon.
- Shadows are cool, shallow, and used only for hierarchy.
