/**
 * 카드 등장 빛 효과 (revealFx)
 *
 * 역할: 카드 뒷면 주위를 빛 리본이 나선으로 감아 돌고, 불씨 같은 반짝이가 흩날리다가
 *       빛이 터지는 순간 카드가 뒤집히도록 캔버스 두 장(카드 뒤 / 카드 앞)에 그린다.
 * 비고: 리본이 카드를 "감싸는" 것처럼 보이도록 타원의 앞쪽 반은 앞 캔버스에, 뒤쪽 반은 뒤 캔버스에 그린다.
 *       색은 부스 콘셉트 색: 골드 리본이 주인공이고 보라·에메랄드 리본이 한 줄씩 섞인다.
 *       시간표(초)는 REVEAL_TIMING에 모아 두었고, 카드 뒤집기 CSS(globals.css의 reveal-card)와 맞춰야 한다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성 (레퍼런스 영상 구성을 따라 나선 리본·불씨·빛살로 다시 만듦)
 */

/** 연출 시간표 (초). 카드가 옆면을 보이는 순간(flip 중간)에 빛이 가장 세다. */
export const REVEAL_TIMING = {
  ribbonsIn: 0.25, // 리본이 나타나기 시작
  burst: 3.2, // 빛살이 터지고 카드가 뒤집히기 시작
  flipEnd: 4.1, // 카드 앞면이 정면을 봄 (globals.css의 reveal-card 길이와 같다)
  end: 5.2, // 효과가 완전히 사라짐
};

type Rgb = readonly [number, number, number];

type Ribbon = {
  glow: Rgb; // 바깥 번짐 색
  core: Rgb; // 가운데 심 색
  tilt: number; // 타원 기울기 (라디안)
  speed: number; // 초당 회전 (라디안)
  phase: number; // 시작 각도
  rise: number; // 위아래로 오르내리는 폭 (카드 높이 대비)
  riseSpeed: number;
  width: number; // 심 두께 (카드 폭 대비)
};

const GOLD: Rgb = [245, 200, 105];
const GOLD_CORE: Rgb = [255, 247, 225];
const VIOLET: Rgb = [167, 139, 250];
const VIOLET_CORE: Rgb = [243, 236, 255];
const EMERALD: Rgb = [110, 231, 183];
const EMERALD_CORE: Rgb = [236, 253, 245];

const RIBBONS: Ribbon[] = [
  { glow: GOLD, core: GOLD_CORE, tilt: -0.22, speed: 4.6, phase: 0, rise: 0.34, riseSpeed: 1.1, width: 0.04 },
  { glow: GOLD, core: GOLD_CORE, tilt: 0.16, speed: 4.1, phase: 2.4, rise: 0.3, riseSpeed: 1.4, width: 0.032 },
  { glow: VIOLET, core: VIOLET_CORE, tilt: -0.08, speed: 5.0, phase: 4.2, rise: 0.38, riseSpeed: 0.9, width: 0.024 },
  { glow: EMERALD, core: EMERALD_CORE, tilt: 0.3, speed: 3.7, phase: 1.1, rise: 0.26, riseSpeed: 1.6, width: 0.02 },
];

type Ember = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; color: Rgb; front: boolean };

const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * 효과를 시작한다. 캔버스 두 장은 카드보다 크게(카드 중심이 캔버스 중심) 놓여 있어야 한다.
 * 돌려주는 함수를 부르면 멈춘다.
 */
