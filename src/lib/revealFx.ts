/**
 * 카드 등장 빛 효과 (revealFx)
 *
 * 역할: 화면 전체에 카드 공개 연출을 실시간으로 그린다. 영상(카드_공개.mp4)과 같은 흐름이지만 매번 새로 그려서
 *       영상처럼 반복되지 않고, 누르는 순간에 맞춰 반응한다.
 *         1) 등장: 푸른 에너지 줄기가 카드를 스치며 불꽃이 튄다
 *         2) 감기: 금빛 리본이 카드보다 크게 8자로 휘감아 돈다
 *         3) 모이기: 리본이 카드에 붙는 나선 두 줄로 조여들고, 뒤에서 빛살이 터진다
 *         4) 대기: 누를 때까지 나선과 빛살이 계속 돌며 숨 쉬듯 밝아졌다 어두워진다
 *         5) 공개: 누르면 빛이 터지며 카드가 뒤집혀 앞면이 나오고, 리본은 바깥으로 흩어진다
 * 비고: 리본이 카드를 "감싸는" 것처럼 보이도록 타원의 앞쪽 반은 앞 캔버스에, 뒤쪽 반은 뒤 캔버스에 그린다.
 *       카드의 흔들림과 뒤집기도 같은 프레임에서 직접 돌린다. 시간표(초)는 REVEAL_TIMING에 모았다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 *   - 2026-11-24 카드를 눌러야 뒤집히도록 변경
 *   - 2026-11-26 카드 공개 영상을 대신하도록 화면 전체 연출로 다시 만듦 (푸른 줄기 → 금빛 8자 리본 → 나선·빛살 → 대기 → 공개)
 */

/** 연출 시간표 (초). 공개 관련 값은 reveal()을 부른 순간부터 센다. */
export const REVEAL_TIMING = {
  wispsOut: 1.8, // 푸른 줄기가 사라지는 시각
  ribbonsIn: 0.5, // 금빛 리본이 나타나기 시작
  tighten: [2.4, 4.4], // 리본이 카드에 붙는 나선으로 조여드는 구간
  raysIn: [3.4, 4.6], // 빛살이 터지는 구간
  flipDelay: 0.12, // 누른 뒤 뒤집기 시작까지
  flip: 0.85, // 뒤집히는 시간
  linger: 0.9, // 앞면이 나온 뒤 빛이 잦아드는 시간
};

/** 누른 뒤 연출이 끝나 화면을 걷어도 되는 시간 (밀리초) */
export const REVEAL_DONE_MS = (REVEAL_TIMING.flipDelay + REVEAL_TIMING.flip + REVEAL_TIMING.linger) * 1000;

export type RevealFx = { reveal: () => void; stop: () => void };

type Rgb = readonly [number, number, number];

const GOLD: Rgb = [255, 196, 102];
const GOLD_CORE: Rgb = [255, 248, 228];
const AMBER: Rgb = [255, 150, 60];
const BLUE: Rgb = [120, 170, 255];
const BLUE_CORE: Rgb = [232, 242, 255];
const VIOLET: Rgb = [170, 130, 255];

type Ribbon = {
  tilt: number; // 타원 기울기 (라디안)
  speed: number; // 초당 회전 (라디안)
  phase: number; // 시작 각도
  rise: number; // 위아래로 오르내리는 폭 (카드 높이 대비)
  riseSpeed: number;
  width: number; // 심 두께 (카드 폭 대비)
  // 조여든 뒤(나선 단계)에 머무는 높이 (카드 높이 대비, 가운데 0)
  bandY: number;
};

// 영상처럼 굵은 금빛 리본 두 줄이 주인공이고 가는 줄이 하나 따라온다
const RIBBONS: Ribbon[] = [
  { tilt: -0.32, speed: 3.6, phase: 0, rise: 0.42, riseSpeed: 0.9, width: 0.05, bandY: -0.2 },
  { tilt: -0.28, speed: 3.2, phase: 3.1, rise: 0.38, riseSpeed: 1.1, width: 0.044, bandY: 0.22 },
  { tilt: 0.22, speed: 4.2, phase: 1.6, rise: 0.46, riseSpeed: 0.7, width: 0.022, bandY: 0.02 },
];

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  color: Rgb;
  front: boolean;
};

const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * 효과를 시작한다. 캔버스 두 장(카드 뒤 / 카드 앞)은 화면 전체를 덮고, 카드는 화면 가운데에 있어야 한다.
 * card는 뒤집을 요소, getCardSize는 지금 카드의 화면 크기(px)를 돌려준다.
 */
