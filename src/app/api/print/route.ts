/**
 * 카드 자동 인쇄 API (POST /api/print)
 *
 * 역할: 백엔드가 만든 카드 이미지를 받아 이 PC에 연결된 프린터로 인쇄 창 없이 바로 보낸다.
 *       맥·리눅스는 lp(CUPS), 윈도우는 PowerShell(System.Drawing)로 인쇄한다.
 * 비고: Next 서버가 프린터가 연결된 부스 PC에서 돌아가야 한다.
 *       프린터는 연결된 것 중 Canon SELPHY CP1500을 자동으로 찾는다. 못 찾으면 인쇄하지 않고 실패를 돌려준다
 *       (다른 프린터로 잘못 나가지 않게). PRINTER_NAME 을 주면 그 프린터를 쓴다.
 *       용지는 카드 크기(54×86mm)다. 여백 없음(Fullbleed)은 프린터가 용지보다 크게 찍어 카드 테두리가 잘리므로
 *       여백 있는 인쇄로 카드 전체(테두리 포함)를 용지 안에 맞춘다. 가장자리에 얇은 흰 여백이 생긴다.
 *       맥은 54x86mm 로 보낸다(PRINT_MEDIA 로 바꿀 수 있다). 윈도우는 드라이버 기본 용지를 카드 크기로 맞춰 둔다.
 *       받는 값은 백엔드의 카드 경로뿐이라 다른 주소의 파일은 인쇄하지 않는다.
 *
 * 수정 이력:
 *   - 2026-11-26 최초 작성
 *   - 2026-11-26 여백 없음 인쇄에서 테두리가 잘려 여백 있는 카드 크기(54x86mm)로, 윈도우도 가장자리 여유를 둠
 *   - 2026-11-26 용지를 엽서에서 카드 크기(54×86mm)로, 카드 전체가 보이게 비율 유지해 맞춤
 *   - 2026-11-26 와이파이와 USB로 둘 다 등록돼 있으면 USB 쪽 CP1500을 고름
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
  # 비율을 지키며 용지 안에 전체가 들어가게 맞추고 가운데에 둔다 (남는 쪽은 흰 여백)
  $doc.add_PrintPage({ param($s, $e)
    $page = $e.PageBounds
    # 프린터가 가장자리를 조금 잘라 먹어도 테두리가 남도록 4% 안쪽에 그린다
    $scale = [Math]::Min($page.Width / $img.Width, $page.Height / $img.Height) * 0.96
    $w = $img.Width * $scale; $h = $img.Height * $scale
    $e.Graphics.DrawImage($img, [single](($page.Width - $w) / 2), [single](($page.Height - $h) / 2), [single]$w, [single]$h)
    $e.HasMorePages = $false
  })
  $doc.Print()
} finally { $img.Dispose() }
`;

/**
 * macOS·리눅스: 프린터 이름 목록(lpstat -e, 한 줄에 하나)에서 CP1500을 찾는다. -p는 시스템 언어로 나와 쓰지 않는다.
 * 같은 CP1500이 와이파이와 USB로 둘 다 등록돼 있으면 USB 쪽을 고른다 (와이파이는 이름이 바뀌거나 끊기면 인쇄가 멈춘다).
 */
async function findBoothPrinter(): Promise<string | null> {
  const { stdout } = await run("lpstat", ["-e"], { timeout: 10_000 });
  const names = stdout.split("\n").map((line) => line.trim()).filter((name) => BOOTH_PRINTER.test(name));
  if (names.length <= 1) return names[0] ?? null;
  // lpstat -v 한 줄: "<이름>에 대한 기기: <주소>" (가운데 문구는 시스템 언어, 이름은 줄 맨 앞, 주소는 줄 끝)
  const { stdout: devices } = await run("lpstat", ["-v"], { timeout: 10_000 });
  for (const line of devices.split("\n")) {
    if (!/(?:ippusb|usb):\/\/\S*$/.test(line.trim())) continue;
    // 이름이 다른 이름의 앞부분일 수 있어(CP1500 / CP1500_2) 줄 맨 앞과 가장 길게 맞는 이름을 고른다
    const name = names
      .filter((candidate) => line.startsWith(candidate) && !/[A-Za-z0-9_-]/.test(line[candidate.length] ?? ""))
      .sort((a, b) => b.length - a.length)[0];
    if (name) return name;
  }
  return names[0];
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
  const media = process.env.PRINT_MEDIA || "54x86mm";
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