export function runRevealFx(back: HTMLCanvasElement, front: HTMLCanvasElement, cardW: number, cardH: number): () => void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = back.clientWidth;
  const H = back.clientHeight;
  for (const canvas of [back, front]) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const bctx = back.getContext("2d");
  const fctx = front.getContext("2d");
  if (!bctx || !fctx) return () => {};
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = W / 2;
  const cy = H / 2;
  // 같은 카드면 늘 같은 모양이 나오도록 고정 시드 난수
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const embers: Ember[] = [];
  const dust = Array.from({ length: 70 }, () => ({
    x: rand() * W,
    y: rand() * H,
    r: 0.6 + rand() * 1.6,
    tw: rand() * Math.PI * 2,
    drift: 6 + rand() * 14,
  }));

  const spawn = (x: number, y: number, frontSide: boolean, color: Rgb, burst = false) => {
    const angle = rand() * Math.PI * 2;
    const speed = burst ? 60 + rand() * 220 : 8 + rand() * 40;
    embers.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (burst ? 0 : 18),
      life: burst ? 0.8 + rand() * 0.9 : 0.6 + rand() * 1.0,
      age: 0,
      size: 0.8 + rand() * (burst ? 2.4 : 1.8),
      color: rand() < 0.7 ? GOLD_CORE : color,
      front: frontSide,
    });
  };

  const start = performance.now();
  let last = start;
  let frame = 0;
  let burstDone = false;

  const draw = (now: number) => {
    const t = (now - start) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    bctx.clearRect(0, 0, W, H);
    fctx.clearRect(0, 0, W, H);
    bctx.globalCompositeOperation = "lighter";
    fctx.globalCompositeOperation = "lighter";

    const { ribbonsIn, burst, flipEnd, end } = REVEAL_TIMING;
    // 리본: 서서히 나타나 burst까지 감아 돌고, 그 뒤 바깥으로 퍼지며 사라진다
    const ribbonAlpha = smooth(ribbonsIn, ribbonsIn + 0.6, t) * (1 - smooth(burst + 0.1, burst + 0.9, t));
    const spread = 1 + 0.9 * smooth(burst, burst + 0.9, t);
    // 카드 뒤 은은한 빛: 점점 세지다가 burst에서 가장 밝고, 끝에는 조금만 남는다
    const aura = 0.25 + 0.45 * smooth(0.3, burst, t) + 0.6 * smooth(burst - 0.2, burst + 0.35, t) * (1 - smooth(flipEnd, end, t));

    // 1) 떠다니는 먼지 별 (뒤)
    for (const d of dust) {
      const a = 0.25 + 0.35 * Math.sin(d.tw + t * 3);
      const y = (d.y - d.drift * t + H) % H;
      bctx.fillStyle = rgba(GOLD_CORE, a * (1 - smooth(flipEnd, end, t) * 0.6));
      bctx.beginPath();
      bctx.arc(d.x, y, d.r, 0, Math.PI * 2);
      bctx.fill();
    }

    // 2) 카드 뒤 빛 (골드 중심 + 보라 가장자리)
    const auraR = cardH * 0.85;
    const g = bctx.createRadialGradient(cx, cy, cardW * 0.2, cx, cy, auraR);
    g.addColorStop(0, rgba(GOLD, 0.55 * aura));
    g.addColorStop(0.45, rgba(VIOLET, 0.22 * aura));
    g.addColorStop(1, rgba(VIOLET, 0));
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, W, H);

    // 3) 빛살: burst 직전부터 천천히 돌며 퍼진다
    const rays = smooth(burst - 0.35, burst + 0.25, t) * (1 - 0.75 * smooth(flipEnd - 0.2, end, t));
    if (rays > 0.01) {
      const count = 22;
      const reach = Math.hypot(W, H) * 0.55;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + t * 0.25 + (i % 3) * 0.05;
        const spreadAngle = 0.035 + (i % 4) * 0.012;
        const len = reach * (0.55 + ((i * 7) % 5) * 0.1);
        const grad = bctx.createRadialGradient(cx, cy, 0, cx, cy, len);
        const tone = i % 7 === 0 ? EMERALD : i % 5 === 0 ? VIOLET : GOLD;
        grad.addColorStop(0, rgba(GOLD_CORE, 0.5 * rays));
        grad.addColorStop(0.35, rgba(tone, 0.28 * rays));
        grad.addColorStop(1, rgba(tone, 0));
        bctx.fillStyle = grad;
        bctx.beginPath();
        bctx.moveTo(cx, cy);
        bctx.lineTo(cx + Math.cos(angle - spreadAngle) * len, cy + Math.sin(angle - spreadAngle) * len);
        bctx.lineTo(cx + Math.cos(angle + spreadAngle) * len, cy + Math.sin(angle + spreadAngle) * len);
        bctx.closePath();
        bctx.fill();
      }
    }

    // 4) 나선 리본
    if (ribbonAlpha > 0.01) {
      const steps = 96;
      for (const r of RIBBONS) {
        const rx = cardW * 0.78 * spread;
        const ry = cardW * 0.2 * spread;
        const head = r.phase + r.speed * t;
        const tail = Math.PI * 1.7; // 꼬리 길이 (라디안)
        // 머리는 카드 위아래를 오르내리고, 꼬리는 나선으로 아래(또는 위)에 남는다
        const headY = cy + Math.sin(r.phase * 0.7 + t * r.riseSpeed) * cardH * r.rise;
        const pitch = cardH * 0.16 * Math.cos(r.phase * 0.7 + t * r.riseSpeed);
        const cos = Math.cos(r.tilt);
        const sin = Math.sin(r.tilt);
        const point = (phi: number) => {
          const ex = Math.cos(phi) * rx;
          const ey = Math.sin(phi) * ry + ((phi - head) / (Math.PI * 2)) * pitch;
          return [cx + ex * cos - ey * sin, headY + ex * sin + ey * cos, Math.sin(phi)] as const;
        };
        // 꼬리를 몇 덩어리로 나눠 덩어리마다 한 번에 긋는다. 짧은 선을 하나씩 그으면 이음새가 겹쳐 점선처럼 보인다.
        const pts = Array.from({ length: steps + 1 }, (_, i) => point(head - tail + (tail * i) / steps));
        const chunk = 6;
        for (let i = 0; i < steps; ) {
          const side = pts[i][2] + pts[i + 1][2] > 0;
          let j = i + 1;
          while (j < steps && j - i < chunk && pts[j][2] + pts[j + 1][2] > 0 === side) j++;
          const k = (i + j) / 2 / steps;
          const a = ribbonAlpha * Math.pow(k, 1.6);
          const w = cardW * r.width * (0.35 + 0.65 * k);
          const ctx = side ? fctx : bctx; // 타원 아래쪽(앞)은 카드 앞에
          ctx.globalCompositeOperation = "source-over";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(pts[i][0], pts[i][1]);
          for (let n = i + 1; n <= j; n++) ctx.lineTo(pts[n][0], pts[n][1]);
          ctx.strokeStyle = rgba(r.glow, a * 0.12);
          ctx.lineWidth = w * 7;
          ctx.stroke();
          ctx.strokeStyle = rgba(r.glow, a * 0.35);
          ctx.lineWidth = w * 2.6;
          ctx.stroke();
          ctx.strokeStyle = rgba(r.core, a * 0.95);
          ctx.lineWidth = w;
          ctx.stroke();
          ctx.globalCompositeOperation = "lighter";
          i = j;
        }
        const prev = pts[steps];
        // 머리에서 불씨가 떨어진다
        for (let n = 0; n < 2; n++) if (rand() < 0.7 * ribbonAlpha) spawn(prev[0], prev[1], prev[2] > 0, r.glow);
      }
    }

    // 5) burst 순간 불씨가 한꺼번에 퍼진다
    if (!burstDone && t >= burst) {
      burstDone = true;
      for (let i = 0; i < 90; i++) {
        const tone = i % 6 === 0 ? EMERALD : i % 4 === 0 ? VIOLET : GOLD;
        spawn(cx + (rand() - 0.5) * cardW * 0.6, cy + (rand() - 0.5) * cardH * 0.6, rand() < 0.5, tone, true);
      }
    }

    // 6) 불씨
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.age += dt;
      if (e.age >= e.life) {
        embers.splice(i, 1);
        continue;
      }
      e.vx *= 0.97;
      e.vy = e.vy * 0.97 - 6 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const fade = 1 - e.age / e.life;
      const ctx = e.front ? fctx : bctx;
      ctx.fillStyle = rgba(e.color, 0.25 * fade);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(GOLD_CORE, 0.95 * fade);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7) 카드가 옆면을 보이는 순간 앞쪽에 짧은 섬광 (앞뒤가 바뀌는 순간을 가린다)
    const flashT = (burst + flipEnd) / 2;
    const flash = Math.exp(-Math.pow((t - flashT) / 0.16, 2));
    if (flash > 0.01) {
      const fg = fctx.createRadialGradient(cx, cy, 0, cx, cy, cardH * 0.7);
      fg.addColorStop(0, rgba(GOLD_CORE, 0.55 * flash));
      fg.addColorStop(0.5, rgba(GOLD, 0.2 * flash));
      fg.addColorStop(1, rgba(GOLD, 0));
      fctx.fillStyle = fg;
      fctx.fillRect(0, 0, W, H);
    }

    if (t < end || embers.length > 0) {
      frame = requestAnimationFrame(draw);
    } else {
      bctx.clearRect(0, 0, W, H);
      fctx.clearRect(0, 0, W, H);
    }
  };
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}
