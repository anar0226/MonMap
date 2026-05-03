# MonMap Design System

## Overview

MonMap is a mobile map application for Ulaanbaatar, Mongolia, built with React Native + Expo. The visual identity is a **dark, premium, deep-navy aesthetic** — think a sleek nighttime navigation app. All screens use a near-black background with subtle blue undertones, white text, and blue primary accents.

---

## Color Palette

### Mode
- **Dark mode only.** There is no light mode. Every screen, card, and overlay assumes a dark background.

### Backgrounds (layered, darkest → lightest)
| Token        | Value               | Usage                              |
|--------------|---------------------|------------------------------------|
| `bg`         | `#090C16`           | Root screen background             |
| `bgElevated` | `#0D1220`           | Elevated surfaces (modals, sheets) |
| `cardBg`     | `#111520`           | Cards, list items                  |
| `inputBg`    | `rgba(255,255,255,0.06)` | Text inputs, search bars      |

### Brand / Primary
| Token          | Value       | Usage                              |
|----------------|-------------|------------------------------------|
| `primary`      | `#0053A3`   | Buttons, links, active states, logo|
| `primaryDark`  | `#1A3FA8`   | Gradient end-stop for primary      |
| `accent`       | `#4F46E5`   | Secondary accent (indigo-violet)   |

### Text
| Token        | Value                     | Usage                              |
|--------------|---------------------------|------------------------------------|
| `text`       | `#FFFFFF`                 | Primary text, headings             |
| `textSec`    | `rgba(255,255,255,0.45)`  | Secondary / supporting text        |
| `textMuted`  | `rgba(255,255,255,0.28)`  | Captions, section labels, hints    |
| `textInverse`| `#090C16`                 | Text on light backgrounds          |

### Borders
| Token          | Value                     | Usage                            |
|----------------|---------------------------|----------------------------------|
| `border`       | `rgba(255,255,255,0.10)`  | Default card/input borders       |
| `borderStrong` | `rgba(255,255,255,0.18)`  | Emphasized dividers              |

### Semantic / Status
| Token     | Value     | Usage                |
|-----------|-----------|----------------------|
| `success` | `#10B981` | Positive indicators  |
| `warning` | `#F59E0B` | Warnings, caution    |
| `danger`  | `#EF4444` | Errors, destructive  |

### Decorative
| Token    | Value     | Usage                              |
|----------|-----------|------------------------------------|
| `purple` | `#8B5CF6` | Accent highlights                  |
| `sky`    | `#0EA5E9` | Info, links                        |
| `indigo` | `#6366F1` | Alternative accent                 |
| `star`   | `#FBB824` | Ratings, favorites                 |

### Scrims (translucent overlays)
| Token               | Value                     | Usage                          |
|----------------------|---------------------------|--------------------------------|
| `scrimLight`         | `rgba(255,255,255,0.05)`  | Subtle pressed states, pills   |
| `scrimDanger`        | `rgba(239,68,68,0.10)`    | Danger button background       |
| `scrimDangerBorder`  | `rgba(239,68,68,0.20)`    | Danger button border           |

---

## Gradients

Used with `expo-linear-gradient`. All gradients are dark with subtle blue/indigo shifts:

| Token             | Colors                                            | Usage                   |
|-------------------|---------------------------------------------------|-------------------------|
| `bg`              | `#0C0E1A` → `#0A1628` → `#0D0A1F`                | Full-screen backgrounds |
| `card`            | `#090C18` → `#0A1630` → `#0D0B20`                | Card backgrounds        |
| `primary`         | `#0053A3` → `#1A3FA8`                             | Primary buttons         |
| `primaryMuted`    | 50% opacity version of `primary`                  | Disabled/muted buttons  |
| `primaryDisabled` | 38% opacity version of `primary`                  | Fully disabled buttons  |

---

## Typography

System font (no custom font loaded). Uses tight negative letter-spacing for a modern feel.

