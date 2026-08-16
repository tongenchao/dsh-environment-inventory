/**
 * image-bridge — DeepSeek Harness vision bridge plugin (profile / host plane).
 *
 * Registers a NEW provider route `deepseek-vision` whose models declare image
 * input (`inputModalities: ["text", "image"]`), so the session model picker,
 * the prompt image gate, and the `read_image` tool all accept images while the
 * underlying model stays DeepSeek (text-only). At stream time every image
 * block in the request is converted to text evidence — via the modlens CLI
 * when configured, else via the Windows built-in OCR engine — and the
 * converted request is delegated to the original `deepseek-official` adapter.
 *
 * Install: place this file and image-bridge-ocr.ps1 next to the profile
 * `cordis.patch.yml` (e.g. ~/.dsh/profiles/web/) and append:
 *
 *   - insert:
 *       - id: image-bridge
 *         name: ./image-bridge.mjs
 *         config:
 *           modlens: ''            # set to 'modlens' (or a path) to prefer modlens
 *           ocrTimeoutMs: 90000
 *           modlensTimeoutMs: 120000
 *
 * Then select the "DeepSeek 视觉桥接" provider for the session.
 */

import { spawn } from 'node:child_process'
import { accessSync, appendFileSync, constants, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require_ = createRequire(import.meta.url)

/** Append a line to the debug log (default: %TEMP%\dsh-image-bridge.log). */
function makeLogger(config) {
  const file = typeof config.logFile === 'string' && config.logFile.length > 0 ? config.logFile : join(tmpdir(), 'dsh-image-bridge.log')
  const log = (line) => {
    try {
      appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      // logging must never break the bridge
    }
  }
  return {
    file,
    log,
    info: (line) => log(`info: ${line}`),
    warn: (line) => log(`warn: ${line}`),
  }
}

export const name = 'image-bridge'

/** The llm service must exist before this plugin registers its adapter route. */
export const inject = ['llm']

/** Provider route this plugin owns. */
const PROVIDER = 'deepseek-vision'
/** The real text-only adapter that performs the actual model calls. */
const TARGET = 'deepseek-official'

const MEDIA_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const OCR_SCRIPT = fileURLToPath(new URL('./image-bridge-ocr.ps1', import.meta.url))

/** Cap cached OCR evidence (per attachmentId) so long sessions stay bounded. */
const DEFAULT_CACHE_SIZE = 128
const MAX_EVIDENCE_CHARS = 8000

/**
 * Resolve the modlens invocation into (command, args-prefix): Node cannot
 * spawn a .cmd/.bat directly on Windows (EINVAL), so point node at the real
 * JS entry when the configured value is a .cmd wrapper.
 */
function modlensInvocation(config) {
  const ml = typeof config.modlens === 'string' ? config.modlens.trim() : ''
  if (!ml) return undefined
  if (/\.cmd$/i.test(ml) || /\.bat$/i.test(ml)) {
    // npm global .cmd wrappers call: node "<dp0>\node_modules\<pkg>\dist\main.js"
    const entry = join(dirname(ml), 'node_modules', '@liustack', 'modlens', 'dist', 'main.js')
    try {
      accessSync(entry)
      return { command: process.execPath, args: [entry] }
    } catch {
      return { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${ml}"`] }
    }
  }
  if (/\.(c|m)?js$/i.test(ml)) return { command: process.execPath, args: [ml] }
  return { command: ml, args: [] }
}

/** Resolve the shell that runs the OCR script: PowerShell 7 first, then Windows PowerShell 5.1. */
function resolveShell(logger) {
  if (process.platform !== 'win32') return undefined
  const candidates = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'PowerShell', '7', 'pwsh.exe'),
  ]
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  // Windows PowerShell 5.1 is present on every Windows install; spawn by bare name.
  return 'powershell.exe'
}

/** Run a command with args, capturing stdout/stderr, bounded by a timeout and the caller's abort signal. */
function runCommand(command, args, env, timeoutMs, signal) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, {
        env: { ...process.env, ...env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ ok: false, code: undefined, stdout: '', stderr: String(error) })
      return
    }
    const out = []
    const err = []
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, code: undefined, stdout: out.join(''), stderr: `timed out after ${timeoutMs}ms`, timedOut: true })
    }, timeoutMs)
    signal?.addEventListener('abort', () => {
      child.kill()
      finish({ ok: false, code: undefined, stdout: out.join(''), stderr: 'aborted', aborted: true })
    }, { once: true })
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', (chunk) => err.push(chunk))
    child.on('error', (error) => finish({ ok: false, code: undefined, stdout: out.join(''), stderr: String(error) }))
    child.on('close', (code) => finish({ ok: code === 0, code, stdout: out.join(''), stderr: err.join('') }))
  })
}

