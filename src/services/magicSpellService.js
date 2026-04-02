const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_STORY_ENDPOINT = '/api/magic-spell/story'
const DEFAULT_IMAGE_ENDPOINT = '/api/magic-spell/image'

export const COSTAR_FIELDS = [
  {
    key: 'context',
    letter: 'C',
    label: 'Context',
    accent: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.32)',
    placeholder: '场景、背景、世界观、约束条件',
  },
  {
    key: 'objective',
    letter: 'O',
    label: 'Objective',
    accent: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.32)',
    placeholder: '你想让模型完成什么目标',
  },
  {
    key: 'style',
    letter: 'S',
    label: 'Style',
    accent: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.32)',
    placeholder: '风格、文风、表达方式',
  },
  {
    key: 'tone',
    letter: 'T',
    label: 'Tone',
    accent: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.32)',
    placeholder: '语气、情绪、节奏',
  },
  {
    key: 'audience',
    letter: 'A',
    label: 'Audience',
    accent: '#fb7185',
    glow: 'rgba(251, 113, 133, 0.32)',
    placeholder: '目标受众、适用对象',
  },
  {
    key: 'response',
    letter: 'R',
    label: 'Response',
    accent: '#00f5ff',
    glow: 'rgba(0, 245, 255, 0.32)',
    placeholder: '输出格式、长度、结构、约束',
  },
]

function cleanText(value) {
  return String(value ?? '').trim()
}

/** 用户是否在咒语里明确要求网页/HTML 代码 */
function userWantsHtmlOutput(prompt) {
  return /html|DOCTYPE|<\s*html|网页源码|完整\s*html|页面代码|源代码|\.html\b|可运行.*html|输出.*html|生成.*网页代码/i.test(
    prompt || '',
  )
}

