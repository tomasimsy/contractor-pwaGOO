@AGENTS.md
# OSRPros Frontend Design System

## Core Design Principle

Build interfaces that look intentionally designed by a professional product designer and developer — NOT like an AI-generated website.

OSRPros is a professional roofing and renovation business. The software should feel like real, production-grade business software built for contractors, estimators, project managers, and office staff.

Do not default to generic SaaS aesthetics.

If a design looks like something commonly produced by an AI UI generator, redesign it.

## Visual Direction

Favor:

- Strong typography
- Clear hierarchy
- Intentional spacing
- Practical information density
- Editorial/commercial composition
- Subtle visual details
- High-quality photography when appropriate
- Restrained use of color
- Strong alignment and grid systems
- Clear separation between primary and secondary information
- Interfaces that feel established and trustworthy
- Design decisions that have a functional reason

Avoid:

- Generic AI dashboard layouts
- Excessive rounded cards
- Excessive pill-shaped controls
- Purple/blue AI gradients
- Glassmorphism unless specifically justified
- Excessive shadows
- Floating blobs
- Decorative gradients with no purpose
- Cartoon illustrations
- Generic AI-generated icons
- Excessive emoji
- Stock-looking corporate graphics
- Making every section a card
- Making every element symmetrical
- Huge headings that waste space
- Excessive whitespace that reduces useful information density
- Random decorative elements
- Unnecessary animations
- "Dribbble shot" aesthetics that hurt usability
- Cookie-cutter Tailwind layouts
- Generic admin templates
- Interfaces that look like they came from a UI generator

## Typography

Typography should create hierarchy and personality.

Do not automatically use the same default font and font sizes everywhere.

Use:

- Clear distinction between page titles, section headings, labels, values, and supporting information
- Strong readable numbers for financial information
- Compact typography where users need to scan many records
- Larger typography only when it improves hierarchy

Do not use oversized typography simply to make a page look modern.

## Cards

Cards should be used only when they improve grouping or hierarchy.

Do not put every piece of information inside a rounded card.

Prefer:

- Sections
- Dividers
- Tables
- Structured rows
- Panels
- Inline information
- Strong spacing

when those patterns communicate information better.

## Data-Dense Business Interfaces

OSRPros contains estimates, invoices, expenses, payments, clients, projects, and financial information.

Prioritize:

1. Information hierarchy
2. Scannability
3. Fast comprehension
4. Useful density
5. Clear actions
6. Visual consistency

Do not sacrifice usability merely to create a visually minimal interface.

Tables should feel professional and compact.

Mobile layouts should preserve hierarchy without simply stacking every desktop element vertically.

## Color

Use the existing OSRPros brand language whenever it exists.

Do not introduce a new color system simply because a component needs styling.

Avoid:

- Neon gradients
- Purple AI aesthetics
- Excessive blue SaaS styling
- Rainbow dashboards
- Decorative colors without semantic meaning

Color should communicate hierarchy, state, action, or branding.

## Icons

Use icons sparingly.

Do not add an icon to every button, heading, card, or navigation item.

Icons must communicate something useful.

Avoid generic AI-looking icon compositions.

## Components

Before creating a new component:

1. Check whether an existing component already performs the same role.
2. Reuse existing patterns whenever appropriate.
3. Maintain visual consistency across the application.
4. Do not create slightly different versions of the same UI pattern.

Do not duplicate UI patterns unnecessarily.

## Responsive Design

Desktop and mobile should feel intentionally designed.

Do not treat mobile as an afterthought.

For mobile:

- Prioritize the most important information
- Reduce unnecessary secondary information
- Preserve important actions
- Use appropriate touch targets
- Avoid excessive vertical scrolling
- Avoid unnecessarily tall cards
- Make tables and lists usable
- Keep navigation predictable

For desktop:

- Use available horizontal space intelligently
- Avoid excessively narrow content
- Avoid filling the screen with unnecessary cards
- Maintain clear visual hierarchy

## Existing Application

Before redesigning a page:

1. Inspect the existing implementation.
2. Understand existing components.
3. Understand the existing data structure.
4. Identify patterns already used elsewhere in the application.
5. Reuse existing functionality.
6. Do not change business logic merely to redesign UI.

Do not rewrite working functionality just to change visual appearance.

## Playwright Visual QA

When Playwright is available, use it for meaningful frontend changes.

After implementing a significant UI change:

1. Run the application.
2. Open the affected page with Playwright.
3. Inspect the rendered interface.
4. Check desktop dimensions.
5. Check mobile dimensions.
6. Look for visual inconsistencies.
7. Look for overflow and spacing problems.
8. Look for unnecessary repetition.
9. Look for generic AI/SaaS patterns.
10. Fix issues found during inspection.
11. Re-check the page.

Do not assume the UI is correct merely because the code compiles.

## Anti-AI Design Check

Before considering a significant UI redesign complete, ask:

- Does this look like a generic AI-generated SaaS dashboard?
- Did I add unnecessary rounded cards?
- Did I add unnecessary gradients?
- Did I use too many icons?
- Did I make everything symmetrical?
- Did I use decorative elements without purpose?
- Does the typography have meaningful hierarchy?
- Does the interface feel appropriate for a real roofing/renovation company?
- Is the information density appropriate for actual business use?
- Does this look like a template?
- Could this design be recognized as a generic AI-generated interface?

If the answer to the last two questions is yes, redesign it.

## Design Before Code

For substantial frontend redesigns, establish the visual direction before implementing the components.

Do not immediately start generating JSX simply because the user requested a redesign.

First determine:

- Layout structure
- Information hierarchy
- Typography hierarchy
- Spacing strategy
- Color usage
- Component relationships
- Desktop behavior
- Mobile behavior

Then implement.

## Preserve Existing Functionality

Visual redesign must not break:

- Database operations
- Supabase queries
- Authentication
- Permissions
- RLS
- Estimate calculations
- Invoice calculations
- Financial calculations
- PDF generation
- Email functionality
- Client portal functionality
- Existing routes
- Existing API behavior

When modifying frontend code, preserve the application's existing business logic unless explicitly instructed otherwise.

## Final Rule

The goal is not to make the interface "fancy."

The goal is to make OSRPros feel like a real, carefully designed professional product.

Distinctive > generic.

Intentional > decorative.

Useful > trendy.

Professional > flashy.

Human-designed > AI-generated.