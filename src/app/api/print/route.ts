/**
 * 카드 자동 인쇄 API (POST /api/print)
 *
 * 역할: 백엔드가 만든 카드 이미지를 받아 이 PC에 연결된 프린터로 인쇄 창 없이 바로 보낸다.
 *       맥·리눅스는 lp(CUPS), 윈도우는 PowerShell(System.Drawing)로 인쇄한다.
 * 비고: Next 서버가 프린터가 연결된 부스 PC에서 돌아가야 한다.
 *       프린터는 PRINTER_NAME, 맥의 용지 이름은 PRINT_MEDIA 로 정할 수 있다(없으면 기본 프린터·기본 용지).
 *       윈도우는 프린터 드라이버의 기본 용지를 100×148mm(엽서)로 맞춰 둔다.
 *       받는 값은 백엔드의 카드 경로뿐이라 다른 주소의 파일은 인쇄하지 않는다.
 *
 * 수정 이력:
 *   - 2026-11-26 최초 작성
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assetUrl } from "@/lib/characterApi";

const run = promisify(execFile);

// 백엔드 카드 경로만 받는다 (예: /cards/<id>/card.png)
const CARD_PATH = /^\/cards\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpe?g)$/;

// 이미지 한 장을 용지에 여백 없이 꽉 채워 인쇄한다. 경로와 프린터 이름은 환경 변수로 넘겨 명령에 섞이지 않게 한다.
const WINDOWS_SCRIPT = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($env:CARD_FILE)
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  if ($env:PRINTER_NAME) { $doc.PrinterSettings.PrinterName = $env:PRINTER_NAME }
  if (-not $doc.PrinterSettings.IsValid) { throw "프린터를 찾을 수 없음: $($doc.PrinterSettings.PrinterName)" }
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.add_PrintPage({ param($s, $e) $e.Graphics.DrawImage($img, $e.PageBounds); $e.HasMorePages = $false })
  $doc.Print()
} finally { $img.Dispose() }
`;

async function printFile(file: string) {
  const printer = process.env.PRINTER_NAME;
  if (process.platform === "win32") {
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], {
      env: { ...process.env, CARD_FILE: file },
      timeout: 60_000,
    });
    return;
  }
  const media = process.env.PRINT_MEDIA;
  await run(
    "lp",
    [
      ...(printer ? ["-d", printer] : []),
      ...(media ? ["-o", `media=${media}`] : []),
      "-o",
      "fit-to-page",
      file,
    ],
    { timeout: 60_000 },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { card_url?: unknown } | null;
  const path = body?.card_url;
  if (typeof path !== "string" || !CARD_PATH.test(path)) {
    return Response.json({ error: "카드 경로가 올바르지 않습니다" }, { status: 400 });
  }

  const image = await fetch(assetUrl(path)).catch(() => null);
  if (!image?.ok) {
    return Response.json({ error: "카드 이미지를 받지 못했습니다" }, { status: 502 });
  }

  const file = join(tmpdir(), `aiverse-card-${randomUUID()}.${path.split(".").pop()}`);
  await writeFile(file, Buffer.from(await image.arrayBuffer()));
  try {
    await printFile(file);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("카드 인쇄 실패", error);
    return Response.json({ error: "프린터로 보내지 못했습니다" }, { status: 500 });
  } finally {
    // 프린터 대기열은 파일을 복사해 가므로 바로 지워도 된다
    await unlink(file).catch(() => {});
  }
}