function stripOuterMarkdownCodeFence(text) {
  let t = String(text ?? '').trim()
  const m = t.match(/^```(?:html|HTML|htm)?\s*\n?([\s\S]*?)\n?```\s*$/m)
  if (m) return m[1].trim()
  return t.replace(/^```(?:html|HTML)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

/** 是否像整页 HTML（避免普通文本区被源码刷屏） */
function looksLikeFullHtmlDocument(text) {
  const t = stripOuterMarkdownCodeFence(text)
  if (/^<!DOCTYPE\s+html/i.test(t)) return true
  if (/^<html[\s>]/i.test(t)) return true
  if (/<body[\s>]/.test(t) && /<\/html>/i.test(t)) return true
  if (/<head[\s>]/.test(t) && /<\/html>/i.test(t) && t.length > 400) return true
  return false
}

const TEXT_STAGE_HTML_BLOCKED_MSG = [
  '【说明】这一步的「普通文本」默认是：**中文说明、小故事或玩法介绍**，不是整页网页代码。',
  '',
  '可以改成例如：「用一段话介绍数学速算小游戏的玩法和计分方式」。',
  '若你确实需要可拷贝运行的 HTML，请在咒语里写明：**请输出完整 HTML 源代码**。',
].join('\n')

function normalizeTextStageOutput(rawText, userPrompt) {
  const t = cleanText(rawText)
  if (!t) return t
  if (userWantsHtmlOutput(userPrompt)) return t
  if (looksLikeFullHtmlDocument(t)) return TEXT_STAGE_HTML_BLOCKED_MSG
  return t
}

function truncateText(value, maxLength = 120) {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function resolveConfig() {
  const provider = cleanText(import.meta.env.VITE_MAGIC_SPELL_PROVIDER).toLowerCase()
  const xaiApiKey = cleanText(import.meta.env.VITE_XAI_API_KEY)
  const xaiBaseUrl = cleanText(import.meta.env.VITE_XAI_BASE_URL) || 'https://api.x.ai/v1'
  const xaiTextModel = cleanText(import.meta.env.VITE_XAI_TEXT_MODEL) || 'grok-4-1-fast-non-reasoning'
  const xaiImageModel = cleanText(import.meta.env.VITE_XAI_IMAGE_MODEL) || 'grok-imagine-image'
  const baseUrl = cleanText(import.meta.env.VITE_MAGIC_SPELL_API_BASE)
  const storyEndpoint = cleanText(import.meta.env.VITE_MAGIC_SPELL_STORY_ENDPOINT) || DEFAULT_STORY_ENDPOINT
  const imageEndpoint = cleanText(import.meta.env.VITE_MAGIC_SPELL_IMAGE_ENDPOINT) || DEFAULT_IMAGE_ENDPOINT
  const timeoutMs = Number(
    import.meta.env.VITE_MAGIC_SPELL_TIMEOUT_MS
      || import.meta.env.VITE_XAI_TIMEOUT_MS
      || DEFAULT_TIMEOUT_MS,
  )
  return {
    provider: provider || (xaiApiKey ? 'xai' : baseUrl ? 'backend' : 'local'),
    xaiApiKey,
    xaiBaseUrl,
    xaiTextModel,
    xaiImageModel,
    baseUrl,
    storyEndpoint,
    imageEndpoint,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  }
}

function resolveUrl(endpoint) {
  const { baseUrl } = resolveConfig()
  if (!baseUrl) return endpoint
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(endpoint, normalizedBase).toString()
}

function buildRequestBody({ kind, variant, prompt, commonPrompt, finalSpell, costar }) {
  return {
    kind,
    variant,
    prompt,
    commonPrompt,
    finalSpell,
    magicPrompt: finalSpell,
    costar,
    costarFields: COSTAR_FIELDS.reduce((acc, field) => {
      acc[field.key] = cleanText(costar?.[field.key])
      return acc
    }, {}),
  }
}

function extractDeepValue(payload, keys) {
  if (!payload || typeof payload !== 'object') return null
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractDeepValue(item, keys)
      if (nested != null && nested !== '') return nested
    }
    return null
  }
  for (const key of keys) {
    const value = payload[key]
    if (value != null && value !== '') return value
  }
  if (Array.isArray(payload.choices) && payload.choices.length > 0) {
    const choice = payload.choices[0]
    if (choice?.message?.content) return choice.message.content
    if (choice?.text) return choice.text
  }
  if (payload.data != null) {
    const nested = extractDeepValue(payload.data, keys)
    if (nested != null) return nested
  }
  if (payload.result != null) {
    const nested = extractDeepValue(payload.result, keys)
    if (nested != null) return nested
  }
  if (payload.output != null) {
    const nested = extractDeepValue(payload.output, keys)
    if (nested != null) return nested
  }
  return null
}

function extractText(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') return cleanText(payload)
  if (Array.isArray(payload)) {
    return payload.map((item) => extractText(item)).filter(Boolean).join('\n')
  }
  const extracted = extractDeepValue(payload, [
    'text',
    'content',
    'answer',
    'resultText',
    'generatedText',
    'message',
    'story',
    'summary',
    'description',
    'reply',
  ])
  if (typeof extracted === 'string') return cleanText(extracted)
  if (extracted && typeof extracted === 'object') return extractText(extracted)
  return ''
}

function extractImageUrl(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') {
    const text = cleanText(payload)
    if (text.startsWith('data:image') || /^https?:\/\//i.test(text) || text.startsWith('/')) return text
    if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length > 100) return `data:image/png;base64,${text}`
    return ''
  }
  const extracted = extractDeepValue(payload, ['imageUrl', 'image_url', 'image', 'url', 'src', 'dataUrl', 'data_url'])
  if (typeof extracted === 'string') {
    const text = cleanText(extracted)
    if (text.startsWith('data:image') || /^https?:\/\//i.test(text) || text.startsWith('/')) return text
  }
  const base64 = extractDeepValue(payload, ['b64_json', 'base64', 'b64Json'])
  if (typeof base64 === 'string' && base64) {
    return `data:image/png;base64,${cleanText(base64)}`
  }
  if (Array.isArray(payload.images) && payload.images.length > 0) {
    return extractImageUrl(payload.images[0])
  }
  if (payload.data != null) {
    const nested = extractImageUrl(payload.data)
    if (nested) return nested
  }
  return ''
}

async function readResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch (_) {
    return text
  }
}

async function postJson(endpoint, body) {
  const { timeoutMs } = resolveConfig()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(resolveUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await readResponse(response)
    if (!response.ok) {
      const message = extractText(payload) || `请求失败 (${response.status})`
      throw new Error(message)
    }
    return payload
  } finally {
    window.clearTimeout(timer)
  }
}

async function postJsonToUrl(url, body, headers = {}) {
  const { timeoutMs } = resolveConfig()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await readResponse(response)
    if (!response.ok) {
      const message = extractText(payload) || `请求失败 (${response.status})`
      throw new Error(message)
    }
    return payload
  } finally {
    window.clearTimeout(timer)
  }
}

function createLocalStoryFallback({ kind, variant, prompt, commonPrompt, finalSpell, costar }) {
  const variantTitle = variant === 'magic' ? '进阶咒语' : '普通咒语'
  const segments = [
    `【${kind === 'story' ? '故事' : '图像'} · ${variantTitle} · 本地回退】`,
    `Prompt: ${truncateText(prompt || commonPrompt || finalSpell || '未提供内容', 180)}`,
  ].filter(Boolean)

  if (variant === 'magic') {
    segments.push(
      costar?.context ? `Context: ${costar.context}` : '',
      costar?.objective ? `Objective: ${costar.objective}` : '',
      costar?.style ? `Style: ${costar.style}` : '',
      costar?.tone ? `Tone: ${costar.tone}` : '',
      costar?.audience ? `Audience: ${costar.audience}` : '',
      costar?.response ? `Response: ${costar.response}` : '',
    )
  }

  return segments.join('\n')
}

function createLocalImageDataUrl({ variant, prompt }) {
  const seed = Array.from(String(prompt || variant || 'magic'))
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const hueA = seed % 360
  const hueB = (hueA + 80) % 360
  const hueC = (hueA + 160) % 360
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hueA}, 65%, 12%)"/>
          <stop offset="55%" stop-color="hsl(${hueB}, 55%, 10%)"/>
          <stop offset="100%" stop-color="hsl(${hueC}, 70%, 7%)"/>
        </linearGradient>
        <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="hsl(${hueB}, 100%, 70%)" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="hsl(${hueB}, 100%, 70%)" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="hsl(${hueC}, 100%, 65%)" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="hsl(${hueC}, 100%, 65%)" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="960" height="540" rx="28" fill="url(#bg)"/>
      <circle cx="215" cy="170" r="130" fill="url(#glow1)" opacity="0.75"/>
      <circle cx="720" cy="210" r="160" fill="url(#glow2)" opacity="0.7"/>
      <ellipse cx="480" cy="345" rx="220" ry="88" fill="rgba(255,255,255,0.06)"/>
      <g opacity="0.95">
        <ellipse cx="470" cy="300" rx="136" ry="88" fill="hsl(${hueA}, 28%, 78%)"/>
        <circle cx="398" cy="270" r="52" fill="hsl(${hueA}, 24%, 74%)"/>
        <circle cx="548" cy="266" r="58" fill="hsl(${hueA}, 24%, 74%)"/>
        <circle cx="350" cy="247" r="34" fill="hsl(${hueA}, 20%, 68%)"/>
        <circle cx="590" cy="244" r="38" fill="hsl(${hueA}, 20%, 68%)"/>
        <ellipse cx="470" cy="328" rx="88" ry="52" fill="hsl(${hueA}, 20%, 62%)"/>
        <circle cx="425" cy="292" r="14" fill="rgba(10,14,20,0.84)"/>
        <circle cx="515" cy="292" r="14" fill="rgba(10,14,20,0.84)"/>
        <path d="M438 318 Q470 336 502 318" fill="none" stroke="rgba(10,14,20,0.88)" stroke-width="10" stroke-linecap="round"/>
      </g>
      <g fill="hsl(${hueB}, 100%, 70%)" opacity="0.9">
        <circle cx="160" cy="350" r="6"/>
        <circle cx="250" cy="390" r="4"/>
        <circle cx="760" cy="120" r="5"/>
        <circle cx="810" cy="310" r="7"/>
        <circle cx="610" cy="98" r="4"/>
      </g>
      <path d="M90 470 C220 420, 320 500, 470 452 S700 410, 870 460" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4" stroke-linecap="round"/>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function summarizeCostar(costar) {
  return COSTAR_FIELDS.map((field) => `${field.label}: ${cleanText(costar?.[field.key]) || '未填写'}`).join('\n')
}

function buildStoryGenerationPrompt({ variant, prompt, commonPrompt, finalSpell, costar }) {
  const activePrompt = cleanText(prompt || (variant === 'magic' ? finalSpell : commonPrompt))
  const variantLabel = variant === 'magic' ? '进阶咒语' : '普通咒语'
  return [
    `你是「COSTAR 创作工坊」的故事生成引擎。请把输入转化为一段适合展示的中文故事。`,
    `模式：${variantLabel}`,
    `输入咒语：${activePrompt || '未提供'}`,
    '',
    'COSTAR 参考：',
    summarizeCostar(costar),
    '',
    '输出要求：',
    '1. 只输出故事正文，不要解释思路。',
    '2. 使用中文，分成 3 个短段落。',
    '3. 保持画面感、连贯性和舞台感。',
  ].join('\n')
}

function buildPlainStoryPrompt({ prompt }) {
  const activePrompt = cleanText(prompt)
  return [
    '你是一个中文故事生成引擎。请根据用户输入，直接生成故事正文。',
    `输入咒语：${activePrompt || '未提供'}`,
    '',
    '输出要求：',
    '1. 只输出故事正文，不要解释思路。',
    '2. 使用中文，分成 3 个短段落。',
    '3. 风格自然，不要擅自加入额外设定。',
  ].join('\n')
}

function buildMagicImageSubject({ commonPrompt, costar }) {
  const activePrompt = cleanText(commonPrompt)
  const context = cleanText(costar?.context)
  const objective = cleanText(costar?.objective)
  const style = cleanText(costar?.style)
  const tone = cleanText(costar?.tone)
  const audience = cleanText(costar?.audience)
  const fragments = [activePrompt, context, objective, style, tone, audience].filter(Boolean)
  return fragments.join(', ')
}

function buildImageGenerationPrompt({ variant, prompt, commonPrompt, finalSpell, costar }) {
  const visualSubject = variant === 'magic'
    ? buildMagicImageSubject({ commonPrompt, costar })
    : cleanText(prompt)

  return [
    'Create a single clear illustration.',
    `Subject: ${visualSubject || 'a simple scene with one clear focal subject'}`,
    'Visual mood: natural lighting, balanced colors, clean composition; follow the subject without adding extra genre.',
    'Composition: centered subject, clean background, strong depth, 16:9.',
    'Important: do not render any text, letters, words, numbers, captions, labels, subtitles, watermarks, logos, UI, or callout boxes.',
  ].join('\n')
}

function buildPlainImagePrompt({ prompt }) {
  const visualSubject = cleanText(prompt)
  return [
    'Create a single clean high-detail illustration.',
    `Subject: ${visualSubject || 'a simple scene with a clear focal subject'}`,
    'Composition: centered subject, clear background, 16:9.',
    'Important: do not render any text, letters, words, numbers, captions, labels, subtitles, watermarks, logos, UI, or callout boxes.',
  ].join('\n')
}

async function callXaiStoryCompletion({ variant, prompt, commonPrompt, finalSpell, costar }) {
  const config = resolveConfig()
  const messagePrompt = variant === 'magic'
    ? buildStoryGenerationPrompt({ variant, prompt, commonPrompt, finalSpell, costar })
    : buildPlainStoryPrompt({ prompt })
  const body = {
    model: config.xaiTextModel,
    messages: [
      {
        role: 'system',
        content: 'You are a creative writing engine. Return only the final story in Chinese.',
      },
      {
        role: 'user',
        content: messagePrompt,
      },
    ],
    temperature: 0.9,
    stream: false,
  }
  return postJsonToUrl(
    `${config.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
    body,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.xaiApiKey}`,
    },
  )
}

async function callXaiImageGeneration({ variant, prompt, commonPrompt, finalSpell, costar }) {
  const config = resolveConfig()
  const body = {
    model: config.xaiImageModel,
    prompt: variant === 'magic'
      ? buildImageGenerationPrompt({ variant, prompt, commonPrompt, finalSpell, costar })
      : buildPlainImagePrompt({ prompt }),
    n: 1,
    aspect_ratio: '16:9',
    resolution: '1k',
    response_format: 'b64_json',
  }
  return postJsonToUrl(
    `${config.xaiBaseUrl.replace(/\/$/, '')}/images/generations`,
    body,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.xaiApiKey}`,
    },
  )
}

