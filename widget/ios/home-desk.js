// 우리집 데스크 — 홈화면 달력 위젯 (Scriptable)
//
// 설치
//   1. App Store 에서 Scriptable(무료) 설치
//   2. 데스크 설정 › 홈화면 위젯 › [아이폰 위젯 코드 복사]
//   3. Scriptable › 오른쪽 위 ＋ › 붙여넣기 › 위 제목을 「우리집 달력」으로 › 완료
//   4. 홈화면 길게 누르기 › 왼쪽 위 ＋ › Scriptable › 가장 큰 크기(large) › 위젯 추가
//   5. 추가된 위젯을 길게 누르기 › 위젯 편집 › Script: 「우리집 달력」
//
// 날짜를 누르면 데스크가 그 날 창을 연 채로 열린다(사파리). ＋ 는 오늘로 일정 추가. 아래 목록은 오늘 일정이다.
// 주소를 새로 만들거나 폐기하면 이 위젯은 멈춘다 — 코드를 다시 복사해 붙여넣는다.
// 기본은 어두운 판. 밝게 하려면 위젯 편집 › Parameter 에 light (폰 설정을 따르려면 auto).

const WIDGET_URL = "__WIDGET_URL__";
const DESK_URL = "https://my-work-desk.vercel.app/";

// 위젯 크기(pt). 화면 폭별, 모르는 기종은 비율로 어림한다.
// 크기가 틀리면 iOS 가 그림 위아래(또는 좌우)를 잘라내고 누르는 칸도 어긋난다.
// 440x956(iPhone 17 Pro Max, iOS 26)은 실제 홈화면 스크린샷에서 잰 값 — large 가 거의 정사각형이다.
const SIZES = {
  "440x956": { small: [183, 183], medium: [389, 183], large: [389, 390] },
  "430x932": { small: [170, 170], medium: [364, 170], large: [364, 382] },
  "428x926": { small: [170, 170], medium: [364, 170], large: [364, 382] },
  "414x896": { small: [169, 169], medium: [360, 169], large: [360, 379] },
  "402x874": { small: [162, 162], medium: [348, 162], large: [348, 366] },
  "393x852": { small: [158, 158], medium: [338, 158], large: [338, 354] },
  "390x844": { small: [158, 158], medium: [338, 158], large: [338, 354] },
  "375x812": { small: [155, 155], medium: [329, 155], large: [329, 345] },
  "375x667": { small: [148, 148], medium: [321, 148], large: [321, 324] },
};

function widgetSize(family) {
  const s = Device.screenSize();
  const w = Math.min(s.width, s.height), h = Math.max(s.width, s.height);
  const known = SIZES[`${Math.round(w)}x${Math.round(h)}`];
  if (known && known[family]) return known[family];
  // iOS 26 의 large 는 화면 폭의 약 88%, 거의 정사각형이었다 (17 Pro Max 실측)
  const large = [Math.round(w * 0.884), Math.round(w * 0.886)];
  if (family === "medium") return [large[0], Math.round(w * 0.405)];
  if (family === "small") return [Math.round(w * 0.405), Math.round(w * 0.405)];
  return large;
}

function todayIso() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isDark() {
  const p = (args.widgetParameter || "").trim().toLowerCase();
  if (p === "dark") return true;
  if (p === "light") return false;
  if (p === "auto") return Device.isUsingDarkAppearance();
  // 기본은 어둡게 — 위젯 안에서는 Device.isUsingDarkAppearance() 가 다크모드여도 false 를 줄 때가 많다
  return true;
}

function message(w, text) {
  const t = w.addText(text);
  t.font = Font.systemFont(14);
  t.textColor = Color.gray();
  t.centerAlignText();
}

// 그림에서 달력 칸이 놓이는 자리(비율). 서버 pig-farm-log lib/widget-layout.ts LAYOUT 과 같은 숫자다.
const LAYOUT = { padX: 0.04, gridTop: 0.15, gridBottom: 0.62, addX0: 0.74, addX1: 0.86 };

