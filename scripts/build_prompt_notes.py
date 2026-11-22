"""
프롬프트 노트 만들기 (build_prompt_notes)

역할: 백엔드 코드에서 프롬프트 원문과 재료 표를 읽어, 팀 공유용 "이게 나라고? 프롬프트 노트" HTML을 만든다.
비고: 프롬프트를 고친 뒤 다시 실행하면 페이지가 최신 원문으로 갱신된다. OpenAI는 호출하지 않는다.
      실행: 백엔드 폴더에서 .venv/bin/python -m scripts.build_prompt_notes [출력.html] [--example character.json]
      출력 기본값은 output/prompt-notes.html (git 제외). 예시는 output/cards 의 가장 최근 실제 동물 카드를 쓰고,
      없으면 아래 SAMPLE 값을 쓴다.

수정 이력:
  - 2026-11-22 최초 작성
  - 2026-11-22 파일을 직접 열 때 한글이 깨지는 문제 수정 (UTF-8 인코딩 선언 추가)
  - 2026-11-22 이름 음절 표를 이름 낱말(name_hints) 표로 변경
  - 2026-11-22 실제 동물 캐릭터로 교체: 화풍 추출 단락과 참고 캐릭터 표 삭제, 동물·이름 낱말을 무작위 풀로 표시
  - 2026-11-22 의상 템플릿 표 추가
"""

import argparse
import glob
import html
import json
import os
import subprocess

from app.schemas import Answers, CharacterResponse, FaceFeatures
from app.services import ai_character, illustration
from app.services import parameters as P

e = html.escape

parser = argparse.ArgumentParser(description="프롬프트 노트 HTML 만들기")
parser.add_argument("out", nargs="?", default="output/prompt-notes.html", help="출력 HTML 경로")
parser.add_argument("--example", help="예시로 쓸 character.json (기본: output/cards 의 최근 실제 동물 카드)")
args = parser.parse_args()


def _git(*command: str) -> str:
    return subprocess.run(["git", *command], capture_output=True, text=True).stdout.strip()


commit = _git("log", "-1", "--format=%h %s")
branch = _git("branch", "--show-current")

# 생성한 카드가 없는 팀원도 실행할 수 있도록 넣어 둔 예시 (실제 생성 결과에서 가져옴)
SAMPLE = {
    "name": "몽실몽실한 수달",
    "race": "수달",
    "element": "물안개",
    "disposition": "물결 따라 천천히 길을 찾는 수달",
    "stats": {"insight": 49, "vitality": 64, "resonance": 46, "agility": 61, "willpower": 46, "luck": 34},
    "reason": "물안개 조각이 먼저 끓어올라 작은 수달을 깨웠다.",
    "appearance": "윤기 나는 갈색 털에 두 눈 사이가 먼 편이고 입이 작은 수달로, 가슴 쪽 털이 밝다.",
    "backstory": "심해 등불 사이를 헤엄치며 길 잃은 물고기에게 방향을 알려 준다.",
    "lucky_item": "조약돌",
    "message_2027": "2027년에는 너만의 속도로 새로운 물길을 찾아가길 바랄게.",
}


def _latest_example() -> str | None:
    cards = [
        path
        for path in glob.glob("output/cards/*/character.json")
        if json.load(open(path, encoding="utf-8"))["parameters"].get("character_type") == P.CHARACTER_TYPES["animal"]
    ]
    return max(cards, key=os.path.getmtime) if cards else None

FEATURES = dict(
    face_aspect_ratio=1.33, eye_spacing_ratio=0.43, inner_eye_gap_ratio=0.25, eye_position_ratio=0.38,
    nose_length_ratio=0.26, nose_position_ratio=0.60, nose_width_ratio=0.27, mouth_width_ratio=0.40,
    lip_thickness_ratio=0.09, mouth_position_ratio=0.72, jaw_width_ratio=0.83,
    head_yaw=2.0, head_pitch=-3.0, head_roll=1.0,
)
ANSWERS = dict(
    character_type="animal", place="deep_sea", companion="alone", wish_2027="adventure",
    time_of_day="dawn", crisis="confront", power="transform", bag="book",
)
features, answers = FaceFeatures(**FEATURES), Answers(**ANSWERS)
params = P.build_parameters(features, answers)