| Style     | Size | Weight | Letter-Spacing | Color       | Usage                             |
|-----------|------|--------|----------------|-------------|-----------------------------------|
| `display` | 26   | 700    | -0.8           | white       | Hero text, large titles           |
| `h1`      | 20   | 800    | -0.4           | white       | Screen titles                     |
| `h2`      | 17   | 700    | -0.4           | white       | Section headings inside screens   |
| `body`    | 14   | 400    | —              | white       | Paragraph text                    |
| `bodySm`  | 13   | 400    | —              | textSec     | Secondary paragraph text          |
| `label`   | 11   | 600    | 1.1            | textSec     | Uppercase form labels             |
| `section` | 12   | 600    | 0.5            | textMuted   | Section headings above cards      |
| `brand`   | 11   | 500    | 2.0            | textMuted   | Brand wordmark, wide letter-space |
| `caption` | 11   | 400    | —              | textMuted   | Smallest text, fine print         |

**Key typographic rules:**
- Headings use **tight negative letter-spacing** (-0.4 to -0.8).
- Labels and brand text use **wide positive letter-spacing** (0.5 to 2.0) and are often uppercased.
- Body text uses no letter-spacing adjustment.

---

## Spacing

Based on a **4-point grid**:

| Token | Value | Usage                           |
|-------|-------|---------------------------------|
| `xs`  | 4     | Tight gaps (icon margins)       |
| `sm`  | 8     | Small gaps                      |
| `md`  | 12    | Medium gaps                     |
| `lg`  | 16    | Standard padding, card padding  |
| `xl`  | 20    | Generous padding                |
| `2xl` | 24    | Screen horizontal padding       |
| `3xl` | 32    | Large section spacing           |
| `4xl` | 40    | Extra large spacing             |
| `5xl` | 48    | Maximum spacing                 |

**Default screen horizontal padding is `2xl` (24px).**

---

## Border Radius

| Token  | Value | Usage                                |
|--------|-------|--------------------------------------|
| `sm`   | 6     | Badges, small chips                  |
| `md`   | 10    | Icon boxes, small elements           |
| `lg`   | 12    | Buttons, inputs, pills               |
| `xl`   | 14    | Medium logo sizes                    |
| `2xl`  | 16    | Cards                                |
| `3xl`  | 22    | Large elements                       |
| `full` | 999   | Circles, fully rounded pills         |

**Cards always use `radius.2xl` (16). Buttons and inputs use `radius.lg` (12).**

---

## Shadows

All shadows use black (`#000`) as the shadow color except the brand glow:

| Token         | Offset  | Opacity | Radius | Elevation | Usage                        |
|---------------|---------|---------|--------|-----------|------------------------------|
| `none`        | —       | —       | —      | —         | No shadow                    |
| `sm`          | 0, 1    | 0.15    | 2      | 2         | Subtle lift (pills, chips)   |
| `md`          | 0, 2    | 0.25    | 4      | 5         | Cards, buttons               |
| `lg`          | 0, 6    | 0.30    | 12     | 10        | Modals, floating elements    |
| `glowPrimary` | 0, 8    | 0.33    | 16     | 0         | Blue glow under logo/buttons (uses `colors.primary` as shadow color) |

---

## UI Component Patterns

### Screen
- Wraps content in `SafeAreaView` with the dark `bg` background.
- Default horizontal padding: 24px (`spacing.2xl`).
- Supports scroll mode and keyboard avoidance.

### Card
- Background: `cardBg` (`#111520`).
- Border: 1px `border` (`rgba(255,255,255,0.10)`).
- Border radius: `radius.2xl` (16).
- Default padding: 16px.

### Button (4 variants)
- **Primary**: Solid `primary` blue background, white text. Disabled state is 40% opacity blue.
- **Secondary**: `cardBg` background with 1px `border`. White text.
- **Danger**: Translucent red scrim background with red border and red text.
- **Ghost**: Transparent background, white text.
- All buttons: `radius.lg` (12), font-size 15, font-weight 600, letter-spacing 0.3.
- Two sizes: `md` (44px min-height) and `lg` (50px min-height, default).
- Pressed state: 85% opacity.

### Input
- Background: `inputBg` (translucent white 6%).
- Border: 1px `border`, changes to `primary` on focus, `danger` when invalid.
- Border radius: `radius.lg` (12).
- Font-size: 15, padding: 16px horizontal, 14px vertical.
- Placeholder color: `textMuted`.

