/**
 * 카드 공유 링크 API (POST /api/share)
 *
 * 역할: 백엔드가 만든 카드 이미지를 Vercel Blob(공개 저장소)에 올리고 그 주소를 돌려준다.
 *       화면은 이 주소를 QR로 띄우고, 참가자는 폰으로 찍어 카드 이미지를 열어 저장한다.
 * 비고: BLOB_READ_WRITE_TOKEN(공개 Blob 저장소의 토큰)이 .env.local 에 있어야 한다. 없으면 503을 돌려준다.
 *       파일 이름에 무작위 꼬리를 붙여 주소를 짐작할 수 없게 한다. 카드에는 얼굴 사진이 없고 일러스트만 있다.
 *       같은 카드를 여러 번 요청해도 한 번만 올린다(서버가 켜져 있는 동안 기억).
 *       받는 값은 백엔드의 카드 경로뿐이라 다른 주소의 파일은 올리지 않는다.
 *
 * 수정 이력:
 *   - 2026-11-27 최초 작성
 */

import { put } from "@vercel/blob";
import { assetUrl } from "@/lib/characterApi";

// 백엔드 카드 경로만 받는다 (예: /cards/<id>/card.png)
const CARD_PATH = /^\/cards\/([A-Za-z0-9_-]+)\/[A-Za-z0-9_-]+\.(png|jpe?g)$/;

// 카드 경로 → 올린 주소 (같은 카드를 두 번 올리지 않게)
const uploaded = new Map<string, Promise<string>>();

async function upload(path: string, id: string, extension: string) {
  const image = await fetch(assetUrl(path));
  if (!image.ok) throw new Error(`카드 이미지를 받지 못함: HTTP ${image.status}`);
  const blob = await put(`cards/${id}.${extension}`, Buffer.from(await image.arrayBuffer()), {
    access: "public",
    addRandomSuffix: true,
    contentType: extension === "png" ? "image/png" : "image/jpeg",
  });
  return blob.url;
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "공유 저장소가 설정되지 않았습니다 (BLOB_READ_WRITE_TOKEN)" }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { card_url?: unknown } | null;
  const path = body?.card_url;
  const match = typeof path === "string" ? CARD_PATH.exec(path) : null;
  if (!match || typeof path !== "string") {
    return Response.json({ error: "카드 경로가 올바르지 않습니다" }, { status: 400 });
  }

  let pending = uploaded.get(path);
  if (!pending) {
    pending = upload(path, match[1], match[2]);
    uploaded.set(path, pending);
  }
  try {
    return Response.json({ url: await pending });
  } catch (error) {
    uploaded.delete(path);
    console.error("카드 공유 링크 만들기 실패", error);
    return Response.json({ error: "공유 링크를 만들지 못했습니다" }, { status: 502 });
  }
}