example_path = args.example or _latest_example()
if example_path:
    example = CharacterResponse(**json.load(open(example_path, encoding="utf-8")))
else:
    example = CharacterResponse(
        **SAMPLE,
        palette=params.palette,
        ability=params.ability,
        parameters=params,
    )

decision_input = params.model_dump_json(indent=2)
example.parameters = params
prompt_free = illustration.build_prompt(example, with_pose=False)
prompt_pose = illustration.build_prompt(example, with_pose=True)
nonhuman = CharacterResponse(
    **{
        **example.model_dump(),
        "race": "등대 머리",
        "parameters": P.build_parameters(features, Answers(**{**ANSWERS, "character_type": "nonhuman"})),
    }
)
prompt_nonhuman = illustration.build_prompt(nonhuman, with_pose=False)
example_output = {k: example.model_dump()[k] for k in (
    "name", "race", "element", "disposition", "stats", "reason", "appearance", "backstory", "lucky_item", "message_2027"
)}


def block(pid, title, text, lang="프롬프트"):
    return f"""
<div class="code" id="{pid}">
  <div class="code-bar"><span>{e(title)}</span><span class="code-meta">{e(lang)} · {len(text):,}자</span>
    <button type="button" class="copy" data-target="{pid}-pre">복사</button></div>
  <pre id="{pid}-pre">{e(text)}</pre>
</div>"""


def rows(items):
    return "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in items)


trait_rows = rows([(f"<code>{e(k)}</code>", e(lo), e(hi)) for k, (lo, hi) in P.FACE_TRAITS.items()])
style_text = " / ".join(f"<b>{e(k)}</b>: {e(v)}" for k, v in illustration.STYLES.items())

