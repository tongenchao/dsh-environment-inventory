/**
 * image-display — ChatGPT-style inline images for DeepSeek Harness.
 *
 * Two tools:
 *   - show_image(file_path, caption?): display an existing workspace image
 *     inline in the chat.
 *   - generate_image(prompt, size?, caption?): AI text-to-image via the
 *     SiliconFlow API (key from ~/.modlens/config.json or SILICONFLOW_API_KEY),
 *     then display it inline.
 *
 * Mechanism: the image is durably saved through the attachment service; the
 * plugin then injects a markdown image URL at the END of the next assistant
 * stream for that session (via the `llm/stream` waterfall), so the image
 * always renders inside the chat message — no model discretion, no image
 * blocks in history (text-only markdown, safe for every provider).
 *
 * The image bytes are served by a local webServer route
 * (`/plugins/image-display/image/<attachmentId>`) from the attachment store.
 * In-memory ref table is process-lifetime: images generated before a DSH
 * restart render only if the chat was not reloaded after the restart.
 */

import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

/** Append a line to the debug log (default: ~/.dsh/profiles/web/image-display.log). */
function makeLogger(config) {
  const file = typeof config.logFile === 'string' && config.logFile.length > 0
    ? config.logFile
    : join(homedir(), '.dsh', 'profiles', 'web', 'image-display.log')
  const log = (line) => {
    try {
      appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      // logging must never break the plugin
    }
  }
  return { file, log, info: (line) => log(`info: ${line}`), warn: (line) => log(`warn: ${line}`) }
}

export const name = 'image-display'

/** Services accessed as direct ctx properties must be declared here (Cordis inject rule). */
export const inject = ['llm', 'tools', 'fs', 'webServer', 'attachments']

const ROUTE_PREFIX = '/plugins/image-display/image/'
const FILE_ROUTE = '/plugins/image-display/file/'
const MAX_READ_BYTES = 15 * 1024 * 1024
const MAX_SHARE_BYTES = 100 * 1024 * 1024
const GENERATE_TIMEOUT_MS = 180000
const DEFAULT_GENERATE_MODEL = 'Qwen/Qwen-Image'
const DEFAULT_IMAGE_SIZE = '1024x1024'

/** attachmentId -> full ref (needed by readImage's integrity verification). */
const refs = new Map()
/**
 * sessionId -> items to attach to the next assistant reply:
 *   { kind: 'image', ref, caption }   -> rendered as an inline image
 *   { kind: 'link',  markdown }       -> rendered as a clickable download link
 */
const pending = new Map()

const EXT_MEDIA = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

function mediaTypeForPath(filePath) {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return undefined
  return EXT_MEDIA[filePath.slice(dot).toLowerCase()]
}

/** Detect raster media type from magic bytes (matches the attachment service's own validation). */
function mediaTypeFromBytes(data) {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return 'image/gif'
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
    && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp'
  return undefined
}

/** Read the SiliconFlow key/baseUrl from the shared modlens config (or env). */
function siliconFlowConfig(config) {
  const fromEnvKey = process.env.SILICONFLOW_API_KEY
  let baseUrl = typeof config.siliconFlowBaseUrl === 'string' && config.siliconFlowBaseUrl
    ? config.siliconFlowBaseUrl
    : 'https://api.siliconflow.cn/v1'
  let apiKey = fromEnvKey
  try {
    const raw = readFileSync(join(homedir(), '.modlens', 'config.json'), 'utf8')
    const parsed = JSON.parse(raw)
    const openai = parsed?.providers?.openai
    if (typeof openai?.baseUrl === 'string' && openai.baseUrl) baseUrl = openai.baseUrl
    if (apiKey === undefined && typeof openai?.apiKey === 'string' && openai.apiKey) apiKey = openai.apiKey
  } catch {
    // no modlens config; env/config only
  }
  if (!apiKey) throw new Error('generate_image: no SiliconFlow API key (set SILICONFLOW_API_KEY or configure ~/.modlens/config.json)')
  return { baseUrl, apiKey }
}

