---
name: Supabase server runtime
description: Runtime compatibility guidance for Supabase clients used by server-side auth code.
---

Server-side Supabase clients used only for JWT validation should use the Auth REST endpoint or otherwise disable Realtime initialization when the runtime lacks native WebSocket support.

**Why:** Supabase client initialization can eagerly construct a Realtime client, which fails on Node runtimes below the native WebSocket requirement even when the server never uses realtime channels.

**How to apply:** Keep browser clients on the normal Supabase SDK, but keep API authentication independent from Realtime unless the server explicitly needs subscriptions.