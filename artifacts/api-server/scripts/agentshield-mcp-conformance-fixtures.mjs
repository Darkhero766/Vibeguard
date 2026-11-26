/**
 * Test-only fixtures for the frozen MCP server conformance profile.
 *
 * These fixtures MUST NOT be registered by the production STDIO server or
 * included in the beta package. The real Foxy tool catalog remains read-only;
 * the fixtures let the official runner exercise generic MCP protocol behavior
 * against a disposable synthetic server sharing the production SDK factory.
 */
import { randomUUID } from 'node:crypto';
import {
  acceptedContent,
  inputRequired,
  ResourceTemplate,
  CLIENT_CAPABILITIES_META_KEY,
} from '@modelcontextprotocol/server';
import { z } from 'zod';

const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const TEST_AUDIO_BASE64 = 'UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAA=';

// Reject fixture corruption before starting the test server. Buffer's
// round-trip check enforces canonical Base64, not merely permissive decoding.
for (const [label, value] of [['PNG', TEST_IMAGE_BASE64], ['WAV', TEST_AUDIO_BASE64]]) {
  if (Buffer.from(value, 'base64').toString('base64') !== value) {
    throw new Error('MCP conformance ' + label + ' fixture is not canonical Base64.');
  }
}

const emptySchema = z.object({});