async function generateVariant({
  endpoint,
  kind,
  variant,
  prompt,
  commonPrompt,
  finalSpell,
  costar,
}) {
  const config = resolveConfig()
  const body = buildRequestBody({ kind, variant, prompt, commonPrompt, finalSpell, costar })
  const activePrompt = cleanText(prompt || (variant === 'magic' ? finalSpell : commonPrompt))
  try {
    if (config.provider === 'xai' && config.xaiApiKey) {
      if (kind === 'story') {
        const payload = await callXaiStoryCompletion({
          variant,
          prompt: activePrompt,
          commonPrompt,
          finalSpell,
          costar,
        })
        const text = extractText(payload)
        return {
          kind,
          variant,
          prompt: activePrompt,
          text: text || createLocalStoryFallback({ kind, variant, prompt: activePrompt, commonPrompt, finalSpell, costar }),
          imageUrl: '',
          source: 'xai',
        }
      }

      const payload = await callXaiImageGeneration({
        variant,
        prompt: activePrompt,
        commonPrompt,
        finalSpell,
        costar,
      })
      const imageUrl = extractImageUrl(payload)
      return {
        kind,
        variant,
        prompt: activePrompt,
        text: '',
        imageUrl: imageUrl || createLocalImageDataUrl({ variant, prompt: activePrompt, costar }),
        source: 'xai',
      }
    }

    if (config.provider === 'backend' && config.baseUrl) {
      const payload = await postJson(endpoint, body)
      const text = extractText(payload)
      const imageUrl = extractImageUrl(payload)
      if (kind === 'image' && !imageUrl && !text) {
        return {
          kind,
          variant,
          prompt: activePrompt,
          text: createLocalStoryFallback({ kind, variant, prompt: activePrompt, commonPrompt, finalSpell, costar }),
          imageUrl: createLocalImageDataUrl({ variant, prompt: activePrompt, costar }),
          source: 'local',
        }
      }
      return {
        kind,
        variant,
        prompt: activePrompt,
        text: text || '',
        imageUrl,
        source: 'api',
      }
    }

    return {
      kind,
      variant,
      prompt: activePrompt,
      text: kind === 'story'
        ? createLocalStoryFallback({ kind, variant, prompt: activePrompt, commonPrompt, finalSpell, costar })
        : '',
      imageUrl: kind === 'image'
        ? createLocalImageDataUrl({ variant, prompt: activePrompt, costar })
        : '',
      source: 'local',
    }
  } catch (error) {
    return {
      kind,
      variant,
      prompt: activePrompt,
      text: kind === 'story'
        ? createLocalStoryFallback({ kind, variant, prompt: activePrompt, commonPrompt, finalSpell, costar })
        : '',
      imageUrl: kind === 'image'
        ? createLocalImageDataUrl({ variant, prompt: activePrompt, costar })
        : '',
      source: 'local',
      error: error?.message || '请求失败',
    }
  }
}

