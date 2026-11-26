/**
 * 카드 자동 인쇄 API (POST /api/print)
 *
 * 역할: 백엔드가 만든 카드 이미지를 받아 이 PC에 연결된 프린터로 인쇄 창 없이 바로 보낸다.
 *       맥·리눅스는 lp(CUPS), 윈도우는 PowerShell(System.Drawing)로 인쇄한다.
 * 비고: Next 서버가 프린터가 연결된 부스 PC에서 돌아가야 한다.
 *       프린터는 연결된 것 중 Canon SELPHY CP1500을 자동으로 찾는다. 못 찾으면 인쇄하지 않고 실패를 돌려준다
 *       (다른 프린터로 잘못 나가지 않게). PRINTER_NAME 을 주면 그 프린터를 쓴다.
 *       맥은 엽서 여백 없음(Postcard.Fullbleed, 100×148mm)으로 보낸다. PRINT_MEDIA 로 바꿀 수 있다.
 *       윈도우는 프린터 드라이버의 기본 용지를 엽서(여백 없음)로 맞춰 둔다.
 *       받는 값은 백엔드의 카드 경로뿐이라 다른 주소의 파일은 인쇄하지 않는다.
 *
 * 수정 이력:
 *   - 2026-11-26 최초 작성
 *   - 2026-11-26 Canon SELPHY CP1500을 자동으로 찾아 그 프린터로만 인쇄, 맥은 엽서 여백 없음
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

// 부스 프린터 이름에 들어 있는 말 (macOS: Canon_SELPHY_CP1500, 윈도우: Canon SELPHY CP1500)
const BOOTH_PRINTER = /SELPHY.*CP1500|CP1500/i;

// 이미지 한 장을 용지에 여백 없이 꽉 채워 인쇄한다. 경로와 프린터 이름은 환경 변수로 넘겨 명령에 섞이지 않게 한다.
// 프린터 이름이 없으면 설치된 프린터 중 CP1500을 찾고, 없으면 실패한다 (기본 프린터로 잘못 나가지 않게).
const WINDOWS_SCRIPT = `
Add-Type -AssemblyName System.Drawing
$name = $env:PRINTER_NAME
if (-not $name) {
  $name = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters | Where-Object { $_ -match 'CP1500' } | Select-Object -First 1
}
if (-not $name) { throw "CP1500 프린터를 찾을 수 없음" }
$img = [System.Drawing.Image]::FromFile($env:CARD_FILE)
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $name
  if (-not $doc.PrinterSettings.IsValid) { throw "프린터를 찾을 수 없음: $($doc.PrinterSettings.PrinterName)" }
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.add_PrintPage({ param($s, $e) $e.Graphics.DrawImage($img, $e.PageBounds); $e.HasMorePages = $false })
  $doc.Print()
} finally { $img.Dispose() }
`;

/** macOS·리눅스: 프린터 이름 목록(lpstat -e, 한 줄에 하나)에서 CP1500을 찾는다. -p는 시스템 언어로 나와 쓰지 않는다. */
async function findBoothPrinter(): Promise<string | null> {
  const { stdout } = await run("lpstat", ["-e"], { timeout: 10_000 });
  return stdout.split("\n").map((line) => line.trim()).find((name) => BOOTH_PRINTER.test(name)) ?? null;
}

async function printFile(file: string) {
  if (process.platform === "win32") {
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], {
      env: { ...process.env, CARD_FILE: file },
      timeout: 60_000,
    });
    return;
  }
  const printer = process.env.PRINTER_NAME || (await findBoothPrinter());
  if (!printer) throw new Error("CP1500 프린터를 찾을 수 없음");
  const media = process.env.PRINT_MEDIA || "Postcard.Fullbleed";
  await run("lp", ["-d", printer, "-o", `media=${media}`, "-o", "fit-to-page", file], { timeout: 60_000 });
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
