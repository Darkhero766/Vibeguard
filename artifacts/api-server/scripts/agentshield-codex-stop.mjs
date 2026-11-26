#!/usr/bin/env node
// Codex Stop hook adapter. Codex expects JSON on stdout for the Stop event.
import { handleHook } from './agentshield-controller.mjs';
await handleHook('Stop', { surface: 'codex' });
