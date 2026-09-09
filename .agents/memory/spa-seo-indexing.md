---
name: SPA SEO indexing
description: Why public single-page routes need initial HTML metadata for dependable search indexing
---

For public routes in a single-page app, setting title, description, canonical, and structured data after hydration is not enough for dependable indexing. The production build should emit route-specific HTML snapshots so crawlers receive the correct metadata before JavaScript runs.

**Why:** The app’s development fallback and initial production shell can otherwise expose the homepage metadata for every route, even when the rendered UI later updates the head.

**How to apply:** Keep the sitemap and canonical URLs aligned with the generated route snapshots, and verify the built HTML directly before publishing.