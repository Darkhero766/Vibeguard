#!/usr/bin/env node
import { handleHook } from './agentshield-controller.mjs';
await handleHook('PostToolUse');
