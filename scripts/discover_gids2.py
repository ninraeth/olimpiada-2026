#!/usr/bin/env python3
import re
import urllib.request

ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU"
html = urllib.request.urlopen(
    urllib.request.Request(
        f"https://docs.google.com/spreadsheets/d/{ID}/edit",
        headers={"User-Agent": "Mozilla/5.0"},
    ),
    timeout=60,
).read().decode("utf-8", "replace")

# [index,0,"gid",[{"1":[[0,0,"SheetName"]
pat = re.compile(
    r'\[(\d+),0,"(\d+)",\[\{"1":\[\[0,0,"((?:Info|Piłka Nożna|Siatkówka|Koszykówka|Badminton|Inne)[^"]*)"\]'
)
print("matches", pat.findall(html))

# broader: any gid + sheet name nearby
pat2 = re.compile(r'0,"(\d{5,12})",\[\{"1":\[\[0,0,"([^"]{1,40})"\]')
allm = pat2.findall(html)
print("allm sample", allm[:30])
for gid, name in allm:
    if any(
        k in name
        for k in ("Info", "Piłka", "Siatk", "Koszyk", "Badminton", "Inne", "Olimpiada")
    ):
        print(">>", name, gid)

# verify each gid
for gid, name in allm:
    if name not in (
        "Info",
        "Piłka Nożna",
        "Siatkówka",
        "Koszykówka",
        "Badminton",
        "Inne",
    ):
        continue
    url = f"https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={gid}"
    try:
        t = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
            timeout=30,
        ).read().decode("utf-8", "replace")
        first = t.splitlines()[0][:60] if t else ""
        print(f"OK {name} gid={gid} lines={len(t.splitlines())} first={first!r}")
    except Exception as e:
        print(f"FAIL {name} gid={gid} {e}")
