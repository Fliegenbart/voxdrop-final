# VoxDrop Design Guidelines

## Design Direction

**Aesthetic:** Professional B2G SaaS with Apple-inspired clarity and violet brand accent.
**Audience:** German public sector (Kommunen, Landesbehoerden) and accessibility professionals.
**Framework:** React 18 + TypeScript, Tailwind CSS, Shadcn/ui (new-york style), Radix UI primitives.

## Brand Color: Violet

Violet is the primary brand color across all surfaces. It conveys professionalism, trust and modernity.

### CSS Design Tokens (index.css)

```
Light mode:
  --primary:            263 70% 50%      /* violet-600 equivalent */
  --primary-foreground:  0 0% 100%
  --ring:               263 70% 50%
  --page-bg:            0 0% 96.5%       /* #f5f5f7 equivalent */

Dark mode:
  --primary:            263 70% 55%
  --ring:               263 70% 55%
```

### Tailwind Usage

| Context               | Classes                                          |
|----------------------|--------------------------------------------------|
| Brand gradient (logo, avatars) | `bg-gradient-to-br from-violet-600 to-purple-700` |
| Primary buttons      | Use Shadcn `<Button>` (uses `--primary` token)   |
| Active nav links     | `text-violet-700 font-medium`                     |
| Focus rings          | `focus-visible:ring-violet-500` (global)          |
| Trust badges         | `bg-violet-100 text-violet-700`                   |
| Hero gradient text   | `from-violet-600 to-purple-600`                   |
| Accent links         | `text-violet-600 hover:text-violet-700`           |

### Colors NOT to use for brand

- `blue-*` — reserved for informational/contextual use in blog articles only
- `cyan` (#00D9E1) — legacy token, no longer the brand color
- Do NOT mix blue and violet for the same purpose

### Gray Scale

Use `slate-*` consistently (NOT `gray-*`). Slate has a subtle cool tint that pairs well with violet.

```
Text:    text-slate-900, text-slate-700, text-slate-600, text-slate-500
Borders: border-slate-200, border-slate-100
Fills:   bg-slate-50, bg-slate-100
Hover:   hover:bg-slate-50, hover:text-slate-900
```

## Typography

**DSGVO-konform: No external font loading.** System fonts only.

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

### Type Scale

| Element          | Tailwind classes                                    |
|-----------------|-----------------------------------------------------|
| Page H1         | `text-4xl md:text-5xl font-semibold tracking-tight` |
| Home Hero H1    | `text-5xl md:text-7xl font-semibold tracking-tight` |
| Section H2      | `text-3xl md:text-4xl font-semibold`                |
| Card H3         | `text-xl font-semibold`                             |
| Body text        | `text-lg md:text-xl leading-relaxed`                |
| Sub-body         | `text-sm text-slate-600`                            |
| Labels/badges    | `text-xs font-semibold tracking-wide uppercase`     |
| Navigation       | `text-sm`                                           |

## Layout

### PageLayout Component

All pages use `<PageLayout>` from `@/components/PageLayout`. It provides:
- `<div className="min-h-screen bg-page-bg">` wrapper (or `bg-white` for home)
- Shared `<Navigation />` with skip link
- Shared `<Footer />`

```tsx
// Standard page
<PageLayout>
  <SEO ... />
  <header>...</header>
  <main id="main-content">...</main>
</PageLayout>

// Home page (white background)
<PageLayout bg="white">...</PageLayout>

// Auth pages (custom nav, no footer)
<PageLayout nav={false} footer={false}>...</PageLayout>
```

### Page Background

Use the `--page-bg` token via `bg-page-bg` class. Never hardcode `bg-[#f5f5f7]`.

### Navigation

- Height: `h-14` (56px)
- Sticky: `sticky top-0 z-50 backdrop-blur-xl bg-white/80`
- Max width: `max-w-5xl mx-auto`
- Logo: `from-violet-600 to-purple-700` gradient square with Sparkles icon
- Skip link included in Navigation component (NOT in individual pages)

### Content Widths

| Context         | Max width     |
|----------------|---------------|
| Navigation bar | `max-w-5xl`   |
| Page content   | `max-w-5xl` or `max-w-6xl` |
| Hero text      | `max-w-3xl` or `max-w-4xl` |
| CTA banners    | `max-w-4xl`   |
| Footer         | `max-w-5xl`   |

### Section Spacing

- Section padding: `py-20 px-6`
- Heading to content: `mb-12`
- Card grid gap: `gap-6`
- Card padding: `p-7` or `p-8`

### Grid Patterns

- 3-col cards: `grid md:grid-cols-3 gap-6`
- 4-col workflow: `grid md:grid-cols-4 gap-6`
- 2-col split: `grid md:grid-cols-2 gap-10`
- Footer: `grid md:grid-cols-4 gap-8`

## Components

### Buttons

Base component: `<Button>` from Shadcn/ui with CVA.
Default border-radius: `rounded-xl` (12px).

```tsx
// Primary CTA
<Button asChild size="lg" className="h-12 px-7 rounded-xl font-semibold">
  <Link href="...">Label <ArrowRight /></Link>
</Button>

// Outline/secondary
<Button asChild variant="outline" size="lg" className="h-12 px-7 rounded-xl border-slate-300">
  <Link href="...">Label</Link>
</Button>
```

### Cards

```tsx
<div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
  <div className="text-xs font-semibold tracking-wide uppercase text-slate-500">Label</div>
  <h3 className="mt-2 text-xl font-semibold text-slate-900">Title</h3>
  <p className="mt-3 text-slate-600 leading-relaxed">Description</p>
</div>
```

### Hero Section Pattern

```tsx
<header className="pt-16 pb-12 px-6">
  <div className="max-w-3xl mx-auto text-center">
    <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-full text-sm font-medium mb-6">
      <Icon className="w-4 h-4" />
      Badge text
    </div>
    <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
      Page Title
    </h1>
    <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
      Subtitle
    </p>
  </div>
</header>
```

## Accessibility

- Skip link: Single instance in `<Navigation>`, targets `#main-content`
- Focus rings: `focus-visible:ring-2 focus-visible:ring-violet-500` (consistent across all pages)
- Touch targets: Minimum 44x44px
- Keyboard navigation: Full tab order support
- ARIA: `role`, `aria-label`, `aria-expanded`, `aria-haspopup` on all interactive elements
- Screen reader: `aria-hidden="true"` on decorative icons

## Elevation System

The custom elevation system uses CSS pseudo-elements for hover/active states:

```tsx
// Automatic on Shadcn Button
"hover-elevate active-elevate-2"

// Toggle state
"toggle-elevate toggle-elevated"
```

## Shadows

7-step scale from `--shadow-2xs` to `--shadow-2xl`, using HSL-based colors for consistency between light/dark modes.

Common usage:
- Cards: `shadow-sm`
- Dropdowns: `shadow-xl`
- Modals: `shadow-2xl`
- Hover enhancement: `hover:shadow-md`
