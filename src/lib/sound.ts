/**
 * 효과음 (sound)
 *
 * 역할: 재료가 빠지는 소리와 카드가 나올 때의 "뾰로롱" 소리를 Web Audio로 합성해 재생한다. 음원 파일이 필요 없다.
 * 비고: 브라우저 정책상 사용자가 버튼을 누른 뒤부터 소리가 난다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-26 카드가 나올 때 펑(잡음) 대신 뾰로롱(종소리 아르페지오)
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

/** 카드가 나올 때 "뾰로롱": 맑은 종소리가 빠르게 올라가는 아르페지오와 반짝이는 잔음 */
export function playSparkle() {
  const audio = getContext();
  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.value = 0.32;
  master.connect(audio.destination);

  // 종소리 하나: 기본음 + 맑은 배음, 짧게 울리고 사라진다
  const bell = (frequency: number, at: number, volume: number, decay: number) => {
    for (const [ratio, level] of [
      [1, 1],
      [2.01, 0.35],
      [3.99, 0.12],
    ] as const) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency * ratio, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume * level, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      oscillator.connect(gain).connect(master);
      oscillator.start(at);
      oscillator.stop(at + decay + 0.05);
    }
  };

  // 뾰-로-롱: 도·미·솔·도·미 (높은 음역)로 빠르게 올라간다
  const notes = [1046.5, 1318.5, 1568, 2093, 2637];
  notes.forEach((frequency, index) => bell(frequency, now + index * 0.07, 0.5, 0.9));
  // 끝에 반짝이는 잔음 몇 개
  [3136, 3520, 4186].forEach((frequency, index) => bell(frequency, now + 0.38 + index * 0.09, 0.18, 0.6));
}
