"use client";

/**
 * 3D 가마솥 (CauldronModel)
 *
 * 역할: public/models/cauldron.glb 를 three.js로 그린다. 솥 안의 물약 표면이 빛나고 거품이 올라오며,
 *       불빛이 아래에서 일렁인다. 상태(mood)에 따라 물약 색과 끓는 정도, 흔들림이 달라진다.
 * 비고: 모델은 Pixabay(콘텐츠 라이선스)의 "가마솥 마녀 가마솥" GLB다. 파일이 없거나 못 불러오면 onStatus("failed")로
 *       알려 부모(Cauldron)가 기존 SVG 솥을 보여 준다.
 *       모델마다 크기와 중심이 달라 불러온 뒤 경계 상자로 화면 가운데에 맞추고, 물약 표면도 경계 상자 기준으로 놓는다.
 *       위치가 어긋나면 SURFACE 값만 고치면 된다.
 *
 * 수정 이력:
 *   - 2026-11-26 최초 작성
 */

import type { Mesh, MeshBasicMaterial } from "three";
import { useEffect, useRef } from "react";
import type { CauldronMood } from "@/components/Cauldron";

const MODEL_URL = "/models/cauldron.glb";

// 물약 표면 위치 (모델 경계 상자 기준): 높이는 위에서 몇 %, 반지름은 모델 폭의 몇 %
const SURFACE = { fromTop: 0.12, radius: 0.36 };

const BREW_COLORS: Record<CauldronMood, number> = {
  idle: 0x34d399,
  charging: 0x6ee7b7,
  boiling: 0xa855f7,
};

export type ModelStatus = "loading" | "ready" | "failed";

export default function CauldronModel({
  mood,
  onStatus,
}: {
  mood: CauldronMood;
  onStatus: (status: ModelStatus) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    moodRef.current = mood;
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      // 브라우저 전용 라이브러리라 여기서 불러온다
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      host.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);

      // 조명: 은은한 전체 빛 + 위에서 비추는 달빛 + 아래 불빛(일렁임) + 물약에서 올라오는 빛
      scene.add(new THREE.HemisphereLight(0xcbb8ff, 0x1a0f0a, 0.9));
      const moon = new THREE.DirectionalLight(0xdcd6ff, 1.4);
      moon.position.set(-2, 4, 3);
      scene.add(moon);
      const fire = new THREE.PointLight(0xff8a3d, 6, 10, 1.6);
      scene.add(fire);
      const brewLight = new THREE.PointLight(BREW_COLORS[moodRef.current], 4, 6, 1.8);
      scene.add(brewLight);

      const resize = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      let gltf;
      try {
        gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      } catch (error) {
        console.warn("가마솥 모델을 불러오지 못해 그림 솥으로 대신함", error);
        observer.disconnect();
        renderer.dispose();
        renderer.domElement.remove();
        if (!disposed) onStatusRef.current("failed");
        return;
      }
      if (disposed) {
        observer.disconnect();
        renderer.dispose();
        renderer.domElement.remove();
        return;
      }

      // 모델을 원점 가운데·바닥에 놓고 높이를 1로 맞춘다
      const pot = new THREE.Group();
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const unit = 1 / Math.max(size.y, 1e-6);
      model.position.set(-center.x, -box.min.y, -center.z);
      pot.add(model);
      pot.scale.setScalar(unit);
      scene.add(pot);
      const width = size.x * unit;
      const top = 1;

      // 물약 표면: 빛나는 원판
      const surfaceY = top - SURFACE.fromTop;
      const surfaceR = width * SURFACE.radius;
      const brewMaterial = new THREE.MeshBasicMaterial({ color: BREW_COLORS[moodRef.current], transparent: true, opacity: 0.92 });
      const surface = new THREE.Mesh(new THREE.CircleGeometry(surfaceR, 48), brewMaterial);
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = surfaceY;
      scene.add(surface);
      // 표면 위로 번지는 빛 (더하기 섞기)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: BREW_COLORS[moodRef.current],
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(surfaceR * 1.5, 48), glowMaterial);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = surfaceY + 0.01;
      scene.add(glow);
      brewLight.position.set(0, surfaceY + 0.25, 0);
      fire.position.set(0, 0.05, 0.4);

      // 거품: 표면에서 부풀었다가 터진다
      const bubbleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
      const bubbleGeometry = new THREE.SphereGeometry(1, 12, 8);
      const bubbles = Array.from({ length: 9 }, (_, i) => {
        const mesh = new THREE.Mesh(bubbleGeometry, bubbleMaterial.clone());
        scene.add(mesh);
        const angle = (i / 9) * Math.PI * 2 + i;
        const dist = surfaceR * (0.2 + ((i * 37) % 10) / 14);
        return { mesh, x: Math.cos(angle) * dist, z: Math.sin(angle) * dist, offset: i * 0.37 };
      });

      // 카메라: 솥을 살짝 내려다보게
      camera.position.set(0, 0.95, 2.6);
      camera.lookAt(0, 0.45, 0);

      onStatusRef.current("ready");

      const color = new THREE.Color();
      const start = performance.now();
      let frame = 0;
      const render = (now: number) => {
        const t = (now - start) / 1000;
        const current = moodRef.current;
        const active = current !== "idle";
        const speed = current === "boiling" ? 2.6 : current === "charging" ? 1.8 : 1;

        // 물약 색은 천천히 바뀐다
        color.setHex(BREW_COLORS[current]);
        brewMaterial.color.lerp(color, 0.05);
        glowMaterial.color.copy(brewMaterial.color);
        brewLight.color.copy(brewMaterial.color);
        brewLight.intensity = 3 + Math.sin(t * 3 * speed) * 0.8 + (active ? 2 : 0);
        glowMaterial.opacity = 0.3 + 0.12 * Math.sin(t * 2 * speed);

        // 불빛 일렁임
        fire.intensity = 5 + Math.sin(t * 11) * 1.2 + Math.sin(t * 17.3) * 0.8;

        // 솥: 천천히 좌우로 돌고, 끓을 때는 덜덜 떤다
        pot.rotation.y = Math.sin(t * 0.4) * 0.25;
        const shake = current === "boiling" ? 0.012 : current === "charging" ? 0.006 : 0;
        pot.position.x = shake * Math.sin(t * 61);
        pot.position.z = shake * Math.cos(t * 53);

        for (const b of bubbles) {
          const cycle = ((t * speed * 0.8 + b.offset) % 1 + 1) % 1;
          const r = surfaceR * 0.06 * Math.sin(Math.PI * cycle);
          b.mesh.scale.setScalar(Math.max(r, 1e-4));
          b.mesh.position.set(b.x, surfaceY + r * 0.4, b.z);
          (b.mesh.material as MeshBasicMaterial).color.copy(brewMaterial.color).lerp(new THREE.Color(0xffffff), 0.6);
        }

        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        scene.traverse((object) => {
          const mesh = object as Mesh;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
          for (const material of materials) material.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
