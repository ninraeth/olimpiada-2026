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

idx = html.find("590850824")
print("koszyk idx", idx)
if idx >= 0:
    print(repr(html[idx - 200 : idx + 250]))

# Extract docs-sheet-tab captions order
tabs = re.findall(
    r'docs-sheet-tab-caption[^>]*>([^<]+)<',
    html,
)
print("tabs", tabs)

# From bootstrap: items like [3,0,"590850824"
pairs = re.findall(r'\[(\d+),0,\\"(\d+)\\"', html)
print("escaped pairs", pairs[:20])
pairs2 = re.findall(r"\[(\d+),0,\"(\d+)\"", html)
print("pairs2", pairs2[:20])

# Try gids found as long numbers appearing only a few times
counts = {}
for n in re.findall(r"\b(\d{8,12})\b", html):
    counts[n] = counts.get(n, 0) + 1
rare = sorted([(c, n) for n, c in counts.items() if c <= 5], reverse=True)
print("rare long nums sample", rare[:40])

# Test rare candidates quickly
for _, gid in rare[:40]:
    url = f"https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={gid}"
    try:
        t = (
            urllib.request.urlopen(
                urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
                timeout=15,
            )
            .read()
            .decode("utf-8", "replace")
        )
        line0 = t.splitlines()[0][:80] if t.strip() else ""
        if line0 and not line0.startswith("<"):
            print("GID", gid, "=>", line0)
            if "Gracz 5" in t:
                for line in t.splitlines():
                    if "Gracz 5" in line:
                        print("  G5", line)
    except Exception:
        pass