export function buildCostarStagePrompt(commonPrompt, costar) {
  const prompt = cleanText(commonPrompt)
  const safeCostar = costar || {}
  const lines = [
    '你正在运行「COSTAR 创作工坊」的 COSTAR 引擎。请严格遵循以下六维提示并生成高质量结果：',
    '',
    `Common Prompt: ${prompt || '未填写，请根据 COSTAR 自动补全'}`,
  ]

  for (const field of COSTAR_FIELDS) {
    lines.push(`${field.label}: ${cleanText(safeCostar[field.key]) || '未填写'}`)
  }

  lines.push('')
  lines.push('输出要求：')
  lines.push('1. 严格遵守上面的风格、语气、受众与返回格式。')
  lines.push('2. 保持内容完整、可执行、富有画面感。')
  lines.push('3. 如信息缺失，请结合上下文自动补充最合理的内容。')

  return lines.join('\n')
}

function buildMagicCaptionUserContent(commonPrompt, safeCostar) {
  const cp = cleanText(commonPrompt)
  const lines = [
    `【普通提示词】${cp || '（未填写）'}`,
    '',
    '【COSTAR 六维】',
    ...COSTAR_FIELDS.map(
      (f) =>
        `${f.label}：${cleanText(safeCostar[f.key]) || '（未填写）'}`,
    ),
    '',
    '任务：将以上**所有已填写或有意义的信息**融成**唯一一句**完整、流畅的中文，描述**最终要生成的这幅图像**应当呈现的画面（主体、环境、氛围、风格倾向）。不要预设奇幻题材，除非用户或 COSTAR 中明确写出。',
    '要求：只输出这一句正文；不要引号、书名号、序号、前缀说明。',
  ]
  return lines.join('\n')
}