/** Save bytes as a durable attachment and queue them for the next reply. */
async function saveAndQueue(ctx, exec, data, mediaType, name, caption) {
  const attachments = ctx.attachments
  if (attachments === undefined) throw new Error('attachment service is unavailable')
  const ref = await attachments.saveImage({ data, mediaType, name })
  refs.set(String(ref.attachmentId), ref)
  const sessionId = exec.agent?.session?.id
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const list = pending.get(sessionId) ?? []
    list.push({ ref, caption })
    pending.set(sessionId, list)
  }
  return ref
}

export function apply(ctx, config = {}) {
  const logger = makeLogger(config)
  logger.log(`apply() started; config=${JSON.stringify(config)}`)
  const webServerAtApply = ctx.webServer
  logger.log(`webServer at apply: ${webServerAtApply === undefined ? 'UNDEFINED' : 'available'}`)

  // ── local routes: image bytes + file downloads for the browser ────────────
  // Retry until the webServer service is mounted (boot order is not guaranteed).
  const registerRoute = () => {
    const webServer = ctx.webServer
    if (webServer === undefined) {
      logger.log('webServer unavailable, retrying in 2s')
      setTimeout(registerRoute, 2000)
      return
    }
    try {
      webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX.slice(0, -1),
        handler: async (req, res) => {
          try {
            const pathname = new URL(req.url ?? '/', 'http://x').pathname
            const id = decodeURIComponent(pathname.slice(ROUTE_PREFIX.length))
            const ref = refs.get(id)
            if (ref === undefined) {
              res.writeHead(404)
              res.end('image not found')
              return
            }
            const stored = await ctx.attachments.readImage(ref)
            res.writeHead(200, {
              'content-type': ref.mediaType,
              'content-length': stored.data.length,
              'cache-control': 'private, max-age=86400',
            })
            res.end(stored.data)
          } catch {
            res.writeHead(404)
            res.end('image not found')
          }
        },
      })
      logger.log(`route registered at ${ROUTE_PREFIX.slice(0, -1)}`)
    } catch (error) {
      logger.warn(`route registration failed: ${error?.message ?? String(error)}`)
    }
    // File download route: /plugins/image-display/file/<base64url(absolute path)>
    try {
      webServer.register({
        kind: 'prefix',
        path: FILE_ROUTE.slice(0, -1),
        handler: async (req, res) => {
          try {
            const pathname = new URL(req.url ?? '/', 'http://x').pathname
            const encoded = pathname.slice(FILE_ROUTE.length)
            const filePath = Buffer.from(encoded, 'base64url').toString('utf8')
            const info = statSync(filePath)
            if (!info.isFile()) {
              res.writeHead(404)
              res.end('file not found')
              return
            }
            const data = readFileSync(filePath)
            const name = filePath.split(/[\\/]/).pop() ?? 'download'
            const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
            res.writeHead(200, {
              'content-type': 'application/octet-stream',
              'content-length': data.length,
              // RFC 5987: ASCII fallback + UTF-8 filename* (raw non-ASCII header
              // values make Node throw ERR_INVALID_CHAR, which would 404 here).
              'content-disposition': `attachment; filename="download${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`,
              'cache-control': 'private, max-age=3600',
            })
            res.end(data)
          } catch {
            res.writeHead(404)
            res.end('file not found')
          }
        },
      })
      logger.log(`file route registered at ${FILE_ROUTE.slice(0, -1)}`)
    } catch (error) {
      logger.warn(`file route registration failed: ${error?.message ?? String(error)}`)
    }
  }
  registerRoute()
  void webServerAtApply

  // ── show_image: display an existing image inline ──────────────────────────
  ctx.tools.register({
    name: 'show_image',
    description: 'Display an image file inline in the conversation (rendered in the chat, like ChatGPT). Call this when the user should see an image: after generating one, or to show a screenshot/diagram from the workspace. Accepts PNG/JPEG/WebP/GIF.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the image file, resolved by the filesystem backend.',
        },
        caption: {
          type: 'string',
          description: 'Optional short caption displayed under the image.',
        },
      },
      required: ['file_path'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          path: { type: 'string' },
          caption: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.caption ? `图片已显示：${value.path}（${value.caption}）` : `图片已显示：${value.path}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (typeof args.file_path !== 'string' || args.file_path.trim().length === 0) {
        throw new Error('show_image: file_path must be a non-empty string')
      }
      const mediaType = mediaTypeForPath(args.file_path)
      if (mediaType === undefined) {
        throw new Error(`show_image: "${args.file_path}" is not a PNG/JPEG/WebP/GIF image path`)
      }
      const cwd = exec.agent?.session?.header?.cwd
      const target = await ctx.fs.resolve(args.file_path, {
        ...(typeof cwd === 'string' ? { cwd } : {}),
        signal: exec.signal,
      })
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined || info.type !== 'file') {
        throw new Error(`show_image: "${target.displayPath}" not found or not a regular file`)
      }
      const data = await ctx.fs.readBytes(target, exec.signal, MAX_READ_BYTES)
      await saveAndQueue(ctx, exec, data, mediaType, basename(target.displayPath), args.caption)
      return { ok: true, path: target.displayPath, caption: args.caption }
    },
  })

  // ── generate_image: AI text-to-image, displayed inline ────────────────────
  ctx.tools.register({
    name: 'generate_image',
    description: 'Generate an image from a text prompt with an AI image model (SiliconFlow) and display it inline in the conversation. The generated file is saved under the workspace as well.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: {
          type: 'string',
          description: 'The image description. Be specific about subject, style, colors, and composition.',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1280x720', '720x1280'],
          description: 'Output size. Defaults to 1024x1024.',
        },
        caption: {
          type: 'string',
          description: 'Optional short caption displayed under the image.',
        },
      },
      required: ['prompt'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          path: { type: 'string' },
          caption: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `图片已生成：${value.path}${value.caption ? `（${value.caption}）` : ''}`,
      }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (typeof args.prompt !== 'string' || args.prompt.trim().length === 0) {
        throw new Error('generate_image: prompt must be a non-empty string')
      }
      const { baseUrl, apiKey } = siliconFlowConfig(config)
      const endpoint = `${baseUrl.replace(/\/+$/, '')}/images/generations`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('generate_image timed out')), GENERATE_TIMEOUT_MS)
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.generateModel ?? DEFAULT_GENERATE_MODEL,
            prompt: args.prompt,
            image_size: args.size ?? DEFAULT_IMAGE_SIZE,
            batch_size: 1,
            num_inference_steps: config.generateSteps ?? 20,
          }),
          signal: exec.signal ?? controller.signal,
        })
        if (!response.ok) {
          const body = await response.text().catch(() => '')
          throw new Error(`generate_image: API ${response.status} ${body.slice(0, 300)}`)
        }
        const json = await response.json()
        const imageUrl = json?.images?.[0]?.url ?? json?.data?.[0]?.url
        if (typeof imageUrl !== 'string') throw new Error('generate_image: API returned no image URL')
        const imageResponse = await fetch(imageUrl, { signal: exec.signal ?? controller.signal })
        if (!imageResponse.ok) throw new Error(`generate_image: failed to download image (${imageResponse.status})`)
        const data = Buffer.from(await imageResponse.arrayBuffer())
        const mediaType = mediaTypeFromBytes(data)
        if (mediaType === undefined) throw new Error('generate_image: downloaded bytes are not a recognized image')
        const ref = await saveAndQueue(ctx, exec, data, mediaType, `generated_${Date.now()}.png`, args.caption)
        // Also drop a copy in the workspace so the file persists for the user.
        try {
          const cwd = exec.agent?.session?.header?.cwd
          const target = await ctx.fs.resolve(`generated_${Date.now()}.png`, {
            ...(typeof cwd === 'string' ? { cwd } : {}),
            signal: exec.signal,
          })
          writeFileSync(ctx.fs.processPath(target), data)
          return { ok: true, path: target.displayPath, caption: args.caption }
        } catch {
          return { ok: true, path: `attachment:${String(ref.attachmentId)}`, caption: args.caption }
        }
      } finally {
        clearTimeout(timer)
      }
    },
  })

  // ── share_file: turn a workspace file into a clickable download link ──────
  ctx.tools.register({
    name: 'share_file',
    description: 'Publish a file (document, spreadsheet, presentation, archive, image, ...) from the workspace as a clickable download link inside the chat reply, like ChatGPT. Call this when the user should be able to download a file you produced. The link is appended to your next reply automatically.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to share, resolved by the filesystem backend.',
        },
        label: {
          type: 'string',
          description: 'Optional link text, e.g. "下载 汇报PPT.pptx". Defaults to the file name.',
        },
      },
      required: ['file_path'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          path: { type: 'string' },
          url: { type: 'string' },
          label: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `文件已分享：${value.label}（${value.path}）`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (typeof args.file_path !== 'string' || args.file_path.trim().length === 0) {
        throw new Error('share_file: file_path must be a non-empty string')
      }
      const cwd = exec.agent?.session?.header?.cwd
      const target = await ctx.fs.resolve(args.file_path, {
        ...(typeof cwd === 'string' ? { cwd } : {}),
        signal: exec.signal,
      })
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined || info.type !== 'file') {
        throw new Error(`share_file: "${target.displayPath}" not found or not a regular file`)
      }
      if (info.size !== undefined && info.size > MAX_SHARE_BYTES) {
        throw new Error(`share_file: "${target.displayPath}" is larger than ${Math.round(MAX_SHARE_BYTES / 1048576)} MB`)
      }
      const absPath = ctx.fs.processPath(target)
      const sessionId = exec.agent?.session?.id
      const label = typeof args.label === 'string' && args.label.trim() ? args.label.trim() : target.displayPath.split(/[\\/]/).pop()
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        const port = ctx.webServer?.port ?? 3080
        const url = `http://127.0.0.1:${port}${FILE_ROUTE}${Buffer.from(absPath, 'utf8').toString('base64url')}`
        const markdown = `\n\n📎 [${label}](<${url}>)\n`
        const list = pending.get(sessionId) ?? []
        list.push({ kind: 'link', markdown })
        pending.set(sessionId, list)
        return { ok: true, path: target.displayPath, url, label }
      }
      return { ok: true, path: target.displayPath, url: '', label }
    },
  })

  // ── stream hook: append pending image/link markdown to the next reply ──────
  ctx.on('llm/stream', (options, next) => {
    const result = next()
    const sessionId = options?.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) return result
    if (options.purpose === 'session-title' || options.purpose === 'compaction') return result
    const items = pending.get(sessionId)
    if (items === undefined || items.length === 0) return result
    // A thenable downstream means an async listener we cannot wrap safely; skip.
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') return result
    logger.log(`injecting ${items.length} item(s) into stream for session ${sessionId}`)
    return (async function* () {
      yield* result
      pending.delete(sessionId)
      const port = ctx.webServer?.port ?? 3080
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const index = 9000 + i
        const markdown = item.kind === 'link'
          ? item.markdown
          : `\n\n![${item.caption ?? '图片'}](<http://127.0.0.1:${port}${ROUTE_PREFIX}${encodeURIComponent(String(item.ref.attachmentId))}>)\n`
        yield { type: 'block-start', index, blockType: 'text' }
        yield { type: 'text-delta', index, text: markdown }
        yield { type: 'block-end', index, block: { type: 'text', text: markdown } }
      }
    })()
  })
  logger.log('apply() completed (tools + hook registered)')
}
