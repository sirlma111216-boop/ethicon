// 오디오 관리자: 지정된 '음향 출력 화면'에서만 활성화한다. 학생 기기는 호출하지 않는다.
// 음원이 없거나 재생이 차단돼도 모든 진행은 그대로 가능하다.
import { prefs } from './storage';

export type BgmId = 'lobby' | 'investigation' | 'redesign' | null;
export type SfxId = 'select' | 'submit' | 'clue' | 'transition' | 'reveal' | 'time' | 'ending';

const BGM_FILES: Record<Exclude<BgmId, null>, string> = {
  lobby: '/audio/bgm-lobby.mp3',
  investigation: '/audio/bgm-investigation.mp3',
  redesign: '/audio/bgm-redesign.mp3',
};
const SFX_FILES: Record<SfxId, string> = {
  select: '/audio/sfx-select.wav',
  submit: '/audio/sfx-submit.wav',
  clue: '/audio/sfx-clue.wav',
  transition: '/audio/sfx-transition.wav',
  reveal: '/audio/sfx-reveal.wav',
  time: '/audio/sfx-time.wav',
  ending: '/audio/sfx-ending.wav',
};

export interface AudioPrefs {
  muted: boolean;
  bgmVolume: number; // 0~1
  sfxVolume: number; // 0~1
}

type Listener = (p: AudioPrefs & { enabled: boolean; ducked: boolean; current: BgmId }) => void;

class AudioManager {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private current: BgmId = null;
  private pending: BgmId = null;
  private enabled = false;
  private ducked = false;
  private paused = false;
  private listeners = new Set<Listener>();
  prefs: AudioPrefs = prefs.get<AudioPrefs>('audio', { muted: false, bgmVolume: 0.45, sfxVolume: 0.7 });

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }
  private snapshot() {
    return { ...this.prefs, enabled: this.enabled, ducked: this.ducked, current: this.current };
  }
  private notify() {
    for (const fn of this.listeners) fn(this.snapshot());
  }

  /** 사용자 클릭 뒤에 호출해야 한다(자동재생 정책). */
  async enable(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return false;
        this.ctx = new Ctor();
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.bgmGain.connect(this.ctx.destination);
        this.sfxGain.connect(this.ctx.destination);
        document.addEventListener('visibilitychange', () => this.onVisibility());
        window.addEventListener('pagehide', () => this.dispose());
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.enabled = true;
      this.applyGains();
      // 자주 쓰는 효과음 선로드
      void Promise.all(Object.values(SFX_FILES).map((f) => this.load(f)));
      if (this.pending) void this.playBgm(this.pending);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  isEnabled() {
    return this.enabled;
  }

  private async load(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const hit = this.buffers.get(url);
    if (hit) return hit;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(url, buf);
      return buf;
    } catch {
      return null;
    }
  }

  private applyGains(fadeSec = 0.4) {
    if (!this.ctx || !this.bgmGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const bgm = this.prefs.muted || this.paused ? 0 : this.prefs.bgmVolume * (this.ducked ? 0.3 : 1);
    const sfx = this.prefs.muted ? 0 : this.prefs.sfxVolume;
    // 갑작스러운 음량 변화를 피하기 위해 램프 사용
    this.bgmGain.gain.cancelScheduledValues(t);
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, t);
    this.bgmGain.gain.linearRampToValueAtTime(bgm, t + fadeSec);
    this.sfxGain.gain.setValueAtTime(sfx, t);
  }

  setPrefs(p: Partial<AudioPrefs>) {
    this.prefs = { ...this.prefs, ...p };
    prefs.set('audio', this.prefs);
    this.applyGains();
    this.notify();
  }

  setDucked(d: boolean) {
    this.ducked = d;
    this.applyGains(0.6);
    this.notify();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.applyGains(0.5);
  }

  async playBgm(id: BgmId) {
    this.pending = id;
    if (!this.enabled || !this.ctx || !this.bgmGain) return;
    if (id === this.current) return;
    this.stopBgm();
    this.current = id;
    this.notify();
    if (!id) return;
    const buf = await this.load(BGM_FILES[id]);
    if (!buf || this.current !== id || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // 루프 경계 클릭을 줄이기 위해 끝의 아주 짧은 구간을 잘라 루프
    src.loopStart = 0;
    src.loopEnd = Math.max(0, buf.duration - 0.02);
    // 곡 시작 페이드인
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.2);
    src.connect(g).connect(this.bgmGain);
    src.start();
    this.bgmSource = src;
  }

  stopBgm() {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch {
        /* ignore */
      }
      this.bgmSource.disconnect();
    }
    this.bgmSource = null;
    this.current = null;
  }

  async sfx(id: SfxId) {
    if (!this.enabled || !this.ctx || !this.sfxGain || this.prefs.muted) return;
    const buf = await this.load(SFX_FILES[id]);
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain);
    src.start();
  }

  private onVisibility() {
    // 탭이 비활성화되면 BGM 을 낮추고, 돌아오면 복구
    this.paused = document.hidden;
    this.applyGains(0.3);
  }

  dispose() {
    this.stopBgm();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    this.ctx = null;
    this.enabled = false;
  }
}

export const audio = new AudioManager();