function runScript(shell, scriptPath, env, timeoutMs, signal) {
  return runCommand(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], env, timeoutMs, signal)
}

/** Parse "text\tx\ty\tw\th" lines from the OCR script into text lines with boxes. */
function parseOcrLines(stdout) {
  const lines = []
  for (const raw of stdout.split(/\r?\n/)) {
    if (!raw.trim()) continue
    const [text, x, y, w, h] = raw.split('\t')
    if (text === undefined) continue
    lines.push({ text, x: Number(x), y: Number(y), w: Number(w), h: Number(h) })
  }
  return lines
}

function formatEvidence(index, stored, body, source) {
  const name = stored.ref.name ?? `image-${index + 1}`
  const dims = stored.ref.width !== undefined && stored.ref.height !== undefined
    ? `${stored.ref.width}x${stored.ref.height} px`
    : `${stored.ref.bytes} bytes`
  return `[图片 ${index + 1}] ${name} (${stored.ref.mediaType}, ${dims}, ${source})\n${body}`
}

/**
 * Convert one image attachment into text evidence.
 * Backend chain: modlens CLI (when configured) -> Windows built-in OCR.
 */
async function convertImage(ctx, config, shell, cache, signal, logger, block, index) {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) {
    return `[图片 ${index + 1}] 无法读取：附件服务不可用`
  }
  const key = String(block.attachment.attachmentId)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  let stored
  try {
    stored = await attachments.readImage(block.attachment, signal)
    logger?.info?.(`convertImage: readImage ok attachmentId=${key} mediaType=${stored.ref.mediaType} bytes=${stored.ref.bytes} name=${String(stored.ref.name)}`)
  } catch (error) {
    logger?.warn?.(`convertImage: readImage failed attachmentId=${key}: ${error?.message ?? String(error)}`)
    const text = `[图片 ${index + 1}] 读取失败：${error?.message ?? String(error)}`
    cache.set(key, text)
    return text
  }

  const ext = MEDIA_EXT[stored.ref.mediaType]
  if (ext === undefined) {
    const text = `[图片 ${index + 1}] 不支持的图片类型：${stored.ref.mediaType}`
    cache.set(key, text)
    return text
  }

  const dir = mkdtempSync(join(tmpdir(), 'dsh-image-bridge-'))
  const imagePath = join(dir, `image${ext}`)
  const outPath = join(dir, 'evidence.json')
  let result
  try {
    writeFileSync(imagePath, stored.data)

    const modlens = config.modlens
    const invocation = modlensInvocation(config)
    if (invocation !== undefined) {
      const run = await runCommand(
        invocation.command,
        [...invocation.args, 'analyze', '-i', imagePath, '-o', outPath, '--timeout', String(config.modlensTimeoutMs ?? 180000)],
        {},
        config.modlensTimeoutMs ?? 180000,
        signal,
      )
      // Success is judged by the evidence FILE, not the exit code: the modlens
      // .cmd wrapper on Windows reports a non-zero exit even on success.
      let evidence
      try {
        evidence = readFileSync(outPath, 'utf8')
      } catch {
        evidence = ''
      }
      if (!evidence || !evidence.trim()) evidence = run.ok ? run.stdout : ''
      if (evidence && evidence.trim()) {
        const text = formatEvidence(index, stored, evidence.slice(0, MAX_EVIDENCE_CHARS), 'modlens')
        cache.set(key, text)
        logger?.info?.(`convertImage: modlens evidence used (attachmentId=${key})`)
        return text
      }
      logger?.warn?.(`image-bridge: modlens produced no evidence (${run.stderr.trim() || `exit ${run.code}`}), falling back to OCR`)
    }

    // Windows built-in OCR
    if (process.platform !== 'win32' || shell === undefined) {
      const text = formatEvidence(index, stored, '（本机没有可用的 OCR 后端）', 'unavailable')
      cache.set(key, text)
      return text
    }
    const run = await runScript(shell, OCR_SCRIPT, { IMAGE_BRIDGE_OCR_IMAGE: imagePath }, config.ocrTimeoutMs ?? 90000, signal)
    if (run.ok) {
      const lines = parseOcrLines(run.stdout)
      if (lines.length === 0) {
        const text = formatEvidence(index, stored, '（OCR 未识别到文字：图片可能不含文本，或需要视觉模型/放大截图）', 'Windows OCR')
        cache.set(key, text)
        return text
      }
      const body = lines.map((line) => line.text).join('\n')
      const text = formatEvidence(index, stored, body, 'Windows OCR')
      cache.set(key, text)
      return text
    }
    const text = formatEvidence(index, stored, `（图片解析失败：${run.stderr.trim() || 'OCR 不可用'}）`, 'error')
    cache.set(key, text)
    return text
  } catch (error) {
    const text = formatEvidence(index, stored, `（图片解析异常：${error?.message ?? String(error)}）`, 'error')
    cache.set(key, text)
    return text
  } finally {
    for (const file of [imagePath, outPath]) {
      try {
        unlinkSync(file)
      } catch {
        // best-effort cleanup
      }
    }
    try {
      rmdirSync(dir)
    } catch {
      // best-effort cleanup
    }
  }
}

