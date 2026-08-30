import { useAppStore } from '../store/appStore'

export type SoundKind = 'sell' | 'delete' | 'save'

const NOTES: Record<SoundKind, number[]> = {
  sell: [880, 1320],
  delete: [440, 220],
  save: [660]
}

/** نغمات قصيرة مُصنّعة بالكود عبر Web Audio API — مفيش ملفات صوت خارجية. */
export function playSound(kind: SoundKind, options?: { forceVolume?: number; forceEnabled?: boolean }): void {
  const { soundEnabled, soundVolume } = useAppStore.getState()
  const enabled = options?.forceEnabled ?? soundEnabled
  if (!enabled) return
  const volume = options?.forceVolume ?? soundVolume
  if (volume <= 0) return

  try {
    const AudioContextClass = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const notes = NOTES[kind]
    const noteDuration = 0.09

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const startTime = ctx.currentTime + idx * noteDuration
      gain.gain.setValueAtTime(Math.min(1, volume) * 0.5, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime)
      osc.stop(startTime + noteDuration)
    })

    setTimeout(() => ctx.close(), (notes.length * noteDuration + 0.15) * 1000)
  } catch {
    // بيئة مفيهاش دعم Web Audio — تجاهل بصمت
  }
}