export function runRevealFx(
  back: HTMLCanvasElement,
  front: HTMLCanvasElement,
  card: HTMLElement,
  getCardSize: () => { w: number; h: number },
): RevealFx {
  const bctx = back.getContext("2d");
  const fctx = front.getContext("2d");
  if (!bctx || !fctx) {
    return { reveal: () => (card.style.transform = "rotateY(180deg)"), stop: () => {} };
  }

  // 같은 흐름이 나오도록 고정 시드 난수 (불씨 위치 등)
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  let W = 0;
  let H = 0;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = back.clientWidth;
    const h = back.clientHeight;
    if (w === W && h === H) return;
    W = w;
    H = h;
    for (const canvas of [back, front]) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // 배경의 흐릿한 따뜻한 빛망울 (영상 뒤쪽의 촛불·장식 느낌)
  const bokeh = Array.from({ length: 26 }, () => ({
    x: rand(),
    y: 0.35 + rand() * 0.65,
    r: 0.02 + rand() * 0.06,
    a: 0.05 + rand() * 0.1,
    tw: rand() * Math.PI * 2,
  }));
  // 떠다니는 금가루
  const dust = Array.from({ length: 90 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.5 + rand() * 1.4,
    tw: rand() * Math.PI * 2,
    drift: 0.01 + rand() * 0.03,
  }));
  const embers: Ember[] = [];

  const spawn = (x: number, y: number, frontSide: boolean, color: Rgb, power: number) => {
    const angle = rand() * Math.PI * 2;
    const speed = power * (0.3 + rand());
    embers.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      life: 0.5 + rand() * 1.1,
      age: 0,
      size: 0.7 + rand() * 1.8,
      color: rand() < 0.65 ? GOLD_CORE : color,
      front: frontSide,
    });
  };

  // 선 하나를 바깥 번짐 → 중간 → 가운데 심 순서로 세 번 그어 빛나는 리본처럼 보이게 한다
  const glowStroke = (ctx: CanvasRenderingContext2D, glow: Rgb, core: Rgb, alpha: number, width: number) => {
    ctx.strokeStyle = rgba(glow, alpha * 0.1);
    ctx.lineWidth = width * 8;
    ctx.stroke();
    ctx.strokeStyle = rgba(glow, alpha * 0.32);
    ctx.lineWidth = width * 2.8;
    ctx.stroke();
    ctx.strokeStyle = rgba(core, alpha * 0.95);
    ctx.lineWidth = width;
    ctx.stroke();
  };

  // 시작 시각은 첫 프레임 시각으로 잡는다 (performance.now()와 프레임 시각이 어긋나면 처음이 음수가 된다)
  let start: number | null = null;
  let last = 0;
  let frame = 0;
  let introBurstDone = false;
  let burstDone = false;
  let revealAt: number | null = null;
  let revealPending = false;
  let running = true;

  const draw = (now: number) => {
    fit();
    if (start === null) {
      start = now;
      last = now;
    }
    const t = (now - start) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const { w: cardW, h: cardH } = getCardSize();
    const cx = W / 2;
    const cy = H / 2;
    bctx.clearRect(0, 0, W, H);
    fctx.clearRect(0, 0, W, H);

    if (revealPending) {
      revealPending = false;
      revealAt = t;
    }
    // 누르기 전에는 공개 시각을 아주 먼 미래로 두어 대기 연출이 계속 돈다
    const burst = revealAt ?? 1e9;
    const flipStart = burst + REVEAL_TIMING.flipDelay;
    const flipEnd = flipStart + REVEAL_TIMING.flip;
    const end = flipEnd + REVEAL_TIMING.linger;
    const fadeOut = smooth(flipEnd, end, t);
    // 대기 중 숨 쉬듯 밝아졌다 어두워지는 빛
    const breath = 0.85 + 0.15 * Math.sin(t * 2.2);

    // 카드: 처음에 살짝 떠오르며 커지고, 대기 중에는 천천히 흔들리다, 누르면 앞면으로 뒤집힌다
    const p = clamp01((t - flipStart) / REVEAL_TIMING.flip);
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const intro = smooth(0, 0.9, t);
    const swayY = -10 * Math.sin(t * 1.1);
    const swayX = 4 * Math.cos(t * 0.8);
    const lift = (1 - intro) * 40;
    const scale = lerp(0.82, 1, intro) * (1 + 0.04 * Math.sin(Math.PI * p));
    card.style.opacity = String(intro);
    card.style.transform =
      `translateY(${lift}px) scale(${scale}) ` +
      `rotateX(${swayX * (1 - eased)}deg) rotateY(${swayY * (1 - eased) + 180 * eased}deg)`;

    // 1) 배경: 따뜻한 빛망울과 금가루
    bctx.globalCompositeOperation = "lighter";
    for (const b of bokeh) {
      const a = b.a * (0.7 + 0.3 * Math.sin(b.tw + t)) * (1 - 0.6 * fadeOut);
      const r = b.r * Math.max(W, H);
      const g = bctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, r);
      g.addColorStop(0, rgba(AMBER, a));
      g.addColorStop(1, rgba(AMBER, 0));
      bctx.fillStyle = g;
      bctx.fillRect(b.x * W - r, b.y * H - r, r * 2, r * 2);
    }
    for (const d of dust) {
      const a = (0.2 + 0.35 * Math.sin(d.tw + t * 3)) * (1 - 0.6 * fadeOut);
      const y = (((d.y - d.drift * t) % 1) + 1) % 1;
      bctx.fillStyle = rgba(GOLD_CORE, a);
      bctx.beginPath();
      bctx.arc(d.x * W, y * H, d.r, 0, Math.PI * 2);
      bctx.fill();
    }

    // 2) 카드 뒤 빛: 처음엔 은은하다가 빛살이 터질 때 밝아지고, 공개 순간 가장 밝다
    const raysK = smooth(REVEAL_TIMING.raysIn[0], REVEAL_TIMING.raysIn[1], t);
    const aura = (0.3 + 0.5 * raysK * breath + 0.8 * smooth(burst - 0.05, burst + 0.35, t)) * (1 - 0.7 * fadeOut);
    const auraR = cardH * 1.1;
    const g = bctx.createRadialGradient(cx, cy, cardW * 0.15, cx, cy, auraR);
    g.addColorStop(0, rgba(GOLD_CORE, 0.5 * aura));
    g.addColorStop(0.35, rgba(GOLD, 0.35 * aura));
    g.addColorStop(1, rgba(AMBER, 0));
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, W, H);

    // 3) 빛살: 영상 끝처럼 카드 뒤에서 사방으로 뻗고, 대기 중엔 천천히 돈다
    const rays = (raysK * breath + 0.6 * smooth(burst, burst + 0.3, t)) * (1 - 0.8 * fadeOut);
    if (rays > 0.01) {
      const count = 28;
      const reach = Math.hypot(W, H) * 0.6;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + t * 0.06 + (i % 3) * 0.04;
        const half = 0.025 + (i % 4) * 0.012;
        const len = reach * (0.5 + ((i * 7) % 5) * 0.12);
        const grad = bctx.createRadialGradient(cx, cy, cardW * 0.2, cx, cy, len);
        grad.addColorStop(0, rgba(GOLD_CORE, 0.3 * rays));
        grad.addColorStop(0.3, rgba(GOLD, 0.15 * rays));
        grad.addColorStop(1, rgba(AMBER, 0));
        bctx.fillStyle = grad;
        bctx.beginPath();
        bctx.moveTo(cx, cy);
        bctx.lineTo(cx + Math.cos(angle - half) * len, cy + Math.sin(angle - half) * len);
        bctx.lineTo(cx + Math.cos(angle + half) * len, cy + Math.sin(angle + half) * len);
        bctx.closePath();
        bctx.fill();
      }
    }

    // 4) 등장: 푸른 에너지 줄기가 왼쪽 아래에서 오른쪽 위로 카드를 스친다
    const wisps = 1 - smooth(0.6, REVEAL_TIMING.wispsOut, t);
    if (wisps > 0.01) {
      const slope = -0.55;
      for (let k = 0; k < 6; k++) {
        const ctx = k % 2 ? fctx : bctx;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        ctx.beginPath();
        const offset = (k - 2.5) * cardW * 0.18;
        for (let s = 0; s <= 60; s++) {
          const x = -0.1 * W + (s / 60) * 1.2 * W;
          const wave = Math.sin(x * 0.008 + t * (3 + k * 0.4) + k) * cardH * 0.06;
          const y = cy + slope * (x - cx) + offset + wave;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        glowStroke(ctx, k % 3 ? BLUE : VIOLET, BLUE_CORE, wisps * (0.5 + 0.1 * k), cardW * (0.006 + 0.003 * (k % 3)));
      }
      if (!introBurstDone && t > 0.15) {
        introBurstDone = true;
        for (let i = 0; i < 70; i++) {
          spawn(cx + (rand() - 0.5) * cardW, cy + (rand() - 0.5) * cardH, rand() < 0.5, BLUE, 260);
        }
      }
    }

    // 5) 금빛 리본: 처음엔 카드보다 크게 8자로 돌다가, 카드에 붙는 나선으로 조여든다. 공개 때는 바깥으로 흩어진다.
    const ribbonAlpha = smooth(REVEAL_TIMING.ribbonsIn, REVEAL_TIMING.ribbonsIn + 0.7, t) * (1 - smooth(burst + 0.1, burst + 0.8, t));
    if (ribbonAlpha > 0.01) {
      const tight = smooth(REVEAL_TIMING.tighten[0], REVEAL_TIMING.tighten[1], t);
      const spread = lerp(1.55, 1, tight) * (1 + 1.2 * smooth(burst, burst + 0.8, t));
      const steps = 110;
      for (const r of RIBBONS) {
        const rx = cardW * 0.82 * spread;
        const ry = cardW * lerp(0.42, 0.2, tight) * spread;
        const head = r.phase + r.speed * t;
        const tail = Math.PI * lerp(1.9, 1.6, tight);
        // 감기 단계: 머리가 카드 위아래를 크게 오르내린다(8자) / 나선 단계: 정해진 높이(bandY)에 머문다
        const freeY = Math.sin(r.phase * 0.7 + t * r.riseSpeed) * cardH * r.rise;
        const headY = cy + lerp(freeY, cardH * r.bandY + Math.sin(t * 1.3 + r.phase) * cardH * 0.03, tight);
        const pitch = cardH * lerp(0.3 * Math.cos(r.phase * 0.7 + t * r.riseSpeed), 0.08, tight);
        const tilt = lerp(r.tilt, r.tilt * 0.6, tight);
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        const point = (phi: number) => {
          const ex = Math.cos(phi) * rx;
          const ey = Math.sin(phi) * ry + ((phi - head) / (Math.PI * 2)) * pitch;
          return [cx + ex * cos - ey * sin, headY + ex * sin + ey * cos, Math.sin(phi)] as const;
        };
        // 꼬리를 덩어리로 나눠 한 번에 긋는다. 짧은 선을 하나씩 그으면 이음새가 겹쳐 점선처럼 보인다.
        const pts = Array.from({ length: steps + 1 }, (_, i) => point(head - tail + (tail * i) / steps));
        const chunk = 6;
        for (let i = 0; i < steps; ) {
          const side = pts[i][2] + pts[i + 1][2] > 0;
          let j = i + 1;
          while (j < steps && j - i < chunk && pts[j][2] + pts[j + 1][2] > 0 === side) j++;
          const k = (i + j) / 2 / steps;
          const a = ribbonAlpha * Math.pow(k, 1.4) * (0.85 + 0.15 * breath);
          const w = cardW * r.width * (0.3 + 0.7 * k);
          const ctx = side ? fctx : bctx; // 타원 아래쪽(앞)은 카드 앞에
          ctx.globalCompositeOperation = "lighter";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(pts[i][0], pts[i][1]);
          for (let n = i + 1; n <= j; n++) ctx.lineTo(pts[n][0], pts[n][1]);
          glowStroke(ctx, GOLD, GOLD_CORE, a, w);
          i = j;
        }
        const tip = pts[steps];
        for (let n = 0; n < 3; n++) if (rand() < 0.75 * ribbonAlpha) spawn(tip[0], tip[1], tip[2] > 0, GOLD, 50);
      }
    }

    // 6) 공개 순간 불씨가 한꺼번에 퍼진다
    if (!burstDone && t >= burst) {
      burstDone = true;
      for (let i = 0; i < 140; i++) {
        spawn(cx + (rand() - 0.5) * cardW * 0.7, cy + (rand() - 0.5) * cardH * 0.7, rand() < 0.5, GOLD, 380);
      }
    }

    // 7) 불씨
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.age += dt;
      if (e.age >= e.life) {
        embers.splice(i, 1);
        continue;
      }
      e.vx *= 0.96;
      e.vy = e.vy * 0.96 - 10 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const fade = 1 - e.age / e.life;
      const ctx = e.front ? fctx : bctx;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(e.color, 0.22 * fade);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(GOLD_CORE, 0.95 * fade);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8) 카드가 옆면을 보이는 순간 화면 전체에 섬광 (앞뒤가 바뀌는 순간을 가린다)
    const flashT = (flipStart + flipEnd) / 2;
    const flash = Math.exp(-Math.pow((t - flashT) / 0.18, 2));
    if (flash > 0.01) {
      fctx.globalCompositeOperation = "lighter";
      const fg = fctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.6);
      fg.addColorStop(0, rgba(GOLD_CORE, 0.85 * flash));
      fg.addColorStop(0.4, rgba(GOLD, 0.4 * flash));
      fg.addColorStop(1, rgba(AMBER, 0));
      fctx.fillStyle = fg;
      fctx.fillRect(0, 0, W, H);
    }

    if (t < end || embers.length > 0) {
      frame = requestAnimationFrame(draw);
    } else {
      running = false;
      bctx.clearRect(0, 0, W, H);
      fctx.clearRect(0, 0, W, H);
      card.style.transform = "rotateY(180deg)";
    }
  };
  frame = requestAnimationFrame(draw);
  return {
    reveal: () => {
      // 다음 프레임 시각에 맞춰 시작하도록 공개 시각은 그 프레임에서 정한다
      if (revealAt === null && running) revealPending = true;
    },
    stop: () => cancelAnimationFrame(frame),
  };
}