/** Recursively replace image blocks with text evidence inside one content array. */
async function convertContent(ctx, config, shell, cache, signal, logger, blocks, state) {
  let changed = false
  const out = []
  for (const block of blocks) {
    if (block.type === 'image') {
      const evidence = await convertImage(ctx, config, shell, cache, signal, logger, block, state.imageIndex++)
      out.push({ type: 'text', text: evidence })
      changed = true
    } else if (block.type === 'tool-result' && Array.isArray(block.content)) {
      const nested = await convertContent(ctx, config, shell, cache, signal, logger, block.content, state)
      if (nested !== block.content) {
        out.push({ ...block, content: nested })
        changed = true
      } else {
        out.push(block)
      }
    } else {
      out.push(block)
    }
  }
  return changed ? out : blocks
}

/** Replace image blocks with text evidence across every message in a request. */
async function convertMessages(ctx, config, shell, cache, signal, logger, messages, state) {
  let changed = false
  const out = []
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      const content = await convertContent(ctx, config, shell, cache, signal, logger, message.content, state)
      if (content !== message.content) {
        out.push({ ...message, content })
        changed = true
      } else {
        out.push(message)
      }
    } else {
      out.push(message)
    }
  }
  return changed ? out : messages
}

export function apply(ctx, config = {}) {
  const logger = makeLogger(config)
  logger.log(`apply() started; config=${JSON.stringify(config)}`)
  const cache = new Map()
  const cacheSize = Number.isInteger(config.cacheSize) ? config.cacheSize : DEFAULT_CACHE_SIZE
  const shell = resolveShell(ctx.logger)
  logger.log(`shell resolved: ${String(shell)}; OCR script: ${OCR_SCRIPT}`)

  const adapter = {
    providerInfo(provider) {
      return { id: provider, name: 'DeepSeek 视觉桥接' }
    },
    providerRetryPolicy() {
      return undefined
    },
    async listModels(provider) {
      const models = await ctx.llm.listModels(TARGET)
      return models.map((model) => ({ ...model, provider, inputModalities: ['text', 'image'] }))
    },
    async resolveModel(provider, model, signal) {
      const info = await ctx.llm.resolveModelInfo(TARGET, model, signal)
      return { ...info, provider, inputModalities: ['text', 'image'] }
    },
    async *stream(options) {
      logger.log(`stream() called: provider=${options.provider} model=${options.model} purpose=${String(options.purpose)} messages=${Array.isArray(options.messages) ? options.messages.length : typeof options.messages}`)
      if (Array.isArray(options.messages)) {
        for (const message of options.messages) {
          const types = Array.isArray(message.content) ? message.content.map((block) => block.type).join(',') : typeof message.content
          logger.log(`  message role=${message.role} content=[${types}]`)
        }
      }
      const messages = await convertMessages(ctx, config, shell, cache, options.signal, logger, options.messages, { imageIndex: 0 })
      logger.log(`  convertMessages done: changed=${messages !== options.messages}`)
      // A NEW options object: the agent-loop invariant marks requests by object
      // identity, so the delegated call must not re-trigger loop validation.
      const inner = messages === options.messages
        ? { ...options, provider: TARGET }
        : { ...options, provider: TARGET, messages }
      yield* ctx.llm.stream(inner)
    },
  }

  ctx.llm.registerAdapter([PROVIDER], adapter)
  logger.log(`provider "${PROVIDER}" registered`)
  ctx.logger?.info?.(`image-bridge: provider "${PROVIDER}" registered (models declare image input; images convert to text via ${config.modlens ? 'modlens -> Windows OCR' : 'Windows OCR'})`)
}
