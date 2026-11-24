/**
 * AI 얼굴 정밀 분석 화면 (FaceScanReport)
 *
 * 역할: 측정이 끝난 순간의 얼굴 사진 위에 얼굴 점(478개)과 측정선·치수(mm)를 그리고,
 *       옆에 얼굴형·눈·코·입·비율·대칭 실측표와 닮은 동물상을 보여 준다.
 * 비고: 사진은 이 화면에서만 쓰고 저장하거나 보내지 않는다. 다음 참가자로 넘어가면 지운다.
 *       화면은 거울처럼 좌우를 뒤집어 보여 주므로, 사진과 점을 같이 뒤집어 그리고 글씨만 바로 쓴다.
 *       측정선이 하나씩 그려지고 표의 줄이 차례로 나타나 "분석 중" 느낌을 낸다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { Landmark } from "@/lib/faceFeatures";
import type { FaceLook } from "@/lib/faceLook";
import { type FaceMeasure, faceShape, versusAverage } from "@/lib/faceMeasure";

// 치수 글씨 위치: 선의 위/아래/왼쪽 끝 바깥/오른쪽 끝 바깥
type Side = "above" | "below" | "left" | "right";
type Line = { from: number; to: number; label: (m: FaceMeasure) => string; color: string; side: Side };

// 사진 위에 그릴 측정선 (랜드마크 번호)
const LINES: Line[] = [
  { from: 10, to: 152, label: (m) => `세로 ${m.face_height.toFixed(1)}mm`, color: "#fde68a", side: "above" },
  { from: 234, to: 454, label: (m) => `가로 ${m.face_width.toFixed(1)}mm`, color: "#fde68a", side: "right" },
  { from: 33, to: 133, label: (m) => `눈 ${m.eye_width_r.toFixed(1)}mm`, color: "#5eead4", side: "above" },
  { from: 263, to: 362, label: (m) => `눈 ${m.eye_width_l.toFixed(1)}mm`, color: "#5eead4", side: "above" },
  { from: 133, to: 362, label: (m) => `미간 ${m.inner_eye_gap.toFixed(1)}mm`, color: "#c4b5fd", side: "below" },
  { from: 168, to: 2, label: (m) => `코 길이 ${m.nose_length.toFixed(1)}mm`, color: "#f9a8d4", side: "left" },
  { from: 64, to: 294, label: (m) => `콧볼 ${m.nose_width.toFixed(1)}mm`, color: "#f9a8d4", side: "right" },
  { from: 2, to: 0, label: (m) => `인중 ${m.philtrum.toFixed(1)}mm`, color: "#fdba74", side: "left" },
  { from: 61, to: 291, label: (m) => `입 ${m.mouth_width.toFixed(1)}mm`, color: "#fda4af", side: "right" },
  { from: 172, to: 397, label: (m) => `턱 ${m.jaw_width.toFixed(1)}mm`, color: "#a5b4fc", side: "below" },
];

const LINE_MS = 220;

function SnapshotCanvas({
  snapshot,
  landmarks,
  measure,
}: {
  snapshot: string;
  landmarks: Landmark[];
  measure: FaceMeasure;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = new Image();
    let frame = 0;
    image.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const W = image.naturalWidth;
      const H = image.naturalHeight;
      // 얼굴이 화면을 꽉 채우도록 얼굴 둘레를 여유 있게(가로 2.1배) 세로 4:5로 잘라 보여 준다
      const xs = landmarks.map((l) => (1 - l.x) * W);
      const ys = landmarks.map((l) => l.y * H);
      const faceW = Math.max(...xs) - Math.min(...xs);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const cropW = Math.min(W, faceW * 2.1);
      const cropH = Math.min(H, cropW * 1.25);
      const x0 = Math.max(0, Math.min(W - cropW, cx - cropW / 2));
      const y0 = Math.max(0, Math.min(H - cropH, cy - cropH / 2));
      canvas.width = Math.round(cropW);
      canvas.height = Math.round(cropH);
      // 거울처럼 보이도록 x를 뒤집는다 (사진·점 모두). 좌표는 잘라 낸 영역 기준
      const X = (lm: Landmark) => (1 - lm.x) * W - x0;
      const Y = (lm: Landmark) => lm.y * H - y0;
      const scale = cropW / 640;
      const start = performance.now();

      const draw = (now: number) => {
        const t = now - start;
        ctx.save();
        ctx.translate(-x0, -y0);
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = "rgba(10, 6, 20, 0.35)";
        ctx.fillRect(0, 0, cropW, cropH);

        // 얼굴 점: 위에서 아래로 훑으며 나타난다
        const sweep = Math.min(1, t / 900);
        const minY = Math.min(...landmarks.map((l) => l.y));
        const maxY = Math.max(...landmarks.map((l) => l.y));
        const limit = minY + (maxY - minY) * sweep;
        const limitY = limit * H - y0;
        ctx.fillStyle = "rgba(94, 234, 212, 0.8)";
        for (const lm of landmarks) {
          if (lm.y > limit) continue;
          ctx.fillRect(X(lm) - 1.2 * scale, Y(lm) - 1.2 * scale, 2.4 * scale, 2.4 * scale);
        }
        if (sweep < 1) {
          ctx.strokeStyle = "rgba(94, 234, 212, 0.9)";
          ctx.lineWidth = 2 * scale;
          ctx.beginPath();
          ctx.moveTo(0, limitY);
          ctx.lineTo(cropW, limitY);
          ctx.stroke();
        }

        // 측정선과 치수: 점이 다 나온 뒤 하나씩
        const shown = Math.floor(Math.max(0, t - 900) / LINE_MS);
        ctx.font = `600 ${Math.round(17 * scale)}px sans-serif`;
        ctx.textBaseline = "middle";
        LINES.slice(0, shown).forEach((line) => {
          const a = landmarks[line.from];
          const b = landmarks[line.to];
          const ax = X(a);
          const ay = Y(a);
          const bx = X(b);
          const by = Y(b);
          ctx.strokeStyle = line.color;
          ctx.lineWidth = 2.2 * scale;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          for (const [x, y] of [[ax, ay], [bx, by]]) {
            ctx.beginPath();
            ctx.arc(x, y, 3.5 * scale, 0, Math.PI * 2);
            ctx.fillStyle = line.color;
            ctx.fill();
          }
          const text = line.label(measure);
          const width = ctx.measureText(text).width + 12 * scale;
          const gap = 18 * scale;
          let tx = (ax + bx) / 2 - width / 2;
          let ty = (ay + by) / 2;
          if (line.side === "above") ty = Math.min(ay, by) - gap;
          if (line.side === "below") ty = Math.max(ay, by) + gap;
          if (line.side === "right") tx = Math.max(ax, bx) + 10 * scale;
          if (line.side === "left") tx = Math.min(ax, bx) - width - 10 * scale;
          tx = Math.max(4, Math.min(cropW - width - 4, tx));
          ty = Math.max(16 * scale, Math.min(cropH - 16 * scale, ty));
          ctx.fillStyle = "rgba(10, 6, 20, 0.78)";
          ctx.fillRect(tx, ty - 13 * scale, width, 26 * scale);
          ctx.fillStyle = line.color;
          ctx.fillText(text, tx + 6 * scale, ty);
        });

        if (t < 900 + LINE_MS * (LINES.length + 1)) frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    };
    image.src = snapshot;
    return () => cancelAnimationFrame(frame);
  }, [snapshot, landmarks, measure]);

  return <canvas ref={canvasRef} className="block h-auto w-full" aria-label="얼굴 측정 사진" />;
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1">
      <dt className="text-purple-200/85">{label}</dt>
      <dd className="text-right tabular-nums text-zinc-50">
        {value}
        {note && <span className="ml-2 text-xs text-amber-200/80">{note}</span>}
      </dd>
    </div>
  );
}

function Section({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  return (
    <section className="anim-card-appear" style={{ animationDelay: `${delay}ms` }}>
      <h4 className="mb-1 text-sm font-semibold text-amber-100">{title}</h4>
      <dl className="text-sm">{children}</dl>
    </section>
  );
}

export default function FaceScanReport({
  snapshot,
  landmarks,
  measure,
  look,
}: {
  snapshot: string;
  landmarks: Landmark[];
  measure: FaceMeasure;
  look: FaceLook;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 2600);
    return () => clearTimeout(timer);
  }, []);

  const m = measure;
  const mm = (v: number) => `${v.toFixed(1)}mm`;
  const deg = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}°`;
  const shape = faceShape(m);
  const lipRatio = m.lower_lip / Math.max(0.1, m.upper_lip);
  const thirds = m.lowerface / Math.max(0.1, m.midface);
  const eyeAvg = (m.eye_width_r + m.eye_width_l) / 2;
  // 단계별 등장 시각 (사진 위 측정선이 다 그려질 즈음부터)
  const base = 900;

  return (
    <div className="grid w-full items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="relative overflow-hidden rounded-xl border border-teal-200/30 shadow-[0_0_40px_rgba(94,234,212,0.2)]">
        <SnapshotCanvas snapshot={snapshot} landmarks={landmarks} measure={measure} />
        <p className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-teal-100">
          얼굴 점 {landmarks.length}개 인식 · 홍채 지름(11.7mm) 기준 실측
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-amber-200/25 bg-black/50 p-5 backdrop-blur">
        <header className="anim-card-appear flex items-center justify-between" style={{ animationDelay: `${base}ms` }}>
          <h3 className="font-display text-2xl text-amber-100">AI 얼굴 정밀 분석</h3>
          <span className="rounded-full bg-amber-200/15 px-3 py-1 text-sm text-amber-100">{shape.shape}</span>
        </header>
        <p className="anim-card-appear -mt-2 text-xs text-purple-200/80" style={{ animationDelay: `${base}ms` }}>
          {shape.reason}
        </p>

        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <Section title="얼굴" delay={base + 200}>
            <Row label="가로 (광대)" value={mm(m.face_width)} note={versusAverage("face_width", m.face_width)} />
            <Row label="세로" value={mm(m.face_height)} note={versusAverage("face_height", m.face_height)} />
            <Row label="세로 / 가로" value={(m.face_height / m.face_width).toFixed(2)} />
            <Row label="턱 너비" value={mm(m.jaw_width)} note={versusAverage("jaw_width", m.jaw_width)} />
            <Row label="턱끝 각도" value={`${m.chin_angle.toFixed(1)}°`} note={versusAverage("chin_angle", m.chin_angle)} />
            <Row label="좌우 대칭도" value={`${m.symmetry.toFixed(1)}%`} />
          </Section>

          <Section title="눈" delay={base + 500}>
            <Row label="눈 가로 (오른 / 왼)" value={`${m.eye_width_r.toFixed(1)} / ${m.eye_width_l.toFixed(1)}mm`} note={versusAverage("eye_width_r", eyeAvg)} />
            <Row label="눈 세로 (오른 / 왼)" value={`${m.eye_height_r.toFixed(1)} / ${m.eye_height_l.toFixed(1)}mm`} />
            <Row label="눈꼬리 각도 (오른 / 왼)" value={`${deg(m.eye_tilt_r)} / ${deg(m.eye_tilt_l)}`} />
            <Row label="미간" value={mm(m.inner_eye_gap)} note={`눈 가로의 ${(m.inner_eye_gap / eyeAvg).toFixed(2)}배`} />
            <Row label="동공 사이" value={mm(m.pupil_distance)} note={versusAverage("pupil_distance", m.pupil_distance)} />
            <Row label="눈썹 ~ 눈" value={mm(m.brow_to_eye)} note={versusAverage("brow_to_eye", m.brow_to_eye)} />
          </Section>

          <Section title="코" delay={base + 800}>
            <Row label="코 길이" value={mm(m.nose_length)} note={versusAverage("nose_length", m.nose_length)} />
            <Row label="콧볼 너비" value={mm(m.nose_width)} note={versusAverage("nose_width", m.nose_width)} />
            <Row label="콧볼 / 미간" value={(m.nose_width / m.inner_eye_gap).toFixed(2)} />
          </Section>

          <Section title="입 · 비율" delay={base + 1100}>
            <Row label="입 너비" value={mm(m.mouth_width)} note={versusAverage("mouth_width", m.mouth_width)} />
            <Row label="윗입술 / 아랫입술" value={`${m.upper_lip.toFixed(1)} / ${m.lower_lip.toFixed(1)}mm`} note={`1 : ${lipRatio.toFixed(2)}`} />
            <Row label="인중" value={mm(m.philtrum)} note={versusAverage("philtrum", m.philtrum)} />
            <Row label="턱 길이" value={mm(m.chin_length)} note={versusAverage("chin_length", m.chin_length)} />
            <Row label="중안부 : 하안부" value={`${mm(m.midface)} : ${mm(m.lowerface)}`} note={`1 : ${thirds.toFixed(2)}`} />
          </Section>
        </div>

        <section className="anim-card-appear border-t border-white/10 pt-3" style={{ animationDelay: `${base + 1400}ms` }}>
          <h4 className="mb-2 text-sm font-semibold text-amber-100">닮은 동물상</h4>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
            {look.animals.slice(0, 4).map(({ animal, percent }, index) => (
              <li key={animal.key} className="flex items-center gap-2 text-sm">
                <animal.Icon className="shrink-0 text-lg" style={{ color: animal.color }} aria-hidden />
                <span className={`w-16 shrink-0 ${index === 0 ? "font-semibold text-amber-100" : "text-zinc-200"}`}>{animal.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-1000 ease-out"
                    style={{ width: shown ? `${percent}%` : "0%", background: animal.color }}
                  />
                </div>
                <span className="w-9 text-right tabular-nums text-amber-100">{percent}%</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
