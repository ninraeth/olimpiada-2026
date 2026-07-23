#!/usr/bin/env python3
"""Download live xlsx and inspect Koszykówka cell H9."""
import io
import re
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

ID = "18Frm47PTR0FCaZs4QoELydkQNmLQWmvU"
URL = f"https://docs.google.com/spreadsheets/d/{ID}/export?format=xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=60).read()
    print("downloaded bytes", len(data))
    z = zipfile.ZipFile(io.BytesIO(data))

    wb = z.read("xl/workbook.xml").decode("utf-8", errors="replace")
    names = re.findall(r'name="([^"]+)"', wb)
    print("sheets:", names)

    # sheet id map
    sheets = re.findall(
        r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"',
        wb,
    )
    print("sheet r:ids", sheets)

    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", errors="replace")
    rid_to_target = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    print("rels", rid_to_target)

    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            texts = [
                t.text or ""
                for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
            ]
            ss.append("".join(texts))
        interesting = [(i, s) for i, s in enumerate(ss) if s and len(s) <= 5]
        print("short shared strings:", interesting)
        s_hits = [(i, s) for i, s in enumerate(ss) if s.strip().lower() == "s"]
        print("exact S strings:", s_hits)

    for name, rid in sheets:
        target = rid_to_target.get(rid, "")
        path = "xl/" + target.lstrip("/")
        if path not in z.namelist():
            path = "xl/worksheets/" + target.split("/")[-1]
        if path not in z.namelist():
            print("missing", name, rid, target)
            continue
        xml = z.read(path).decode("utf-8", errors="replace")
        print("\n===", name, path, "len", len(xml))
        # H9
        m = re.search(r'<c r="H9"[^/]*/>|<c r="H9"[^>]*>.*?</c>', xml)
        print("H9 raw:", m.group(0) if m else "NOT PRESENT")
        # all H column cells
        hs = re.findall(r'<c r="H(\d+)"([^>]*)>(?:<v>([^<]*)</v>)?', xml)
        print("H cells count", len(hs))
        for row, attrs, v in sorted(hs, key=lambda x: int(x[0]))[:20]:
            t = "s" if 't="s"' in attrs else ("inline" if 't="inlineStr"' in attrs else "n")
            val = v
            if t == "s" and v is not None and v.isdigit():
                val = ss[int(v)] if int(v) < len(ss) else v
            print(f"  H{row}: type={t} v={v!r} resolved={val!r} attrs={attrs[:80]}")

        # any cell with shared string index pointing to S
        if s_hits:
            idxs = {str(i) for i, _ in s_hits}
            for cm in re.finditer(r'<c r="([A-Z]+)(\d+)"[^>]*t="s"[^>]*>\s*<v>(\d+)</v>', xml):
                if cm.group(3) in idxs:
                    print("S found at", cm.group(1) + cm.group(2), "sst", cm.group(3))


if __name__ == "__main__":
    main()
