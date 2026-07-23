#!/usr/bin/env python3
import io
import re
import urllib.request
import zipfile

ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU"
data = urllib.request.urlopen(
    urllib.request.Request(
        f"https://docs.google.com/spreadsheets/d/{ID}/export?format=xlsx",
        headers={"User-Agent": "Mozilla/5.0"},
    ),
    timeout=60,
).read()
z = zipfile.ZipFile(io.BytesIO(data))
wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
print("sheets:", re.findall(r'name="([^"]+)"', wb))
meta = z.read("xl/metadata")
gids = [g.decode() for g in re.findall(rb"[0-9]{8,12}", meta)]
print("gids from meta:", gids)
for g in gids:
    url = f"https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={g}"
    try:
        t = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
            timeout=25,
        ).read().decode("utf-8", "replace")
        first = t.splitlines()[0][:100] if t.strip() else "empty"
        print(g, "=>", first)
        if any(k in t for k in ("Karne", "1na1", "Luta", "ind", "Ind")):
            print("--- FULL (trimmed) ---")
            print("\n".join(t.splitlines()[:25]))
    except Exception as e:
        print(g, "fail", e)
