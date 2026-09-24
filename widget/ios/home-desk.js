// 우리집 데스크 — 홈화면 달력 위젯 (Scriptable)
//
// 설치
//   1. App Store 에서 Scriptable(무료) 설치
//   2. 데스크 설정 › 홈화면 위젯 › [아이폰 위젯 코드 복사]
//   3. Scriptable › 오른쪽 위 ＋ › 붙여넣기 › 위 제목을 「우리집 달력」으로 › 완료
//   4. 홈화면 길게 누르기 › 왼쪽 위 ＋ › Scriptable › 가장 큰 크기(large) › 위젯 추가
//   5. 추가된 위젯을 길게 누르기 › 위젯 편집 › Script: 「우리집 달력」
//
// 위젯을 누르면 데스크가 오늘 날짜 창을 연 채로 열린다(사파리).
// 주소를 새로 만들거나 폐기하면 이 위젯은 멈춘다 — 코드를 다시 복사해 붙여넣는다.
// 다크모드를 고정하려면 위젯 편집 › Parameter 에 dark 또는 light.

const WIDGET_URL = "__WIDGET_URL__";
const DESK_URL = "https://my-work-desk.vercel.app/";

// 위젯 크기(pt). 화면 폭별 애플 규격, 모르는 기종은 비율로 어림한다.
const SIZES = {
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
  const large = [Math.round(w * 0.866), Math.round(w * 0.906)];
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
  return Device.isUsingDarkAppearance();
}

function message(w, text) {
  const t = w.addText(text);
  t.font = Font.systemFont(14);
  t.textColor = Color.gray();
  t.centerAlignText();
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
