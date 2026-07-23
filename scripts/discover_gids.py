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

# Pattern from earlier ctx: [3,0,"590850824",[{"1":[[0,0,"Koszykówka"]
for m in re.finditer(
    r'\[(\d+),0,"(\d+)",\[\{"1":\[\[0,0,"([^"]+)"\]',
    html,
):
    print("pattern1", m.groups())

for m in re.finditer(r'"(\d{6,10})".{0,40}?"(Info|Piłka|Siatk|Koszyk|Badminton|Inne)', html):
    print("pattern2", m.groups())

for m in re.finditer(r'(Info|Piłka Nożna|Siatkówka|Koszykówka|Badminton|Inne).{0,80}?(\d{6,12})', html):
    print("pattern3", m.group(1), m.group(2))

# dump all long numeric ids near sheet names
for name in ["Info", "Piłka Nożna", "Siatkówka", "Koszykówka", "Badminton", "Inne"]:
    idx = html.find(name)
    if idx < 0:
        print(name, "not found")
        continue
    window = html[max(0, idx - 200) : idx + 200]
    nums = re.findall(r"\d{6,12}", window)
    print(name, "nearby nums", nums[:10])
    print("  window", window.replace("\n", " ")[:180])
