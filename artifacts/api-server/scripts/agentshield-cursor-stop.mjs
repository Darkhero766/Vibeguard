#!/usr/bin/env node
// Cursor Stop hook adapter. It returns only the Cursor-specific followup_message schema.
import { handleCursorStop } from './agentshield-controller.mjs';
await handleCursorStop();