### Badge (6 tones)
- Small pill with translucent background tinted to the tone color.
- Tones: primary, success, warning, danger, star, neutral.
- Font-size: 10, font-weight 700. Border radius: `radius.sm` (6).

### MenuItem
- Row layout: icon box (34x34, tinted translucent background) → label + subtitle → chevron `>`.
- Label: 13px, weight 600, white. Subtitle: 11px, `textSec`.
- Separated by 0.5px bottom border. Pressed state uses `scrimLight`.

### Divider
- Thin 1px line using `border` color.
- Optional label variant: line—text—line with `textMuted` label, 11px, weight 500, letter-spacing 1.1.

### SocialPill
- Flex-1 pill with icon + label stacked vertically.
- Background: `scrimLight`. Border: 1px `border`. Border radius: `radius.lg`.

### Stat
- Centered value + label stack.
- Value: 20px, weight 800, white. Label: 11px, `textSec`.

### AppLogo
- Solid `primary` blue square with white "M" letter.
- Three sizes: sm (34px), md (48px), lg (64px).
- Optional `glowPrimary` shadow for a blue glow effect.

---

## Map-Specific Design

### Map Style
- Uses Mapbox Standard (v3) basemap.
- **Top-down view (pitch 0)** — flat, Google Maps-style perspective.
- Default zoom level: 16. Min: 10, Max: 20.
- Centered on Ulaanbaatar: `[106.9057, 47.8864]`.
- Built-in POI/transit labels suppressed in favor of custom markers.

### POI Category Colors (on map)
Each place category has a unique color for its circle marker:

| Category              | Color     | Hex       |
|-----------------------|-----------|-----------|
| Restaurant            | Red       | `#E53935` |
| Cafe                  | Brown     | `#6D4C41` |
| Bar                   | Purple    | `#7B1FA2` |
| Bakery                | Orange    | `#FB8C00` |
| Grocery/Supermarket   | Green     | `#43A047` |
| Convenience Store     | Teal      | `#00897B` |
| Shopping Mall         | Indigo    | `#3949AB` |
| Clothing Store        | Pink      | `#E91E63` |
| Beauty Salon          | Dark Pink | `#AD1457` |
| Hair Care             | Deep Rose | `#880E4F` |
| Spa                   | Cyan      | `#00838F` |
| Gym                   | Green     | `#2E7D32` |
| Pharmacy              | Dark Red  | `#C62828` |
| Hospital              | Deep Red  | `#B71C1C` |
| Doctor                | Light Red | `#EF5350` |
| Dentist               | Blue      | `#1565C0` |
| Bank                  | Navy      | `#0D47A1` |
| Car Repair            | Charcoal  | `#37474F` |
| Gas Station           | Amber     | `#E65100` |
| Fallback/Unknown      | Blue      | `#1A73E8` |

### Map POI Markers
- **Circle markers** with white 1.5px stroke.
- Radius interpolates with zoom: 4px at z12, 8px at z16, 14px at z20.
- **Text labels** below each dot: 12px, dark color (`#222222`), white halo (1.4px).
- Labels auto-hide to prevent overlap (`textOptional: true`).

### Map UI Overlays
- **Recenter button**: White circle (48x48), bottom-right corner, with `md` shadow.
- **Loading indicator**: White pill with `ActivityIndicator` + Mongolian text, centered top.
- **Error banners**: Red (`#c0392b`) rounded rectangle, top area, white text.

---

## General Design Principles

1. **Dark-first**: Everything sits on near-black backgrounds with subtle navy/indigo undertones.
2. **Minimal borders**: Borders are very faint (10% white opacity). They exist to separate, not to emphasize.
3. **Translucent layers**: Pressed states, badges, and danger zones use translucent color overlays rather than solid fills.
4. **Tight typography**: Headings use negative letter-spacing for a modern, compressed look. Labels use wide letter-spacing for readability at small sizes.
5. **Blue as the hero color**: The primary blue (`#0053A3`) is the only strong brand color. Everything else is muted or neutral.
6. **Subtle depth**: Shadows are understated. The `glowPrimary` effect is reserved for branding elements only.
7. **4-pt grid**: All spacing values are multiples of 4.
8. **Consistent radii**: Cards = 16, buttons/inputs = 12, badges = 6.
