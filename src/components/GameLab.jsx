/**
 * 机甲模拟训练（第四模块 · Pose 版）
 * 三动作：跳跃 · 左移 · 右移 → 手势探测器 → 卷轴躲避
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  getHandDetector,
  disposeHandDetector,
  drawHandOnCanvas,
  keypointsToFeature,
  featureDistance,
} from '../ml/handPose'

const CANVAS_W = 640
const CANVAS_H = 360
const VIDEO_W = 320
const VIDEO_H = 240
const GROUND_Y = 300
const MECHA_W = 36
const MECHA_H = 48
const JUMP_FORCE = -14
const GRAVITY = 0.6
const MOVE_SPEED = 7
const BASE_SCROLL = 3
const OBSTACLE_SIZE = 40
const OBSTACLE_SPAWN_INTERVAL = 90
const POSE_INTERVAL_FRAMES = 3
const POSE_MATCH_THRESHOLD = 0.58
const JUMP_COOLDOWN_FRAMES = 22
const LATERAL_LOG_COOLDOWN_FRAMES = 14
const SIGNAL_LOG_MAX = 20

export default function GameLab() {
  const [syncStep, setSyncStep] = useState(1)
  const [jumpPoseFeature, setJumpPoseFeature] = useState(null)
  const [leftPoseFeature, setLeftPoseFeature] = useState(null)
  const [rightPoseFeature, setRightPoseFeature] = useState(null)
  const [gameUnlocked, setGameUnlocked] = useState(false)
  const [gamePhase, setGamePhase] = useState('idle')
  const [score, setScore] = useState(0)
  const [signalLog, setSignalLog] = useState([])
  const [actionFlash, setActionFlash] = useState(null)
  const [detectorReady, setDetectorReady] = useState(false)
  const [hasHandPose, setHasHandPose] = useState(false)

  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const gameCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const hadPoseRef = useRef(false)
  const gameStateRef = useRef({
    mechaX: 80,
    mechaY: GROUND_Y - MECHA_H,
    vx: 0,
    vy: 0,
    scrollSpeed: BASE_SCROLL,
    obstacles: [],
    nextSpawn: OBSTACLE_SPAWN_INTERVAL,
  })
  const animRef = useRef(null)
  const frameCountRef = useRef(0)
  const lastPoseRef = useRef(null)
  const lastJumpFrameRef = useRef(-999)
  const lastLateralLogFrameRef = useRef(-999)
  const scoreRef = useRef(0)
  scoreRef.current = score

  const appendSignal = useCallback((msg) => {
    setSignalLog((prev) => [...prev.slice(-(SIGNAL_LOG_MAX - 1)), msg])
  }, [])

  const lockPose = useCallback((step) => {
    const hand = lastPoseRef.current
    if (!hand?.keypoints?.length) return
    const feat = keypointsToFeature(hand.keypoints)
    if (!feat) return
    if (step === 1) {
      setJumpPoseFeature(feat)
      setSyncStep(2)
    } else if (step === 2) {
      setLeftPoseFeature(feat)
      setSyncStep(3)
    } else {
      setRightPoseFeature(feat)
      setGameUnlocked(true)
    }
  }, [])

  const canLock = hasHandPose && !!lastPoseRef.current?.keypoints?.length

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: VIDEO_W, height: VIDEO_H },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          v.play().catch(() => {})
        }
      } catch (_) {}
    }
    start()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      const v = videoRef.current
      if (v) v.srcObject = null
    }
  }, [])

  useEffect(() => {
    if (!gameUnlocked) return
    const stream = streamRef.current
    const video = videoRef.current
    if (!stream || !video) return
    video.srcObject = stream
    void video.play().catch(() => {})
    const t = window.setTimeout(() => void video.play().catch(() => {}), 150)
    return () => clearTimeout(t)
  }, [gameUnlocked, gamePhase])

  useEffect(() => {
    let cancelled = false
    getHandDetector()
      .then(() => {
        if (!cancelled) setDetectorReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      disposeHandDetector()
    }
  }, [])

  useEffect(() => {
    if (!detectorReady) return
    let cancelled = false
    const detectorPromise = getHandDetector()
    let flashTimeout = null
    const jumpFeat = jumpPoseFeature
    const leftFeat = leftPoseFeature
    const rightFeat = rightPoseFeature

    const setFlash = (key) => {
      if (flashTimeout) clearTimeout(flashTimeout)
      if (!cancelled) setActionFlash(key)
      flashTimeout = setTimeout(() => {
        if (!cancelled) setActionFlash(null)
      }, 500)
    }

    const run = async () => {
      if (cancelled) return
      const video = videoRef.current
      const overlay = overlayRef.current
      const gameCanvas = gameCanvasRef.current
      frameCountRef.current++
      const fc = frameCountRef.current
      const doPose = fc % POSE_INTERVAL_FRAMES === 0

      const stream = streamRef.current
      if (video && stream && video.srcObject !== stream) {
        video.srcObject = stream
        void video.play().catch(() => {})
      }

      if (video && overlay) {
        const w = overlay.width
        const h = overlay.height
        const overlayCtx = overlay.getContext('2d')
        overlayCtx.clearRect(0, 0, w, h)

        if (video.readyState >= 2 && doPose) {
          try {
            const detector = await detectorPromise
            if (cancelled) return
            const hands = await detector.estimateHands(video, { flipHorizontal: false, staticImageMode: false })
            const hand = hands?.[0]
            if (hand?.keypoints) lastPoseRef.current = hand
            else lastPoseRef.current = null
          } catch (_) {
            lastPoseRef.current = null
          }
        }

        const hand = lastPoseRef.current
        const poseValid = !!(hand?.keypoints && hand.keypoints.length >= 21)
        if (poseValid !== hadPoseRef.current) {
          hadPoseRef.current = poseValid
          if (!cancelled) setHasHandPose(poseValid)
        }
        if (hand?.keypoints && hand.keypoints.length >= 21) {
          const anyLarge = hand.keypoints.some((kp) => (kp.x != null && kp.x > 1.5) || (kp.y != null && kp.y > 1.5))
          const scaleX = anyLarge ? w / 224 : w
          const scaleY = anyLarge ? h / 224 : h
          const scaled = hand.keypoints.map((kp) => ({
            ...kp,
            x: (Number(kp.x) || 0) * scaleX,
            y: (Number(kp.y) || 0) * scaleY,
          }))
          drawHandOnCanvas(overlayCtx, scaled, w, h, false)
        }
      } else if (video && doPose) {
        if (video.readyState >= 2) {
          try {
            const detector = await detectorPromise
            if (cancelled) return
            const hands = await detector.estimateHands(video, { flipHorizontal: false, staticImageMode: false })
            const hand = hands?.[0]
            if (hand?.keypoints) lastPoseRef.current = hand
            else lastPoseRef.current = null
          } catch (_) {
            lastPoseRef.current = null
          }
        }
      }

      const playing = gamePhase === 'playing' && gameUnlocked
      if (playing && gameCanvas) {
        const g = gameStateRef.current
        const ctx = gameCanvas.getContext('2d')
        const speed = g.scrollSpeed

        g.mechaY += g.vy
        g.vy += GRAVITY
        if (g.mechaY >= GROUND_Y - MECHA_H) {
          g.mechaY = GROUND_Y - MECHA_H
          g.vy = 0
        }
        g.mechaX += g.vx
        g.vx *= 0.82
        g.mechaX = Math.max(20, Math.min(CANVAS_W - MECHA_W - 20, g.mechaX))

        g.nextSpawn--
        if (g.nextSpawn <= 0) {
          g.nextSpawn = OBSTACLE_SPAWN_INTERVAL
          const type = Math.random() < 0.5 ? 'bomb' : 'gift'
          g.obstacles.push({
            type,
            x: CANVAS_W + 20,
            y: GROUND_Y - OBSTACLE_SIZE,
            w: OBSTACLE_SIZE,
            h: OBSTACLE_SIZE,
          })
        }

        for (let i = g.obstacles.length - 1; i >= 0; i--) {
          const o = g.obstacles[i]
          o.x -= speed
          if (o.x + o.w < 0) {
            g.obstacles.splice(i, 1)
            continue
          }
          const mx = g.mechaX + MECHA_W / 2
          const my = g.mechaY + MECHA_H / 2
          const ox = o.x + o.w / 2
          const oy = o.y + o.h / 2
          if (Math.abs(mx - ox) < (MECHA_W + o.w) / 2 && Math.abs(my - oy) < (MECHA_H + o.h) / 2) {
            if (o.type === 'bomb') setScore((s) => s - 10)
            else setScore((s) => s + 10)
            g.obstacles.splice(i, 1)
          }
        }

        const h = lastPoseRef.current
        if (h?.keypoints && jumpFeat && leftFeat && rightFeat) {
          const feat = keypointsToFeature(h.keypoints)
          if (feat) {
            const dJ = featureDistance(feat, jumpFeat)
            const dL = featureDistance(feat, leftFeat)
            const dR = featureDistance(feat, rightFeat)
            const best = Math.min(dJ, dL, dR)
            if (best < POSE_MATCH_THRESHOLD) {
              if (dJ <= dL && dJ <= dR) {
                const grounded = g.mechaY >= GROUND_Y - MECHA_H - 2
                if (grounded && fc - lastJumpFrameRef.current >= JUMP_COOLDOWN_FRAMES) {
                  g.vy = JUMP_FORCE
                  lastJumpFrameRef.current = fc
                  appendSignal('[系统] 跳跃')
                  setFlash('jump')
                }
              } else if (dL <= dR && dL < dJ) {
                g.vx = -MOVE_SPEED
                if (fc - lastLateralLogFrameRef.current >= LATERAL_LOG_COOLDOWN_FRAMES) {
                  lastLateralLogFrameRef.current = fc
                  appendSignal('[系统] 左移')
                  setFlash('left')
                }
              } else if (dR < dL && dR < dJ) {
                g.vx = MOVE_SPEED
                if (fc - lastLateralLogFrameRef.current >= LATERAL_LOG_COOLDOWN_FRAMES) {
                  lastLateralLogFrameRef.current = fc
                  appendSignal('[系统] 右移')
                  setFlash('right')
                }
              }
            }
          }
        }

        ctx.fillStyle = '#0a0e14'
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
        ctx.strokeStyle = 'rgba(0,245,255,0.3)'
        ctx.lineWidth = 1
        ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H)
        ctx.fillStyle = '#1a2332'
        ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y)
        ctx.strokeStyle = 'rgba(0,245,255,0.4)'
        ctx.beginPath()
        ctx.moveTo(0, GROUND_Y)
        ctx.lineTo(CANVAS_W, GROUND_Y)
        ctx.stroke()

        g.obstacles.forEach((o) => {
          if (o.type === 'bomb') {
            const blink = Math.sin(Date.now() / 120) > 0
            ctx.fillStyle = blink ? '#ff3333' : '#cc0000'
            ctx.shadowColor = '#ff6666'
            ctx.shadowBlur = 8
            ctx.fillRect(o.x, o.y, o.w, o.h)
            ctx.shadowBlur = 0
          } else {
            ctx.fillStyle = '#ffcc00'
            ctx.shadowColor = '#ffdd44'
            ctx.shadowBlur = 12
            ctx.fillRect(o.x, o.y, o.w, o.h)
            ctx.shadowBlur = 0
          }
        })

        const jetOn = g.vy < 0 || Math.abs(g.vx) > 0.8
        const bx = g.mechaX + MECHA_W / 2
        const by = g.mechaY + MECHA_H
        ctx.fillStyle = '#2d3748'
        ctx.fillRect(g.mechaX, g.mechaY, MECHA_W, MECHA_H)
        ctx.fillStyle = '#00f5ff'
        ctx.beginPath()
        ctx.arc(bx, g.mechaY + 18, 12, 0, Math.PI * 2)
        ctx.fill()
        if (jetOn) {
          ctx.fillStyle = '#00f5ff'
          ctx.shadowColor = '#00f5ff'
          ctx.shadowBlur = 10
          ctx.beginPath()
          ctx.moveTo(bx - 8, by)
          ctx.lineTo(bx, by + 16)
          ctx.lineTo(bx + 8, by)
          ctx.closePath()
          ctx.fill()
          ctx.shadowBlur = 0
        }

        ctx.fillStyle = 'rgba(0,245,255,0.9)'
        ctx.font = 'bold 24px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`得分: ${scoreRef.current}`, 12, 32)
        ctx.font = '12px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(148,163,184,0.95)'
        ctx.fillText('手势：跳跃 | 左移 | 右移', 12, CANVAS_H - 10)
      }

      animRef.current = requestAnimationFrame(run)
    }
    run()
    return () => {
      cancelled = true
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (flashTimeout) clearTimeout(flashTimeout)
    }
  }, [detectorReady, gamePhase, gameUnlocked, jumpPoseFeature, leftPoseFeature, rightPoseFeature, appendSignal])

  const startGame = useCallback(() => {
    setGamePhase('playing')
    setScore(0)
    lastJumpFrameRef.current = -999
    lastLateralLogFrameRef.current = -999
    gameStateRef.current = {
      mechaX: CANVAS_W / 2 - MECHA_W / 2,
      mechaY: GROUND_Y - MECHA_H,
      vx: 0,
      vy: 0,
      scrollSpeed: BASE_SCROLL,
      obstacles: [],
      nextSpawn: OBSTACLE_SPAWN_INTERVAL,
    }
  }, [])

  const flashLabel =
    actionFlash === 'jump'
      ? 'JUMP'
      : actionFlash === 'left'
        ? '← LEFT'
        : actionFlash === 'right'
          ? 'RIGHT →'
          : null

  return (
    <div className="flex flex-col gap-6">
      <section className="tech-border rounded-xl p-6 bg-[var(--lab-panel)]/80 border-[var(--lab-cyan)]/40">
        <h2 className="text-[var(--lab-cyan)] font-bold text-xl mb-1">机甲初始化检测</h2>
        <p className="text-gray-400 text-sm mb-4">
          依次锁定三种动作：<strong className="text-gray-300">跳跃</strong>、<strong className="text-gray-300">左移</strong>、
          <strong className="text-gray-300">右移</strong>（手势需<strong className="text-amber-400/90">明显不同</strong>）。
          <span className="block mt-1 text-gray-500 text-xs">
            摄像头画面已<strong className="text-gray-400">镜像</strong>（与照镜子一致）：你往左伸手，画面与骨架也往左，与游戏中机甲左移方向一致。
          </span>
        </p>

        {!detectorReady && (
          <p className="text-amber-400 text-sm mb-4">正在加载手部姿态模型…</p>
        )}

        <div className="flex flex-col md:flex-row gap-6">
          {!gameUnlocked && (
            <div className="game-lab-camera-wrap relative rounded-xl overflow-hidden border-2 border-[var(--lab-border)] bg-black flex-shrink-0 w-[320px] max-w-full">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                width={VIDEO_W}
                height={VIDEO_H}
                className="block w-full h-auto"
              />
              <canvas
                ref={overlayRef}
                width={VIDEO_W}
                height={VIDEO_H}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              />
            </div>
          )}

          <div className="flex-1 space-y-3">
            <div
              className={`p-4 rounded-lg border-2 ${
                syncStep >= 1 ? 'border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10' : 'border-[var(--lab-border)]'
              }`}
            >
              <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-1">① 跳跃</h3>
              <p className="text-gray-400 text-xs mb-2">
                如食指向正上方、或双手上举等「起跳」感手势，稳定后锁定。
              </p>
              <button
                type="button"
                onClick={() => lockPose(1)}
                disabled={!canLock || !detectorReady}
                className="rounded-lg bg-[var(--lab-cyan)] text-[var(--lab-bg)] px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                锁定跳跃
              </button>
              {jumpPoseFeature && <span className="ml-2 text-[var(--lab-green)] text-xs">✓</span>}
            </div>

            <div
              className={`p-4 rounded-lg border-2 ${
                syncStep >= 2 ? 'border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10' : 'border-[var(--lab-border)]'
              }`}
            >
              <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-1">② 左移</h3>
              <p className="text-gray-400 text-xs mb-2">
                如食指向左、拇指朝左、或手掌明显左倾（与跳跃、右移要分得开）。
              </p>
              <button
                type="button"
                onClick={() => lockPose(2)}
                disabled={!canLock || !detectorReady || syncStep < 2}
                className="rounded-lg bg-[var(--lab-cyan)] text-[var(--lab-bg)] px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                锁定左移
              </button>
              {leftPoseFeature && <span className="ml-2 text-[var(--lab-green)] text-xs">✓</span>}
            </div>

            <div
              className={`p-4 rounded-lg border-2 ${
                syncStep >= 3 || gameUnlocked
                  ? 'border-[var(--lab-cyan)] bg-[var(--lab-cyan)]/10'
                  : 'border-[var(--lab-border)]'
              }`}
            >
              <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-1">③ 右移</h3>
              <p className="text-gray-400 text-xs mb-2">
                如食指向右、拇指朝右、或手掌明显右倾。
              </p>
              <button
                type="button"
                onClick={() => lockPose(3)}
                disabled={!canLock || !detectorReady || syncStep < 3}
                className="rounded-lg bg-[var(--lab-cyan)] text-[var(--lab-bg)] px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                锁定右移
              </button>
              {rightPoseFeature && <span className="ml-2 text-[var(--lab-green)] text-xs">✓</span>}
            </div>
          </div>
        </div>

        {gameUnlocked && (
          <p className="mt-4 text-[var(--lab-green)] text-sm">
            ✓ 三动作已同步。游戏中实时做出对应手势即可跳跃 / 左移 / 右移机甲。
          </p>
        )}
      </section>

      {gameUnlocked && (
        <>
          <section className="tech-border rounded-xl p-4 bg-[var(--lab-panel)]/50">
            <h3 className="text-[var(--lab-green)] font-bold text-sm mb-2">游玩说明</h3>
            <p className="text-gray-500 text-xs mb-3 leading-relaxed">
              卷轴障碍物从右侧袭来；拾取金色能量块加分，避开红色障碍。用摄像头手势控制机甲在跑道上
              <strong className="text-gray-400">左右移动</strong>并<strong className="text-gray-400">跳跃</strong>躲避。
            </p>
            {gamePhase !== 'playing' ? (
              <button
                type="button"
                onClick={startGame}
                className="rounded-xl bg-[var(--lab-green)] text-[var(--lab-bg)] px-6 py-3 font-bold"
              >
                开始游戏
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setGamePhase('idle')}
                className="rounded-xl border-2 border-amber-500 text-amber-400 px-4 py-2 text-sm font-bold"
              >
                结束游戏
              </button>
            )}
          </section>

          <div className="tech-border rounded-xl p-3 bg-[var(--lab-bg)]/60">
            <p className="text-[var(--lab-cyan)] font-bold text-sm mb-2">手势探测器</p>
            <div className="game-lab-camera-wrap relative rounded-lg overflow-hidden border border-[var(--lab-border)] bg-black inline-block">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                width={VIDEO_W}
                height={VIDEO_H}
                className="block w-[320px] h-auto max-w-full"
              />
              <canvas
                ref={overlayRef}
                width={VIDEO_W}
                height={VIDEO_H}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-shrink-0 rounded-xl overflow-hidden border-2 border-[var(--lab-border)] bg-black">
              <canvas
                ref={gameCanvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="block w-full max-w-full h-auto"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="game-scanlines" aria-hidden />
              {flashLabel && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none animate-jump-detected"
                  role="status"
                  aria-live="polite"
                >
                  <span className="text-3xl md:text-5xl font-black text-[var(--lab-cyan)] uppercase tracking-widest drop-shadow-[0_0_20px_var(--lab-cyan)]">
                    {flashLabel}
                  </span>
                </div>
              )}
            </div>

            <div className="tech-border rounded-xl p-4 bg-[var(--lab-panel)] min-w-[220px] flex flex-col">
              <h3 className="text-[var(--lab-cyan)] font-bold text-sm mb-2">信号监控器</h3>
              <div className="flex-1 min-h-[180px] max-h-[280px] overflow-y-auto font-mono text-xs text-gray-300 bg-[var(--lab-bg)]/80 rounded-lg p-2 space-y-1">
                {signalLog.length === 0 && <p className="text-gray-500">等待检测…</p>}
                {signalLog.map((line, i) => (
                  <div key={i} className="text-[var(--lab-green)]/90">
                    {line}
                  </div>
                ))}
              </div>
              {gamePhase === 'playing' && (
                <p className="mt-2 text-[var(--lab-cyan)] text-sm font-bold">得分: {score}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
