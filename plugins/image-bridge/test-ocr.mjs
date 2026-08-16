// test-ocr.mjs — mirrors the exact commands image-bridge.mjs will run, to
// validate the OCR pipeline end to end outside the harness.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OCR_SCRIPT = fileURLToPath(new URL('./image-bridge-ocr.ps1', import.meta.url))
const SHELL = process.env.PS7_PWSH ?? 'powershell.exe'

function runCommand(command, args, env, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ ok: false, code: undefined, stdout: '', stderr: String(error) })
      return
    }
    const out = []; const err = []
    let settled = false
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v) } }
    const timer = setTimeout(() => { child.kill(); finish({ ok: false, code: undefined, stdout: out.join(''), stderr: 'timed out' }) }, timeoutMs)
    child.stdout.on('data', (c) => out.push(c))
    child.stderr.on('data', (c) => err.push(c))
    child.on('error', (e) => finish({ ok: false, code: undefined, stdout: out.join(''), stderr: String(e) }))
    child.on('close', (code) => finish({ ok: code === 0, code, stdout: out.join(''), stderr: err.join('') }))
  })
}

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

async function convert(imagePath) {
  const bytes = readFileSync(imagePath)
  const dir = mkdtempSync(join(tmpdir(), 'dsh-image-bridge-test-'))
  const img = join(dir, 'image.png')
  writeFileSync(img, bytes)
  try {
    const run = await runCommand(SHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', OCR_SCRIPT], { IMAGE_BRIDGE_OCR_IMAGE: img }, 90000)
    if (!run.ok) return `FAILED (exit ${run.code}): ${run.stderr.trim() || '(no stderr)'}`
    const lines = parseOcrLines(run.stdout)
    if (lines.length === 0) return 'OK but no text recognized'
    return `OK (${lines.length} lines):\n` + lines.map((l) => `  [${l.x},${l.y} ${l.w}x${l.h}] ${l.text}`).join('\n')
  } finally {
    try { unlinkSync(img) } catch {}
    try { rmdirSync(dir) } catch {}
  }
}

const target = process.argv[2]
if (!target) { console.error('usage: node test-ocr.mjs <image>'); process.exit(2) }
console.log(`== ${target} ==`)
console.log(await convert(target))
