/**
 * 효과음 (sound)
 *
 * 역할: 재료가 빠지는 소리와 펑 터지는 소리를 Web Audio로 합성해 재생한다. 음원 파일이 필요 없다.
 * 비고: 브라우저 정책상 사용자가 버튼을 누른 뒤부터 소리가 난다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

let context: AudioContext | null = null;

function getContext() {
  context ??= new AudioContext();
  if (context.state === "suspended") context.resume();
  return context;
}

export function playPlop() {
  const audio = getContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.frequency.setValueAtTime(520, now);
  oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.18);
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.25);
}

export function playPoof() {
  const audio = getContext();
  const now = audio.currentTime;
  const length = audio.sampleRate;
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2200, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + 0.9);
  const gain = audio.createGain();
  gain.gain.value = 0.8;
  noise.connect(filter).connect(gain).connect(audio.destination);
  noise.start(now);
}
