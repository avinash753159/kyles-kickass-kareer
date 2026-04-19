import fitz
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

doc = fitz.open("KyleGaarder_Resume_0426 (1).pdf")
page = doc[0]

# Extract fonts
print("=== FONTS ===")
for f in page.get_fonts(full=True):
    print(f"  xref={f[0]} name={f[3]} ext={f[4]} encoding={f[5]}")

# Extract text with full details
print("\n=== TEXT BLOCKS ===")
data = page.get_text("dict")
for block in data["blocks"]:
    if block["type"] != 0:
        continue
    for line in block["lines"]:
        for span in line["spans"]:
            text = span["text"].strip()
            if not text:
                continue
            bbox = span["bbox"]
            font = span["font"]
            size = span["size"]
            color = span["color"]
            flags = span["flags"]
            print(f"  [{bbox[0]:.1f},{bbox[1]:.1f},{bbox[2]:.1f},{bbox[3]:.1f}] font={font} size={size:.1f} color=#{color:06x} flags={flags} text='{text[:80]}'")

doc.close()
