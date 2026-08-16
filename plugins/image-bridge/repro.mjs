// repro.mjs — isolate the llm dispatch machinery with the REAL LlmRuntime.
// Registers a fake 'deepseek-official' adapter and the image-bridge wrapper
// for 'deepseek-vision', then dispatches a request containing an image block
// to see exactly what the wrapper receives.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const app = 'D:/deepseekexe/DeepSeek Harness/app/node_modules'
const cordisUrl = pathToFileURL(join(app, '@deepseek-ai/cordis/lib/index.js')).href
const { Context } = await import(cordisUrl)
const llmUrl = pathToFileURL(join(app, '@deepseek-ai/dsh-llm/lib/index.js')).href
const { default: LlmRuntime, LlmAdapter } = await import(llmUrl)

const root = new Context()
root.provide('logger', { info: (...a) => console.log('[log]', ...a), warn: (...a) => console.warn('[warn]', ...a) })
const llm = new LlmRuntime(root)
llm.start?.()

// Fake target adapter (stands in for dsh-llm-deepseek)
class FakeDeepSeek extends LlmAdapter {
  providerInfo(p) { return { id: p, name: 'Fake DeepSeek' } }
  listModels(p) { return Promise.resolve([
    { provider: p, id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', inputModalities: ['text'] },
  ]) }
  resolveModel(p, m) { return Promise.resolve({ provider: p, id: m, name: m, inputModalities: ['text'] }) }
  async *stream(options) {
    const types = options.messages.flatMap((msg) => (Array.isArray(msg.content) ? msg.content : [msg.content]).map((b) => b.type))
    console.log('[FAKE-DEEPSEEK] stream() message block types:', JSON.stringify(types))
    if (options.messages.some((msg) => Array.isArray(msg.content) && msg.content.some((b) => b.type === 'image'))) {
      throw new Error('The DeepSeek chat-completions adapter does not support image content. (UNSUPPORTED_CONTENT)')
    }
    yield { type: 'text', text: 'ok from fake deepseek' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
llm.registerAdapter(['deepseek-official'], new FakeDeepSeek())

// The image-bridge wrapper (same logic as the plugin)
const PROVIDER = 'deepseek-vision'
const TARGET = 'deepseek-official'
function convertContent(blocks) {
  let changed = false
  const out = []
  for (const block of blocks) {
    console.log('[convertContent]   block.type=', JSON.stringify(block?.type))
    if (block.type === 'image') {
      out.push({ type: 'text', text: `[OCR of ${block.attachment.name}]` })
      changed = true
    } else out.push(block)
  }
  return changed ? out : blocks
}

function convertMessages(messages) {
  let changed = false
  const out = []
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      const content = convertContent(message.content)
      if (content !== message.content) {
        out.push({ ...message, content })
        changed = true
      } else out.push(message)
    } else out.push(message)
  }
  return changed ? out : messages
}
const wrapper = {
  providerInfo(p) { return { id: p, name: 'Bridge' } },
  providerRetryPolicy() { return undefined },
  async listModels(p) {
    const models = await llm.listModels(TARGET)
    return models.map((m) => ({ ...m, provider: p, inputModalities: ['text', 'image'] }))
  },
  async resolveModel(p, m, s) {
    const info = await llm.resolveModelInfo(TARGET, m, s)
    return { ...info, provider: p, inputModalities: ['text', 'image'] }
  },
  async *stream(options) {
    console.log('[WRAPPER] stream() called provider=', options.provider)
    for (const msg of options.messages) {
      console.log('[WRAPPER]   role=', msg.role, 'blocks=', msg.content?.map((b) => b.type))
    }
    const messages = convertMessages(options.messages)
    console.log('[WRAPPER]   converted=', messages !== options.messages)
    const inner = messages === options.messages ? { ...options, provider: TARGET } : { ...options, provider: TARGET, messages }
    yield* llm.stream(inner)
  },
}
llm.registerAdapter([PROVIDER], wrapper)

// Dispatch like the agent-loop does: prepareCall then stream
const config = { provider: PROVIDER, model: 'deepseek-v4-flash' }
const prepared = await llm.prepareCall(config, undefined)
console.log('[MAIN] prepared config provider=', prepared.config.provider)
const request = {
  ...prepared.config,
  messages: [
    { role: 'user', id: 'm1', content: [
      { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', width: 640, height: 400, bytes: 100, name: 'vision_test.png' } },
      { type: 'text', text: 'hello' },
    ] },
  ],
  sessionId: 'session-test',
  signal: undefined,
}
for await (const chunk of prepared.stream(request)) {
  console.log('[MAIN] chunk:', JSON.stringify(chunk))
}