// 이번 달 칸의 날짜들 (일요일 시작, 다음 달로만 찬 주는 없다 — 서버 monthGrid 와 같다)
function monthCells() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  const p = n => String(n).padStart(2, "0");
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(y, m, 1 - lead + i);
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out;
}

// 그림 위에 투명한 칸을 깐다. 날짜를 누르면 데스크가 그 날 창을 연 채로 열린다(사파리).
// 위젯 안에서 목록을 바꾸는 건 iOS 가 막는다 — 아래 목록은 늘 오늘이다.
function tapAreas(w, pw, ph) {
  w.spacing = 0;
  const today = `${DESK_URL}?d=${todayIso()}`;
  const block = (parent, width, height, url) => {
    const s = parent.addStack();
    s.size = new Size(width, height);
    s.url = url;
    s.addSpacer();
    return s;
  };
  // 제목 줄: 오늘 / ＋(그 날로 일정 추가 — 데스크 ?add=) / 오늘
  const head = w.addStack();
  head.size = new Size(pw, ph * LAYOUT.gridTop);
  head.layoutHorizontally();
  head.spacing = 0;
  block(head, pw * LAYOUT.addX0, ph * LAYOUT.gridTop, today);
  block(head, pw * (LAYOUT.addX1 - LAYOUT.addX0), ph * LAYOUT.gridTop, `${DESK_URL}?add=${todayIso()}`);
  block(head, pw * (1 - LAYOUT.addX1), ph * LAYOUT.gridTop, today);
  const cells = monthCells();
  const rows = cells.length / 7;
  const rowH = (ph * (LAYOUT.gridBottom - LAYOUT.gridTop)) / rows;
  const padX = pw * LAYOUT.padX;
  const cellW = (pw - padX * 2) / 7;
  for (let r = 0; r < rows; r++) {
    const row = w.addStack();
    row.size = new Size(pw, rowH);
    row.layoutHorizontally();
    row.spacing = 0;
    row.addSpacer(padX);
    for (let c = 0; c < 7; c++) block(row, cellW, rowH, `${DESK_URL}?d=${cells[r * 7 + c]}`);
    row.addSpacer(padX);
  }
  block(w, pw, ph * (1 - LAYOUT.gridBottom), today);
}

async function build() {
  const family = config.widgetFamily || "large";
  const [pw, ph] = widgetSize(family);
  const scale = Device.screenScale();
  const dark = isDark();

  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  w.backgroundColor = new Color(dark ? "#191d16" : "#ffffff");
  w.url = `${DESK_URL}?d=${todayIso()}`;
  // iOS 가 실제 갱신 시점을 정한다. 30분 뒤부터 다시 그려도 된다는 뜻일 뿐이다.
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  if (WIDGET_URL.indexOf("__WIDGET_") === 0) {
    message(w, "데스크 설정에서 [아이폰 위젯 코드 복사]로 다시 붙여넣어 주세요");
    return w;
  }

  const q = `w=${Math.round(pw * scale)}&h=${Math.round(ph * scale)}&theme=${dark ? "dark" : "light"}`;
  const req = new Request(`${WIDGET_URL}&${q}`);
  req.timeoutInterval = 20;
  try {
    const data = await req.load();
    const code = req.response && req.response.statusCode;
    if (code === 401) {
      message(w, "위젯 주소가 바뀌었어요\n데스크 설정에서 코드를 다시 복사해 주세요");
    } else if (code !== 200) {
      message(w, `달력을 못 불러왔어요 (${code})\n잠시 뒤 다시 그려집니다`);
    } else {
      w.backgroundImage = Image.fromData(data);
      // small 위젯은 칸별로 누를 수 없다(iOS) — 전체가 오늘로 열린다
      if (family !== "small") tapAreas(w, pw, ph);
    }
  } catch (e) {
    message(w, "인터넷 연결을 확인해 주세요\n잠시 뒤 다시 그려집니다");
  }
  return w;
}

const widget = await build();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
