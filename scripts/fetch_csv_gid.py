#!/usr/bin/env python3
import re
import urllib.request

ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU"
req = urllib.request.Request(
    f"https://docs.google.com/spreadsheets/d/{ID}/edit",
    headers={"User-Agent": "Mozilla/5.0"},
)
html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

# common patterns in Google Sheets edit page
patterns = [
    r'"name":"([^"]+)","sheetId":(\d+)',
    r'name\\":\\"([^\\]+)\\".{0,120}?sheetId\\":(\d+)',
    r'\["([^"]+)",\d+,\d+,\d+,"([^"]*)",(\d+)\]',
]
found = []
for p in patterns:
    found.extend(re.findall(p, html))
print("found patterns", found[:30])

# sheetId near Koszykówka
for m in re.finditer(r"Koszykówka|Koszykowka", html):
    start = max(0, m.start() - 100)
    end = min(len(html), m.end() + 100)
    print("ctx", html[start:end].replace("\n", " ")[:200])

# try gids 0..10 export
for gid in list(range(0, 12)) + [found and int(found[0][-1]) if found else None]:
    if gid is None:
        continue
    url = f"https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={gid}"
    try:
        data = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
            timeout=30,
        ).read()
        text = data.decode("utf-8", "replace")
        first = text.split("\n")[0][:80]
        has_s = bool(re.search(r"(?i)(^|,)\"?s\"?(,|$)", text, re.M))
        print(f"gid={gid} bytes={len(data)} has_s={has_s} first={first!r}")
        if "Próba" in text or "Proba" in text or "Gracz 5" in text:
            print("  --- sheet content sample ---")
            for i, line in enumerate(text.splitlines()[:8]):
                print(f"  {i}: {line[:160]}")
            # Gracz 5 line
            for line in text.splitlines():
                if "Gracz 5" in line:
                    print("  G5:", line)
    except Exception as e:
        print(f"gid={gid} ERR {e}")
