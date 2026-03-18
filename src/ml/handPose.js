/**
 * 手部姿态：21 关键点连线（MediaPipe Hands 标准）、归一化、与游戏循环同步的检测
 */
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection'

// MediaPipe Hands 21 关键点连线（拇指/食指/中指/无名指/小指 + 掌心）
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

const LAB_CYAN = 'rgba(0, 245, 255, 0.95)'
const LAB_CYAN_GLOW = 'rgba(0, 245, 255, 0.6)'

/**
 * 在 canvas 上绘制单只手的关键点与连线（实验室荧光青）
 */
function validNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function drawHandOnCanvas(ctx, keypoints, width, height, flipHorizontal = true) {
  if (!keypoints || keypoints.length < 21) return
  const scaleX = flipHorizontal ? -1 : 1
  const scaleXOrigin = flipHorizontal ? width : 0
  ctx.save()
  ctx.scale(scaleX, 1)
  ctx.translate(scaleXOrigin, 0)

  ctx.strokeStyle = LAB_CYAN
  ctx.lineWidth = 3
  ctx.shadowColor = LAB_CYAN_GLOW
  ctx.shadowBlur = 10
  for (const [i, j] of HAND_CONNECTIONS) {
    const a = keypoints[i]
    const b = keypoints[j]
    const ax = validNum(a?.x)
    const ay = validNum(a?.y)
    const bx = validNum(b?.x)
    const by = validNum(b?.y)
    if (ax == null || ay == null || bx == null || by == null) continue
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  ctx.fillStyle = LAB_CYAN
  ctx.shadowColor = LAB_CYAN_GLOW
  ctx.shadowBlur = 8
  for (const kp of keypoints) {
    const x = validNum(kp?.x)
    const y = validNum(kp?.y)
    if (x == null || y == null) continue
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.restore()
}

/**
 * 将关键点转为相对坐标向量（以手腕为原点，按手部尺度归一化），用于姿态比较
 */
export function keypointsToFeature(keypoints) {
  if (!keypoints || keypoints.length < 21) return null
  const wrist = keypoints[0]
  if (!wrist || wrist.x == null) return null
  let scale = 0
  for (let i = 1; i <= 4; i++) {
    const p = keypoints[i * 4]
    if (p && p.x != null) {
      const dx = p.x - wrist.x
      const dy = p.y - wrist.y
      scale += Math.sqrt(dx * dx + dy * dy)
    }
  }
  scale = scale / 4 || 1
  const out = []
  for (const kp of keypoints) {
    if (kp.x == null || kp.y == null) continue
    out.push((kp.x - wrist.x) / scale)
    out.push((kp.y - wrist.y) / scale)
  }
  return out.length >= 42 ? out : null
}

/**
 * 计算两组特征向量的 L2 距离
 */
export function featureDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}

let detectorInstance = null

export async function getHandDetector() {
  if (detectorInstance) return detectorInstance
  const model = handPoseDetection.SupportedModels.MediaPipeHands
  detectorInstance = await handPoseDetection.createDetector(model, {
    runtime: 'tfjs',
    modelType: 'lite',
    maxHands: 1,
  })
  return detectorInstance
}

export function disposeHandDetector() {
  if (detectorInstance) {
    detectorInstance.dispose()
    detectorInstance = null
  }
}
