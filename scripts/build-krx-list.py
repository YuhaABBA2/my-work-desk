# KRX KIND 상장법인 목록 → krx-list.json ([["회사명","종목코드","KS|KQ"], …])
# 실행: python scripts/build-krx-list.py  (분기마다 한 번쯤. 신규 상장·상장폐지 반영)
import html, json, re, urllib.request
URL = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&marketType={}"
out = []
for mkt, suffix in (("stockMkt", "KS"), ("kosdaqMkt", "KQ")):
    req = urllib.request.Request(URL.format(mkt), headers={"User-Agent": "Mozilla/5.0"})
    s = urllib.request.urlopen(req, timeout=60).read().decode("cp949", "ignore")
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", s, re.S)[1:]:
        c = [html.unescape(re.sub("<[^>]+>", "", x)).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(c) >= 3 and re.fullmatch(r"[0-9A-Z]{6}", c[2]):
            out.append([c[0], c[2], suffix])
json.dump(out, open("krx-list.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "rows")