# 파일을 브라우저에서 바로 열어도 한글이 깨지지 않도록 인코딩을 맨 앞에 선언한다
page = f"""<meta charset="utf-8">
<title>이게 나라고? 프롬프트 노트</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700&family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* 레이아웃: 왼쪽 단계 목차 + 오른쪽 본문. 좁으면 목차가 위로 올라간다. 홀로 카드 느낌은 얇은 무지개 줄 하나로만. */
:root {{
  --bg: #f6f5fb; --surface: #ffffff; --fg: #1d1a2b; --muted: #5d5872; --line: #e2dff0;
  --accent: #6b4fd8; --accent-soft: #ece7ff; --code-bg: #faf9ff; --warn: #a3441c; --warn-soft: #fff1e8;
  --holo: linear-gradient(90deg, #ff9ad5, #ffd66b, #8ff0c4, #8ccfff, #c9a2ff);
  --display: "Gowun Batang", "Noto Serif KR", serif;
  --body: "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #121019; --surface: #1b1826; --fg: #ece9f7; --muted: #a49fbb; --line: #2e2a3d;
  --accent: #b5a3ff; --accent-soft: #2a2442; --code-bg: #15131e; --warn: #ffb08a; --warn-soft: #2e1f18; color-scheme: dark }} }}
:root[data-theme="dark"] {{
  --bg: #121019; --surface: #1b1826; --fg: #ece9f7; --muted: #a49fbb; --line: #2e2a3d;
  --accent: #b5a3ff; --accent-soft: #2a2442; --code-bg: #15131e; --warn: #ffb08a; --warn-soft: #2e1f18; color-scheme: dark }}
* {{ box-sizing: border-box }}
body {{ background: var(--bg); color: var(--fg); font: 15px/1.7 var(--body); margin: 0 }}
.wrap {{ max-width: 1180px; margin: 0 auto; padding-block: 32px 80px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px }}
header.top {{ grid-column: 1 / -1; display: grid; gap: 10px }}
header.top::before {{ content: ""; height: 4px; border-radius: 2px; background: var(--holo); width: 120px }}
h1 {{ font: 700 clamp(28px, 4vw, 40px)/1.2 var(--display); margin: 0; text-wrap: balance }}
.lede {{ color: var(--muted); max-width: 70ch; margin: 0 }}
.meta {{ font: 12px/1.6 var(--mono); color: var(--muted) }}
nav {{ position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); align-self: start; display: grid; gap: 4px; font-size: 14px }}
nav a {{ color: var(--muted); text-decoration: none; padding: 6px 10px; border-radius: 8px }}
nav a:hover, nav a:focus-visible {{ background: var(--accent-soft); color: var(--fg); outline: none }}
nav .label {{ font-size: 11px; letter-spacing: .08em; color: var(--muted); padding: 0 10px 4px }}
main {{ display: grid; gap: 56px; min-width: 0 }}
section {{ display: grid; gap: 16px; min-width: 0; scroll-margin-top: 24px }}
h2 {{ font: 700 24px/1.3 var(--display); margin: 0; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap }}
h2 .step {{ font: 600 12px/1 var(--mono); color: var(--accent); background: var(--accent-soft); padding: 5px 8px; border-radius: 6px }}
h3 {{ font-size: 15px; margin: 8px 0 0 }}
p {{ margin: 0; max-width: 75ch }}
.facts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px }}
.fact {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 2px; min-width: 0 }}
.fact dt {{ font-size: 11px; letter-spacing: .06em; color: var(--muted) }}
.fact dd {{ margin: 0; font-size: 14px; overflow-wrap: anywhere }}
code {{ font: 13px var(--mono); background: var(--accent-soft); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere }}
.code {{ border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--code-bg); min-width: 0 }}
.code-bar {{ display: flex; gap: 12px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--surface); font-size: 13px; font-weight: 500; flex-wrap: wrap }}
.code-meta {{ color: var(--muted); font: 12px var(--mono); margin-right: auto }}
.copy {{ font: 500 12px var(--body); color: var(--accent); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; cursor: pointer }}
.copy:hover, .copy:focus-visible {{ background: var(--accent-soft); outline: none }}
pre {{ margin: 0; padding: 14px 16px; font: 13px/1.65 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 560px; overflow: auto }}
.table {{ overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface) }}
table {{ border-collapse: collapse; width: 100%; font-size: 13.5px }}
th, td {{ text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top }}
th {{ font-size: 12px; color: var(--muted); font-weight: 500; white-space: nowrap }}
tr:last-child td {{ border-bottom: 0 }}
.note {{ background: var(--warn-soft); color: var(--fg); border-radius: 10px; padding: 12px 14px; font-size: 14px; border-left: 3px solid var(--warn) }}
.flow {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; counter-reset: s }}
.flow div {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 13px; display: grid; gap: 2px }}
.flow b {{ font-size: 14px }}
.flow span {{ color: var(--muted) }}
.flow .ai {{ border-color: var(--accent) }}
ul {{ margin: 0; padding-left: 20px; display: grid; gap: 4px; max-width: 75ch }}
@media (max-width: 820px) {{ .wrap {{ grid-template-columns: 1fr; gap: 24px }} nav {{ position: static; grid-auto-flow: column; overflow-x: auto; }} nav .label {{ display: none }} }}
@media (prefers-reduced-motion: reduce) {{ * {{ scroll-behavior: auto }} }}
</style>

<div class="wrap">
<header class="top">
  <h1>이게 나라고? 프롬프트 노트</h1>
  <p class="lede">ai-dentity 부스에서 캐릭터 카드 한 장을 만들 때 AI 모델에 보내는 프롬프트 원문과, 각 프롬프트가 어디서 어떤 재료를 받아 어디에 쓰이는지 정리했습니다. 원문은 백엔드 코드에서 그대로 읽어 왔습니다.</p>
  <div class="meta">백엔드 {e(branch)} · {e(commit)}</div>
</header>

<nav aria-label="목차">
  <div class="label">흐름</div>
  <a href="#flow">전체 흐름</a>
  <div class="label">프롬프트</div>
  <a href="#decide">② 캐릭터 결정·글</a>
  <a href="#image">③ 일러스트</a>
  <div class="label">프롬프트에 들어가는 재료</div>
  <a href="#traits">얼굴 생김새 문구</a>
  <a href="#roles">무작위 재료 (동물·의상·이름 수식어)</a>
  <a href="#models">모델과 환경변수</a>
</nav>

<main>
<section id="flow">
  <h2>전체 흐름</h2>
  <p>AI가 쓰이는 곳은 ②③ 두 군데입니다. ①은 측정값·설문과 무작위 재료로 재료를 만들고, ④는 코드로 카드를 그립니다.</p>
  <div class="flow">
    <div><b>얼굴·포즈 측정</b><span>브라우저 MediaPipe. 영상은 밖으로 나가지 않음</span></div>
    <div><b>① 재료</b><span>parameters.py — 점수, 후보, 능력치, 무작위 동물·이름 낱말</span></div>
    <div class="ai"><b>② 캐릭터 결정·글</b><span>ai_character.py</span></div>
    <div class="ai"><b>③ 일러스트</b><span>illustration.py</span></div>
    <div><b>④ 카드 합성</b><span>photocard.py — 홀로 카드 틀, 모델 아님</span></div>
  </div>
  <div class="table"><table>
    <tr><th>단계</th><th>파일 · 함수</th><th>API</th><th>입력</th><th>출력이 쓰이는 곳</th></tr>
    <tr><td>② 캐릭터 결정</td><td><code>ai_character.decide_character</code></td><td><code>responses.parse</code></td><td>①의 재료 전체(JSON)</td><td>카드의 이름·종족·속성·능력치·외형·메시지, ③의 외형 글</td></tr>
    <tr><td>③ 일러스트</td><td><code>illustration.generate_illustration</code></td><td><code>images.generate</code> / 포즈가 있으면 <code>images.edit</code></td><td>②의 글 + 얼굴 생김새 (+ 포즈 뼈대 PNG, 손 모양)</td><td>카드 그림(1024×1024, 정보 패널 위에 배치)</td></tr>
  </table></div>
</section>


<section id="decide">
  <h2><span class="step">②</span>캐릭터 결정과 글</h2>
  <dl class="facts">
    <div class="fact"><dt>언제</dt><dd>모든 참가자, 설문을 마치고 주문을 외운 뒤</dd></div>
    <div class="fact"><dt>모델</dt><dd><code>OPENAI_MODEL</code> (기본 <code>{e(ai_character.DEFAULT_MODEL)}</code>)</dd></div>
    <div class="fact"><dt>출력 형식</dt><dd><code>AiDecision</code> (구조화 출력)</dd></div>
    <div class="fact"><dt>제한</dt><dd>45초, 재시도 1회, 최대 8000토큰, <code>store=False</code></dd></div>
  </dl>
  {block("p-decide", "지시문 (instructions) — app/services/ai_character.py", ai_character.INSTRUCTIONS)}
  {block("p-decide-in", "입력 (input) 예시 — ①의 재료", decision_input, "JSON")}
  {block("p-decide-out", "출력 예시 — 실제 생성 결과", json.dumps(example_output, ensure_ascii=False, indent=2), "JSON")}
  <p>색감(<code>palette</code>)과 고유 능력(<code>ability</code>)은 룰이 정하고, GPT 결과는 룰이 고치지 않고 그대로 카드에 씁니다.</p>
</section>

<section id="image">
  <h2><span class="step">③</span>일러스트</h2>
  <dl class="facts">
    <div class="fact"><dt>언제</dt><dd>②가 끝나면 바로, 화면에 글 카드를 띄운 채로</dd></div>
    <div class="fact"><dt>모델</dt><dd><code>OPENAI_IMAGE_MODEL</code> (기본 <code>{e(illustration.DEFAULT_MODEL)}</code>)</dd></div>
    <div class="fact"><dt>설정</dt><dd>{e(illustration.SIZE)}, 품질 <code>OPENAI_IMAGE_QUALITY</code> (기본 {e(illustration.DEFAULT_QUALITY)}), PNG</dd></div>
    <div class="fact"><dt>제한</dt><dd>120초, 재시도 1회, 실패 시 "다시 그리기"</dd></div>
  </dl>
  <p>프롬프트는 고정 문장이 아니라 <code>build_prompt()</code>가 캐릭터마다 조립합니다. 유형별 첫 줄: {style_text}</p>
  {block("p-pose", "포즈 지시 (POSE_INSTRUCTIONS) — 뼈대 PNG가 있을 때만 붙음", illustration.POSE_INSTRUCTIONS)}
  {block("p-img-animal", "조립된 프롬프트 예시 — 실제 동물, 포즈 있음", prompt_pose)}
  {block("p-img-free", "조립된 프롬프트 예시 — 실제 동물, 포즈 없음", prompt_free)}
  {block("p-img-obj", "조립된 프롬프트 예시 — 오브젝트 헤드", prompt_nonhuman)}
  <div class="note">이미지 프롬프트에는 얼굴 수치가 들어가지 않습니다. 얼굴은 생김새 문구로만 전달됩니다.</div>
</section>


<section id="traits">
  <h2>얼굴 생김새 문구</h2>
  <p><code>FACE_TRAITS</code>. 얼굴 점수(0~1)가 0.5에서 {P.FACE_TRAIT_THRESHOLD} 이상 벗어난 항목을, 벗어난 정도 순으로 최소 {P.FACE_TRAIT_MIN}개 골라 문구로 바꿉니다. ②와 ③에 들어가며 좋고 나쁨을 평가하는 말은 쓰지 않습니다. 실제 동물 캐릭터에만 씁니다.</p>
  <div class="table"><table><tr><th>점수</th><th>0.5보다 낮을 때</th><th>0.5보다 높을 때</th></tr>{trait_rows}</table></div>
</section>

<section id="roles">
  <h2>무작위 재료 (동물·의상·이름 수식어)</h2>
  <p>아래 재료는 응답이나 얼굴로 정하지 않고 <b>참가자마다 매번 무작위로</b> 뽑아 ②에 보냅니다. 같은 사람이 다시 해도 다르게 나옵니다.</p>
  <h3>실제 동물 후보 (<code>ANIMAL_POOL</code>, {len(P.ANIMAL_POOL)}종 중 {P.ANIMAL_CANDIDATE_COUNT}개)</h3>
  <p class="meta">{e(" ".join(P.ANIMAL_POOL))}</p>
  <h3>의상 템플릿 (<code>outfit</code>, {len(P.OUTFITS)}종 중 1개)</h3>
  <div class="table"><table><tr><th>키</th><th>프롬프트에 들어가는 문장</th></tr>{rows([(f"<code>{e(k)}</code>", e(v)) for k, v in P.OUTFITS.items()])}</table></div>
  <h3>이름 수식어 (<code>name_hints</code>, {len(P.NAME_MODIFIERS)}개 중 {P.NAME_HINT_COUNT}개)</h3>
  <p>이름은 "수식어 + 종족"(예: 보송보송한 토끼) 형식이고, GPT가 이 중 하나를 그대로 수식어로 씁니다. 예시 입력: <code>{e(" · ".join(params.name_hints))}</code></p>
  <p class="meta">{e(" ".join(P.NAME_MODIFIERS))}</p>
</section>

<section id="models">
  <h2>모델과 환경변수</h2>
  <p>백엔드 폴더의 <code>.env</code>로 바꿉니다. 코드 기본값은 그대로 두고 <code>.env</code>만 고치면 됩니다.</p>
  <div class="table"><table>
    <tr><th>변수</th><th>쓰는 단계</th><th>기본값</th><th>테스트용 저렴한 설정</th></tr>
    <tr><td><code>OPENAI_MODEL</code></td><td>②</td><td><code>{e(ai_character.DEFAULT_MODEL)}</code></td><td><code>gpt-5.4-nano</code></td></tr>
    <tr><td><code>OPENAI_IMAGE_MODEL</code></td><td>③</td><td><code>{e(illustration.DEFAULT_MODEL)}</code></td><td><code>gpt-image-1-mini</code></td></tr>
    <tr><td><code>OPENAI_IMAGE_QUALITY</code></td><td>③</td><td><code>{e(illustration.DEFAULT_QUALITY)}</code></td><td><code>low</code></td></tr>
  </table></div>
  <p>잰 시간: ② 약 5~9초(저렴한 글 모델), ③ + 카드 합성 약 11초(저렴한 이미지 모델) ~ 15초(상위 이미지 모델). 자세한 내용은 저장소의 <code>docs/ai-models.md</code>에 있습니다.</p>
</section>
</main>
</div>

<script>
document.querySelectorAll(".copy").forEach((button) => {{
  button.addEventListener("click", async () => {{
    const pre = document.getElementById(button.dataset.target);
    try {{
      await navigator.clipboard.writeText(pre.textContent);
      button.textContent = "복사됨";
    }} catch {{
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "선택됨 · ⌘C";
    }}
    setTimeout(() => (button.textContent = "복사"), 1600);
  }});
}});
</script>
"""
os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
with open(args.out, "w", encoding="utf-8") as file:
    file.write(page)
print(f"{args.out} 저장 ({len(page):,}자, 예시: {example_path or '내장 예시'})")
