/**
 * MediaPipe 파일 준비 (fetch-mediapipe)
 *
 * 역할: 브라우저가 인터넷 없이도 얼굴·포즈·손 인식을 할 수 있도록 wasm과 모델 파일을 public/mediapipe/ 에 둔다.
 *       wasm은 설치된 @mediapipe/tasks-vision 에서 복사하므로 버전이 항상 package.json 과 같다.
 *       모델은 처음 한 번만 받고, 이미 있으면 건너뛴다.
 * 비고: npm install 뒤(postinstall)에 자동으로 실행된다. 부스 PC에서는 인터넷이 될 때 한 번 npm install 해 두면 된다.
 *       public/mediapipe/ 는 용량이 커서 git에 올리지 않는다(.gitignore).
 *
 * 수정 이력:
 *   - 2026-11-26 최초 작성
 */

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "mediapipe");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");

const MODELS = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "gesture_recognizer.task":
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
};

const exists = (path) =>
  stat(path).then(
    (s) => s.size > 0,
    () => false,
  );

await mkdir(join(outDir, "wasm"), { recursive: true });

for (const name of await readdir(wasmSrc)) {
  await copyFile(join(wasmSrc, name), join(outDir, "wasm", name));
}

for (const [name, url] of Object.entries(MODELS)) {
  const target = join(outDir, name);
  if (await exists(target)) continue;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.log(`[mediapipe] ${name} 받음`);
  } catch (error) {
    // 설치 자체는 막지 않는다. 인터넷이 될 때 npm run mediapipe 로 다시 받으면 된다.
    console.warn(`[mediapipe] ${name} 받기 실패: ${error.message}`);
  }
}