export function registerFoxyConformanceFixtures(server, requestStateCodec) {
  // The stateless profile deliberately exercises capability rejection:
  // the client does not declare sampling, so the SDK must reject this
  // request with the protocol's missing-capability error.
  server.registerTool('test_missing_capability', {
    description: 'Conformance-only fixture for missing client-capability rejection.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    if (ctx.mcpReq.inputResponses?.llm_answer !== undefined) {
      return { content: [{ type: 'text', text: 'sampling round-trip complete' }] };
    }
    return inputRequired({
      inputRequests: {
        llm_answer: inputRequired.createMessage({
          messages: [{ role: 'user', content: { type: 'text', text: 'Reply with the single word: pong' } }],
          maxTokens: 16,
        }),
      },
    });
  });

  // This fixture must not initiate a server->client request; the stateless
  // scenario checks the response stream contains only its own result frames.
  server.registerTool('test_streaming_elicitation', {
    description: 'Conformance-only response-stream fixture.',
    inputSchema: emptySchema,
  }, async () => ({
    content: [{ type: 'text', text: 'stream observed: result frames only' }],
  }));

  // Modern logging is request-scoped and gated by _meta.logLevel. The
  // conformance scenario intentionally omits that field and expects silence.
  server.registerTool('test_logging_tool', {
    description: 'Conformance-only request-scoped logging fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    await ctx.mcpReq.log('info', 'test_logging_tool executed');
    return { content: [{ type: 'text', text: 'logging fixture executed' }] };
  });

  server.registerTool('test_simple_text', {
    description: 'Returns the fixed text payload required by the MCP conformance fixture.',
    inputSchema: emptySchema,
  }, async () => ({
    content: [{ type: 'text', text: 'This is a simple text response for testing.' }],
  }));

  server.registerTool('test_image_content', {
    description: 'Returns a deterministic one-pixel PNG for MCP conformance.',
    inputSchema: emptySchema,
  }, async () => ({
    content: [{ type: 'image', data: TEST_IMAGE_BASE64, mimeType: 'image/png' }],
  }));

  server.registerTool('test_audio_content', {
    description: 'Returns a deterministic minimal WAV payload for MCP conformance.',
    inputSchema: emptySchema,
  }, async () => ({
    content: [{ type: 'audio', data: TEST_AUDIO_BASE64, mimeType: 'audio/wav' }],
  }));

  server.registerTool('test_embedded_resource', {
    description: 'Returns an embedded text resource for MCP conformance.',
    inputSchema: emptySchema,
  }, async () => ({
    content: [{
      type: 'resource',
      resource: {
        uri: 'test://embedded-resource',
        mimeType: 'text/plain',
        text: 'This is an embedded resource content.',
      },
    }],
  }));

  server.registerTool('test_multiple_content_types', {
    description: 'Returns text, image and embedded resource content for MCP conformance.',
    inputSchema: emptySchema,
  }, async () => ({
    content: [
      { type: 'text', text: 'Multiple content types test:' },
      { type: 'image', data: TEST_IMAGE_BASE64, mimeType: 'image/png' },
      {
        type: 'resource',
        resource: {
          uri: 'test://mixed-content-resource',
          mimeType: 'application/json',
          text: JSON.stringify({ test: 'data', value: 123 }),
        },
      },
    ],
  }));

  server.registerTool('test_tool_with_progress', {
    description: 'Emits progress only when the client supplied a progress token.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    const progressToken = ctx.mcpReq._meta?.progressToken;
    if (progressToken !== undefined) {
      for (const progress of [0, 50, 100]) {
        await ctx.mcpReq.notify({
          method: 'notifications/progress',
          params: { progressToken, progress, total: 100 },
        });
        if (progress < 100) await new Promise((resolve) => setTimeout(resolve, 35));
      }
    }
    return { content: [{ type: 'text', text: 'progress fixture complete' }] };
  });

  server.registerTool('test_error_handling', {
    description: 'Intentionally returns a tool-level error for MCP conformance.',
    inputSchema: emptySchema,
  }, async () => {
    throw new Error('This tool intentionally returns an error for testing');
  });

  // Standard resources and a parameterized resource template.
  server.registerResource('static-text', 'test://static-text', {
    title: 'Static Text Resource',
    description: 'Synthetic text resource used only by the conformance runner.',
    mimeType: 'text/plain',
  }, async () => ({
    contents: [{
      uri: 'test://static-text',
      mimeType: 'text/plain',
      text: 'This is the content of the static text resource.',
    }],
  }));

  server.registerResource('static-binary', 'test://static-binary', {
    title: 'Static Binary Resource',
    description: 'Synthetic binary resource used only by the conformance runner.',
    mimeType: 'image/png',
  }, async () => ({
    contents: [{
      uri: 'test://static-binary',
      mimeType: 'image/png',
      blob: TEST_IMAGE_BASE64,
    }],
  }));

  server.registerResource(
    'template',
    new ResourceTemplate('test://template/{id}/data', { list: undefined }),
    {
      title: 'Resource Template',
      description: 'Synthetic resource template used only by the conformance runner.',
      mimeType: 'application/json',
    },
    async (uri, variables) => ({
      contents: [{
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify({
          id: variables.id,
          templateTest: true,
          data: 'Data for ID: ' + variables.id,
        }),
      }],
    }),
  );

  // Prompt fixtures are synthetic examples required by the standard profile.
  server.registerPrompt('test_simple_prompt', {
    title: 'Simple Test Prompt',
    description: 'Synthetic prompt used only by the conformance runner.',
  }, async () => ({
    messages: [{
      role: 'user',
      content: { type: 'text', text: 'This is a simple prompt for testing.' },
    }],
  }));

  server.registerPrompt('test_prompt_with_arguments', {
    title: 'Prompt With Arguments',
    description: 'Synthetic parameterized prompt used only by the conformance runner.',
    argsSchema: z.object({
      arg1: z.string().describe('First test argument'),
      arg2: z.string().describe('Second test argument'),
    }),
  }, async ({ arg1, arg2 }) => ({
    messages: [{
      role: 'user',
      content: { type: 'text', text: `Prompt with arguments: arg1='${arg1}', arg2='${arg2}'` },
    }],
  }));

  server.registerPrompt('test_prompt_with_embedded_resource', {
    title: 'Prompt With Embedded Resource',
    description: 'Synthetic embedded-resource prompt used only by the conformance runner.',
    argsSchema: z.object({
      resourceUri: z.string().describe('URI of the resource to embed'),
    }),
  }, async ({ resourceUri }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'resource',
          resource: {
            uri: resourceUri,
            mimeType: 'text/plain',
            text: 'Embedded resource content for testing.',
          },
        },
      },
      {
        role: 'user',
        content: { type: 'text', text: 'Please process the embedded resource above.' },
      },
    ],
  }));

  server.registerPrompt('test_prompt_with_image', {
    title: 'Prompt With Image',
    description: 'Synthetic image prompt used only by the conformance runner.',
  }, async () => ({
    messages: [
      {
        role: 'user',
        content: { type: 'image', data: TEST_IMAGE_BASE64, mimeType: 'image/png' },
      },
      {
        role: 'user',
        content: { type: 'text', text: 'Please analyze the image above.' },
      },
    ],
  }));

  // Completion responses are intentionally empty but structurally complete.
  // This is the same minimal behavior used by the official SDK's conformance
  // server, and keeps the fixture independent of customer/source content.
  server.server.setRequestHandler('completion/complete', async () => ({
    completion: { values: [], total: 0, hasMore: false },
  }));

  // Multi-round-trip request state is HMAC-protected by a key shared across
  // the adapter's fresh per-request server instances. The SDK verifier runs
  // before any re-entered handler sees caller-controlled state.
  server.registerTool('test_input_required_result_elicitation', {
    description: 'Conformance-only elicitation and missing-response fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    const name = acceptedContent(ctx.mcpReq.inputResponses, 'user_name')?.name;
    if (typeof name !== 'string') {
      return inputRequired({
        inputRequests: {
          user_name: inputRequired.elicit({
            message: 'What is your name?',
            requestedSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
        },
      });
    }
    return { content: [{ type: 'text', text: 'Hello, ' + name + '!' }] };
  });

  server.registerTool('test_input_required_result_sampling', {
    description: 'Conformance-only sampling round-trip fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    const response = ctx.mcpReq.inputResponses?.capital_question;
    if (response === undefined) {
      return inputRequired({
        inputRequests: {
          capital_question: inputRequired.createMessage({
            messages: [{ role: 'user', content: { type: 'text', text: 'What is the capital of France?' } }],
            maxTokens: 100,
          }),
        },
      });
    }
    const text = typeof response?.content?.text === 'string' ? response.content.text : JSON.stringify(response);
    return { content: [{ type: 'text', text: 'Sampling response: ' + text }] };
  });

  server.registerTool('test_input_required_result_list_roots', {
    description: 'Conformance-only roots/list round-trip fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    const roots = ctx.mcpReq.inputResponses?.client_roots?.roots;
    if (!Array.isArray(roots)) {
      return inputRequired({ inputRequests: { client_roots: inputRequired.listRoots() } });
    }
    return { content: [{ type: 'text', text: 'Client exposed ' + roots.length + ' root(s)' }] };
  });

  server.registerTool('test_input_required_result_request_state', {
    description: 'Conformance-only signed requestState fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    const confirmation = acceptedContent(ctx.mcpReq.inputResponses, 'confirm');
    if (confirmation === undefined) {
      return inputRequired({
        inputRequests: {
          confirm: inputRequired.elicit({
            message: 'Please confirm',
            requestedSchema: {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
            },
          }),
        },
        requestState: await requestStateCodec.mint({ tool: 'request_state', nonce: randomUUID() }),
      });
    }
    const state = ctx.mcpReq.requestState();
    if (state === undefined) throw new Error('Verified requestState was unavailable.');
    return { content: [{ type: 'text', text: 'state-ok: requestState verified and confirmation received' }] };
  });

  server.registerTool('test_input_required_result_multiple_inputs', {
    description: 'Conformance-only multiple input request fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    const responses = ctx.mcpReq.inputResponses;
    const name = acceptedContent(responses, 'user_name')?.name;
    const greeting = responses?.greeting?.content?.text;
    const roots = responses?.client_roots?.roots;
    if (typeof name !== 'string' || typeof greeting !== 'string' || !Array.isArray(roots)) {
      return inputRequired({
        inputRequests: {
          user_name: inputRequired.elicit({
            message: 'What is your name?',
            requestedSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
          greeting: inputRequired.createMessage({
            messages: [{ role: 'user', content: { type: 'text', text: 'Generate a greeting' } }],
            maxTokens: 50,
          }),
          client_roots: inputRequired.listRoots(),
        },
        requestState: await requestStateCodec.mint({ tool: 'multiple_inputs', nonce: randomUUID() }),
      });
    }
    return { content: [{ type: 'text', text: greeting + ' ' + name + ' — ' + roots.length + ' root(s) visible' }] };
  });

  server.registerTool('test_input_required_result_multi_round', {
    description: 'Conformance-only multi-round elicitation fixture with evolving signed requestState.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    const state = ctx.mcpReq.requestState();
    const round = state?.tool === 'multi_round' && typeof state.round === 'number' ? state.round : 0;
    if (round === 0) {
      return inputRequired({
        inputRequests: {
          step1: inputRequired.elicit({
            message: 'Step 1: What is your name?',
            requestedSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
        },
        requestState: await requestStateCodec.mint({ tool: 'multi_round', round: 1, nonce: randomUUID() }),
      });
    }
    if (round === 1) {
      const name = acceptedContent(ctx.mcpReq.inputResponses, 'step1')?.name ?? 'unknown';
      return inputRequired({
        inputRequests: {
          step2: inputRequired.elicit({
            message: 'Step 2: What is your favorite color?',
            requestedSchema: {
              type: 'object',
              properties: { color: { type: 'string' } },
              required: ['color'],
            },
          }),
        },
        requestState: await requestStateCodec.mint({ tool: 'multi_round', round: 2, name, nonce: randomUUID() }),
      });
    }
    const color = acceptedContent(ctx.mcpReq.inputResponses, 'step2')?.color ?? 'unknown';
    return { content: [{ type: 'text', text: 'Multi-round complete: ' + String(state?.name ?? 'unknown') + ' likes ' + color }] };
  });

  server.registerTool('test_input_required_result_tampered_state', {
    description: 'Conformance-only HMAC tampered-state rejection fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    if (ctx.mcpReq.requestState() !== undefined
      && acceptedContent(ctx.mcpReq.inputResponses, 'confirm') !== undefined) {
      return { content: [{ type: 'text', text: 'integrity-ok: requestState verified' }] };
    }
    return inputRequired({
      inputRequests: {
        confirm: inputRequired.elicit({
          message: 'Please confirm',
          requestedSchema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          },
        }),
      },
      requestState: await requestStateCodec.mint({ tool: 'tampered_state', nonce: randomUUID() }),
    });
  });

  server.registerTool('test_input_required_result_capabilities', {
    description: 'Conformance-only client-capability-aware input request fixture.',
    inputSchema: emptySchema,
  }, async (_args, ctx) => {
    if (ctx.mcpReq.inputResponses !== undefined) {
      return { content: [{ type: 'text', text: 'Capability-aware input requests fulfilled' }] };
    }
    const declared = ctx.mcpReq.envelope?.[CLIENT_CAPABILITIES_META_KEY] || {};
    const inputRequests = {};
    if (declared.elicitation !== undefined) {
      inputRequests.user_name = inputRequired.elicit({
        message: 'What is your name?',
        requestedSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      });
    }
    if (declared.sampling !== undefined) {
      inputRequests.greeting = inputRequired.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: 'Generate a short greeting' } }],
        maxTokens: 50,
      });
    }
    if (declared.roots !== undefined) {
      inputRequests.client_roots = inputRequired.listRoots();
    }
    if (Object.keys(inputRequests).length === 0) {
      return { content: [{ type: 'text', text: 'No declared client capability supports an in-band input request' }] };
    }
    return inputRequired({ inputRequests });
  });

  // MRTR prompts/get is separately covered by the frozen 2026-07-28 profile.
  server.registerPrompt('test_input_required_result_prompt', {
    title: 'MRTR Prompt',
    description: 'Conformance-only prompt that elicits context before rendering.',
  }, async (ctx) => {
    const context = acceptedContent(ctx.mcpReq.inputResponses, 'user_context')?.context;
    if (typeof context !== 'string') {
      return inputRequired({
        inputRequests: {
          user_context: inputRequired.elicit({
            message: 'What context should the prompt use?',
            requestedSchema: {
              type: 'object',
              properties: { context: { type: 'string' } },
              required: ['context'],
            },
          }),
        },
      });
    }
    return {
      messages: [{
        role: 'user',
        content: { type: 'text', text: 'Use the following context: ' + context },
      }],
    };
  });
}