function localFallbackMagicCaption(commonPrompt, safeCostar) {
  const cp = cleanText(commonPrompt)
  const bits = COSTAR_FIELDS.map((f) => cleanText(safeCostar[f.key])).filter(Boolean)
  const merged = [cp, ...bits].filter(Boolean).join('，')
  return merged
    ? `画面构想为：${merged}。`
    : '一幅主体明确、细节清楚、光影自然的插图。'
}

function stripOneSentenceQuotes(text) {
  let t = cleanText(text)
  t = t.replace(/^[\s"'「『（]*|[\s"'」』）]*$/g, '')
  const firstLine = t.split(/\n/)[0] || t
  return firstLine.length > 280 ? `${firstLine.slice(0, 277)}…` : firstLine
}

/**
 * 根据普通提示词 + COSTAR 生成一句完整中文画面描述（大模型；无密钥时为本地拼句）。
 */
export async function generateMagicImageCaptionSentence({ commonPrompt, costar }) {
  const cp = cleanText(commonPrompt)
  const safeCostar = costar || {}
  const config = resolveConfig()
  if (config.provider === 'xai' && config.xaiApiKey) {
    try {
      const response = await postJsonToUrl(
        `${config.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: config.xaiTextModel,
          messages: [
            {
              role: 'system',
              content:
                '你是图像画面描述撰稿人。用户会给出普通提示词与 COSTAR 六维。你只输出一句通顺的中文，概括最终要画的图；不要预设奇幻风格，除非输入里已有。不要其它字。',
            },
            {
              role: 'user',
              content: buildMagicCaptionUserContent(cp, safeCostar),
            },
          ],
          temperature: 0.75,
          stream: false,
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.xaiApiKey}`,
        },
      )
      const raw = extractText(response)
      const one = stripOneSentenceQuotes(raw)
      if (one) return one
    } catch {
      /* fall through */
    }
  }
  return localFallbackMagicCaption(cp, safeCostar)
}

function buildImagePromptFromMagicCaption(captionZh) {
  const c = cleanText(captionZh) || 'a clear scene with a single main subject'
  return [
    'Create one high-detail illustration.',
    'Interpret this Chinese scene description visually (subject, mood, lighting, style):',
    c,
    'Composition: clear focal subject, balanced lighting, polished, 16:9 feel.',
    'Critical: no text, letters, numbers, captions, watermarks, logos, or UI in the image.',
  ].join('\n')
}

/**
 * 根据模型生成的那句画面描述出图（失败时回退到进阶阶段拼图解图）。
 */
export async function generateMagicImageFromCaption({ caption, commonPrompt, costar }) {
  const cp = cleanText(commonPrompt)
  const safeCostar = costar || {}
  const c = cleanText(caption) || localFallbackMagicCaption(cp, safeCostar)
  const finalSpell = buildCostarStagePrompt(cp, safeCostar)
  const config = resolveConfig()

  try {
    if (config.provider === 'xai' && config.xaiApiKey) {
      const response = await postJsonToUrl(
        `${config.xaiBaseUrl.replace(/\/$/, '')}/images/generations`,
        {
          model: config.xaiImageModel,
          prompt: buildImagePromptFromMagicCaption(c),
          n: 1,
          aspect_ratio: '16:9',
          resolution: '1k',
          response_format: 'b64_json',
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.xaiApiKey}`,
        },
      )
      const imageUrl = extractImageUrl(response)
      if (imageUrl) {
        return { imageUrl, source: 'xai', error: '' }
      }
    }

    const result = await generateVariant({
      endpoint: config.imageEndpoint,
      kind: 'image',
      variant: 'magic',
      prompt: finalSpell,
      commonPrompt: cp,
      finalSpell,
      costar: safeCostar,
    })
    return {
      imageUrl: result.imageUrl || createLocalImageDataUrl({ variant: 'magic', prompt: c, costar: safeCostar }),
      source: result.source || 'local',
      error: result.error || '',
    }
  } catch (error) {
    return {
      imageUrl: createLocalImageDataUrl({ variant: 'magic', prompt: c, costar: safeCostar }),
      source: 'local',
      error: error?.message || '图像生成失败',
    }
  }
}

function buildMagicTextIntentUserContent(commonPrompt, safeCostar) {
  const cp = cleanText(commonPrompt)
  const lines = [
    `【普通提示词】${cp || '（未填写）'}`,
    '',
    '【COSTAR 六维】',
    ...COSTAR_FIELDS.map(
      (f) => `${f.label}：${cleanText(safeCostar[f.key]) || '（未填写）'}`,
    ),
    '',
    '任务：将以上**所有已填写或有意义的信息**融成**唯一一句**完整、流畅的中文，概括**进入进阶阶段后**这段文本应当写成什么样（主题、基调、风格、读者感受与结构倾向，不写具体情节细节）。',
    '要求：只输出这一句正文；不要引号、书名号、序号、前缀说明。',
  ]
  return lines.join('\n')
}

function localFallbackMagicTextIntent(commonPrompt, safeCostar) {
  const cp = cleanText(commonPrompt)
  const bits = COSTAR_FIELDS.map((f) => cleanText(safeCostar[f.key])).filter(Boolean)
  const merged = [cp, ...bits].filter(Boolean).join('，')
  return merged
    ? `创作意图：围绕「${merged.slice(0, 120)}${merged.length > 120 ? '…' : ''}」写一段适合朗读的中文故事。`
    : '创作一段有画面感、适合课堂展示的中文小故事。'
}

/**
 * 文本进阶阶段：根据 COSTAR + 普通提示词生成一句「创作意图」概括。
 */
export async function generateMagicTextCaptionSentence({ commonPrompt, costar }) {
  const cp = cleanText(commonPrompt)
  const safeCostar = costar || {}
  const config = resolveConfig()
  if (config.provider === 'xai' && config.xaiApiKey) {
    try {
      const response = await postJsonToUrl(
        `${config.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: config.xaiTextModel,
          messages: [
            {
              role: 'system',
              content:
                '你是文案策划。用户给出普通提示词与 COSTAR 六维。你只输出一句通顺的中文，概括最终要写的文本应达到的效果与方向，不要其它字。',
            },
            {
              role: 'user',
              content: buildMagicTextIntentUserContent(cp, safeCostar),
            },
          ],
          temperature: 0.75,
          stream: false,
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.xaiApiKey}`,
        },
      )
      const raw = extractText(response)
      const one = stripOneSentenceQuotes(raw)
      if (one) return one
    } catch {
      /* fall through */
    }
  }
  return localFallbackMagicTextIntent(cp, safeCostar)
}

function buildMagicStoryFromIntentUserContent(intentLine, cp, safeCostar) {
  const c = cleanText(intentLine)
  return [
    '【进阶创作意图（已概括为一句，请作为总纲）】',
    c || '（未提供）',
    '',
    `【普通提示词】${cp || '未填写'}`,
    '',
    '【COSTAR 参考】',
    summarizeCostar(safeCostar),
    '',
    '任务：严格依据上面的「进阶创作意图」为核心，融合普通提示词与 COSTAR，写一段适合展示的中文故事。',
    '输出要求：',
    '1. 只输出故事正文，不要解释、不要标题。',
    '2. 使用中文，分成 3 个短段落。',
    '3. 有画面感与连贯性；不要输出 HTML 或网页代码。',
  ].join('\n')
}

/**
 * 根据意图句生成完整进阶阶段文本正文（失败时回退原故事管线）。
 */
export async function generateMagicTextFromCaption({ caption, commonPrompt, costar }) {
  const cp = cleanText(commonPrompt)
  const safeCostar = costar || {}
  const intent = cleanText(caption) || localFallbackMagicTextIntent(cp, safeCostar)
  const finalSpell = buildCostarStagePrompt(cp, safeCostar)
  const config = resolveConfig()

  try {
    if (config.provider === 'xai' && config.xaiApiKey) {
      const response = await postJsonToUrl(
        `${config.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: config.xaiTextModel,
          messages: [
            {
              role: 'system',
              content:
                '你是中文故事作者。只输出故事正文，禁止 HTML。',
            },
            {
              role: 'user',
              content: buildMagicStoryFromIntentUserContent(intent, cp, safeCostar),
            },
          ],
          temperature: 0.9,
          stream: false,
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.xaiApiKey}`,
        },
      )
      const raw = extractText(response)
      const text = normalizeTextStageOutput(raw, cp + intent) || raw?.trim() || ''
      if (text) {
        return { text, source: 'xai', error: '' }
      }
    }

    const result = await generateVariant({
      endpoint: config.storyEndpoint,
      kind: 'story',
      variant: 'magic',
      prompt: finalSpell,
      commonPrompt: cp,
      finalSpell,
      costar: safeCostar,
    })
    const text =
      normalizeTextStageOutput(result.text, cp) ||
      result.text ||
      createLocalStoryFallback({
        kind: 'story',
        variant: 'magic',
        prompt: finalSpell,
        commonPrompt: cp,
        finalSpell,
        costar: safeCostar,
      })
    return {
      text,
      source: result.source || 'local',
      error: result.error || '',
    }
  } catch (error) {
    const fallback = createLocalStoryFallback({
      kind: 'story',
      variant: 'magic',
      prompt: intent,
      commonPrompt: cp,
      finalSpell,
      costar: safeCostar,
    })
    return {
      text: normalizeTextStageOutput(fallback, cp) || fallback,
      source: 'local',
      error: error?.message || '文本生成失败',
    }
  }
}

/**
 * 顺序工坊进阶阶段：基于普通提示词 + COSTAR 六维，走与对比模式相同的生成管线。
 */
export async function generateCostarStageOutput({ branch, commonPrompt, costar }) {
  const cp = cleanText(commonPrompt)
  const safeCostar = costar || {}
  const finalSpell = buildCostarStagePrompt(cp, safeCostar)

  if (branch === 'image') {
    const caption = await generateMagicImageCaptionSentence({ commonPrompt: cp, costar: safeCostar })
    const { imageUrl, source, error } = await generateMagicImageFromCaption({
      caption,
      commonPrompt: cp,
      costar: safeCostar,
    })
    return {
      kind: branch,
      prompt: finalSpell,
      text: caption,
      imageUrl,
      source,
      error,
    }
  }

  const caption = await generateMagicTextCaptionSentence({ commonPrompt: cp, costar: safeCostar })
  const { text, source, error } = await generateMagicTextFromCaption({
    caption,
    commonPrompt: cp,
    costar: safeCostar,
  })
  return {
    kind: branch,
    prompt: finalSpell,
    text,
    imageUrl: '',
    source,
    error,
  }
}

export async function generateSpellComparisons({ commonPrompt, finalSpell, costar }) {
  const [story, image] = await Promise.all([
    generateTextSpellComparison({ commonPrompt, finalSpell, costar }),
    generateImageSpellComparison({ commonPrompt, finalSpell, costar }),
  ])

  return { story, image }
}

export async function generateTextSpellComparison({ commonPrompt, finalSpell, costar }) {
  const storyEndpoint = resolveConfig().storyEndpoint
  const [common, magic] = await Promise.all([
    generateVariant({
      endpoint: storyEndpoint,
      kind: 'story',
      variant: 'common',
      prompt: commonPrompt,
      commonPrompt,
      finalSpell,
      costar,
    }),
    generateVariant({
      endpoint: storyEndpoint,
      kind: 'story',
      variant: 'magic',
      prompt: finalSpell,
      commonPrompt,
      finalSpell,
      costar,
    }),
  ])

  return { common, magic }
}

export async function generateImageSpellComparison({ commonPrompt, finalSpell, costar }) {
  const imageEndpoint = resolveConfig().imageEndpoint
  const [common, magic] = await Promise.all([
    generateVariant({
      endpoint: imageEndpoint,
      kind: 'image',
      variant: 'common',
      prompt: commonPrompt,
      commonPrompt,
      finalSpell,
      costar,
    }),
    generateVariant({
      endpoint: imageEndpoint,
      kind: 'image',
      variant: 'magic',
      prompt: finalSpell,
      commonPrompt,
      finalSpell,
      costar,
    }),
  ])

  return { common, magic }
}

function buildStageTextPrompt(prompt, branchLabel) {
  const activePrompt = cleanText(prompt)
  return [
    `你正在生成${branchLabel}结果（面向学生/课堂展示）。`,
    '默认输出：自然中文（故事、对话、规则说明、步骤列表等），可直接朗读或展示。',
    '禁止输出完整网页：不要 <!DOCTYPE>、不要 <html>...</html>、不要整段可运行页面，除非用户明确写了「输出 HTML」「网页源代码」等。',
    '若用户要「小游戏/计算器」等，用几句话说明玩法与规则即可，不要贴整页代码。',
    '请只输出最终正文，不要前言「好的」等套话。',
    `用户输入：${activePrompt || '未提供'}`,
  ].join('\n')
}

function buildStageImagePrompt(prompt, branchLabel) {
  const activePrompt = cleanText(prompt)
  return [
    `Create a single high-detail image for ${branchLabel}.`,
    `Subject: ${activePrompt || 'a simple scene with a clear focal subject'}`,
    'Style: clear composition, natural or neutral lighting; follow the subject only, no extra genre unless specified.',
    'Important: do not render any text, letters, numbers, captions, labels, subtitles, watermarks, logos, or UI.',
  ].join('\n')
}

async function callStageXaiText(prompt, branchLabel) {
  const config = resolveConfig()
  const response = await postJsonToUrl(
    `${config.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      model: config.xaiTextModel,
      messages: [
        {
          role: 'system',
          content:
            '你是中文内容生成助手。默认只输出纯中文正文（故事、说明、规则），禁止输出完整 HTML 文档；仅当用户明确要求 HTML/网页源码时才输出代码。不要废话。',
        },
        {
          role: 'user',
          content: buildStageTextPrompt(prompt, branchLabel),
        },
      ],
      temperature: 0.9,
      stream: false,
    },
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.xaiApiKey}`,
    },
  )
  return extractText(response)
}

async function callStageXaiImage(prompt, branchLabel) {
  const config = resolveConfig()
  const response = await postJsonToUrl(
    `${config.xaiBaseUrl.replace(/\/$/, '')}/images/generations`,
    {
      model: config.xaiImageModel,
      prompt: buildStageImagePrompt(prompt, branchLabel),
      n: 1,
      aspect_ratio: '16:9',
      resolution: '1k',
      response_format: 'b64_json',
    },
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.xaiApiKey}`,
    },
  )
  return extractImageUrl(response)
}

export async function generateSpellStageOutput({ branch, prompt }) {
  const activePrompt = cleanText(prompt)
  const branchLabel = branch === 'image' ? '图片生成' : '文本生成'
  if (!activePrompt) {
    return {
      kind: branch,
      prompt: '',
      text: '',
      imageUrl: '',
      source: 'local',
      error: '请输入内容',
    }
  }

  const config = resolveConfig()

  try {
    if (config.provider === 'xai' && config.xaiApiKey) {
      if (branch === 'image') {
        const imageUrl = await callStageXaiImage(activePrompt, branchLabel)
        return {
          kind: branch,
          prompt: activePrompt,
          text: '',
          imageUrl: imageUrl || createLocalImageDataUrl({ variant: branch, prompt: activePrompt }),
          source: 'xai',
          error: '',
        }
      }

      const text = await callStageXaiText(activePrompt, branchLabel)
      return {
        kind: branch,
        prompt: activePrompt,
        text: normalizeTextStageOutput(text, activePrompt) || activePrompt,
        imageUrl: '',
        source: 'xai',
        error: '',
      }
    }

    if (config.provider === 'backend' && config.baseUrl) {
      const endpoint = branch === 'image' ? config.imageEndpoint : config.storyEndpoint
      const payload = await postJson(endpoint, {
        prompt: activePrompt,
        branch,
      })
      return {
        kind: branch,
        prompt: activePrompt,
        text:
          branch === 'image'
            ? ''
            : normalizeTextStageOutput(extractText(payload), activePrompt) || activePrompt,
        imageUrl: branch === 'image' ? extractImageUrl(payload) || createLocalImageDataUrl({ variant: branch, prompt: activePrompt }) : '',
        source: 'api',
        error: '',
      }
    }

    return {
      kind: branch,
      prompt: activePrompt,
      text: branch === 'image' ? '' : activePrompt,
      imageUrl: branch === 'image' ? createLocalImageDataUrl({ variant: branch, prompt: activePrompt }) : '',
      source: 'local',
      error: '',
    }
  } catch (error) {
    return {
      kind: branch,
      prompt: activePrompt,
      text: branch === 'image' ? '' : activePrompt,
      imageUrl: branch === 'image' ? createLocalImageDataUrl({ variant: branch, prompt: activePrompt }) : '',
      source: 'local',
      error: error?.message || '请求失败',
    }
  }
}

