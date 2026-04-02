/**
 * 手写数字：与 scripts/train-digit-model.js 中 augment=false 分支一致的预处理，
 * 使摄像头/上传图与 MNIST 特征分布对齐，提升识别准确率。
 */
import * as tf from '@tensorflow/tfjs'

/** 是否为内置 0–9 数字模型（与 train-digit-model 输出一致） */
export function isDigitHeadModel(hw) {
  return (
    hw &&
    hw.classNames?.length === 10 &&
    hw.classNames.every((n, i) => String(n) === String(i))
  )
}

const PAD = 2
const SIZE28 = 28

/**
 * 将图片以 cover 方式绘制到方形画布（居中裁切，不变形）
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement | HTMLVideoElement | HTMLCanvasElement} img
 * @param {number} tw
 * @param {number} th
 */
/** 视频帧写入方形 canvas（黑底 + cover），供数字预处理使用 */
export function drawVideoCoverToCanvas(video, canvas, size = 224) {
  const ctx = canvas.getContext('2d')
  canvas.width = size
  canvas.height = size
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)
  drawImageCover(ctx, video, size, size)
}

export function drawImageCover(ctx, img, tw, th) {
  const iw = img.naturalWidth ?? img.videoWidth ?? img.width ?? 0
  const ih = img.naturalHeight ?? img.videoHeight ?? img.height ?? 0
  if (!iw || !ih) return
  const scale = Math.max(tw / iw, th / ih)
  const rw = iw * scale
  const rh = ih * scale
  const ox = (tw - rw) / 2
  const oy = (th - rh) / 2
  ctx.drawImage(img, 0, 0, iw, ih, ox, oy, rw, rh)
}

/**
 * 从 canvas 得到与训练脚本相同的张量 [224,224,3]，值域 [0, 1]（再乘 255 供 MobileNet infer）
 */
export function canvasToDigitInputTensor(canvas) {
  return tf.tidy(() => {
    const rgb = tf.browser.fromPixels(canvas)
    const floatRgb = tf.cast(rgb, 'float32')
    // 亮度 [H,W,1]
    const gray = tf.mean(floatRgb, 2, true)
    let g01 = gray.div(255)
    // 白纸黑字 → 反转为与 MNIST 一致（亮笔划、暗底）
    const meanT = tf.mean(g01)
    const meanVal = meanT.dataSync()[0]
    meanT.dispose()
    if (meanVal > 0.52) {
      const inv = tf.sub(1, g01)
      g01.dispose()
      g01 = inv
    }
    const small = tf.image.resizeBilinear(g01, [SIZE28, SIZE28])
    g01.dispose()
    const padded = tf.pad(small, [
      [PAD, PAD],
      [PAD, PAD],
      [0, 0],
    ])
    small.dispose()
    const resized = tf.image.resizeBilinear(padded, [224, 224])
    padded.dispose()
    const enhanced = resized.mul(1.3).clipByValue(0, 1)
    resized.dispose()
    const rgbOut = tf.concat([enhanced, enhanced, enhanced], 2)
    enhanced.dispose()
    return rgbOut
  })
}
