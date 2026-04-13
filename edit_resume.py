#!/usr/bin/env python3
"""
Surgically edit Kyle's resume PDF using redaction API.
Preserves all fonts, icons, bullet dots, dividers, colors, spacing.
Uses apply_redactions() to properly remove old text from the content stream.
"""
import fitz
import sys

sys.stdout.reconfigure(encoding='utf-8')

INPUT  = "KyleGaarder_Resume_0426 (1).pdf"
OUTPUT = "KyleGaarder_Resume_Tailored_Kindred.pdf"

doc = fitz.open(INPUT)
page = doc[0]

# ── Extract embedded fonts ──────────────────────────────────────────────
font_map = {}
for f in page.get_fonts(full=True):
    xref, name = f[0], f[3]
    try:
        fd = doc.extract_font(xref)
        if fd and fd[3]:
            font_map[name] = fitz.Font(fontbuffer=fd[3])
            print(f"  Font OK: {name}")
    except Exception as e:
        print(f"  Font FAIL: {name}: {e}")

inter_reg  = font_map["AAAAAA+Inter-Regular"]
rubik_med  = font_map["BAAAAA+Rubik-Medium"]
inter_bold = font_map["CAAAAA+Inter-Bold"]

# ── Colors ──────────────────────────────────────────────────────────────
BLACK     = (0, 0, 0)
BLUE      = (0, 0x8c/255, 1.0)           # #008cff
DARK_GRAY = (0x3e/255, 0x3e/255, 0x3e/255)  # #3e3e3e
WHITE     = (1, 1, 1)

# ── Word-wrap helper ────────────────────────────────────────────────────
def tw_wrap(tw, x, y, max_w, text, font, size, lh):
    """Append word-wrapped text to a TextWriter. Returns y after last line."""
    words, line, cy = text.split(' '), '', y
    for w in words:
        test = f"{line} {w}".strip()
        if font.text_length(test, fontsize=size) > max_w and line:
            tw.append((x, cy), line, font=font, fontsize=size)
            cy += lh
            line = w
        else:
            line = test
    if line:
        tw.append((x, cy), line, font=font, fontsize=size)
        cy += lh
    return cy

def count_lines(max_w, text, font, size):
    """Count how many wrapped lines a text would need."""
    words, line, n = text.split(' '), '', 0
    for w in words:
        test = f"{line} {w}".strip()
        if font.text_length(test, fontsize=size) > max_w and line:
            n += 1; line = w
        else:
            line = test
    if line: n += 1
    return n


# ═══════════════════════════════════════════════════════════════════════
# STEP 1: REDACT (properly remove old content from the stream)
# ═══════════════════════════════════════════════════════════════════════

# Subtitle line (preserve name above and contact line below)
page.add_redact_annot(fitz.Rect(48.8, 68.0, 370, 86.0), fill=WHITE)

# Summary text block
page.add_redact_annot(fitz.Rect(48.8, 141.0, 335, 228.0), fill=WHITE)

# Revillage bullet TEXT only (x>=56.5 preserves bullet dots at x=51.4-56.0)
page.add_redact_annot(fitz.Rect(56.5, 308.0, 335, 474.0), fill=WHITE)

# Van Village bullet TEXT only
page.add_redact_annot(fitz.Rect(56.5, 523.0, 335, 608.0), fill=WHITE)

# Achievement TITLES + DESCRIPTIONS (x>=386 preserves diamond icons at x=363-377)
page.add_redact_annot(fitz.Rect(386.0, 141.0, 555, 403.0), fill=WHITE)

# Skills text
page.add_redact_annot(fitz.Rect(366.0, 444.0, 555, 635.0), fill=WHITE)

# Apply redactions: remove text only, keep graphics (dividers) and images
page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=0)
print("  Redactions applied")


# ═══════════════════════════════════════════════════════════════════════
# STEP 2: WRITE NEW TEXT
# ═══════════════════════════════════════════════════════════════════════

LH   = 10.15   # line height
BX   = 60.5    # bullet text x
BW   = 260     # bullet text max width (60.5 to ~320)
AX   = 386.3   # achievement text x
AW   = 162     # achievement text max width

# ── Subtitle (BLUE) ────────────────────────────────────────────────────
tw_sub = fitz.TextWriter(page.rect)
tw_sub.append((48.8, 82.0),
    "GTM Leader | New Products | Community & Network Growth",
    font=rubik_med, fontsize=12.1)
tw_sub.write_text(page, color=BLUE)

# ── Summary (DARK GRAY) ────────────────────────────────────────────────
tw_body = fitz.TextWriter(page.rect)

summary = (
    "GTM operator and product builder with a track record of 0-1 "
    "product launches and community-driven network growth. I build "
    "trust-based networks from scratch - designing activation systems, "
    "member referral loops, and programs that convert engagement into "
    "durable retention. My background spans marketplace GTM, coliving, "
    "and market creation. I thrive in ambiguous environments, run rapid "
    "experiments across teams, and turn ambitious product bets into "
    "scalable real-world growth systems."
)
tw_wrap(tw_body, 48.8, 153.5, 280, summary, inter_reg, 8.2, LH)

# ── Revillage bullets (DARK GRAY) ──────────────────────────────────────
# Slot sizes: bullets 1-4 = 2 lines each, bullets 5-6 = 3 lines each, bullet 7 = 2 lines
# Y positions from original bullet dots
rv_y = [309.8, 330.1, 350.4, 370.7, 391.0, 421.4, 451.9]
rv = [
    # Bullet 1 (2-line slot)
    "Launched an 8-bedroom coliving property in 2 weeks, reaching "
    "100% occupancy before lease start",
    # Bullet 2 (2-line slot)
    "Designed onboarding, activation, and community loop systems "
    "driving 94% occupancy for 19 consecutive months",
    # Bullet 3 (2-line slot)
    "Built and tested member referral and ambassador programs - "
    "community-led acquisition became primary growth channel",
    # Bullet 4 (2-line slot)
    "Ran 48 community dinners, 4 mastermind cohorts, and 6 "
    "work-trade programs, building engagement and retention",
    # Bullet 5 (3-line slot)
    "Executed A/B testing on dynamic pricing and stay-length "
    "diversification, generating a 48% annual revenue lift at "
    "94% occupancy",
    # Bullet 6 (3-line slot)
    "Directed full-cycle operations, improving efficiency 212% "
    "YoY. Facilitated smooth acquisition transition to Macro House",
    # Bullet 7 (2-line slot)
    "Built member insights engine via interviews and events, "
    "synthesizing patterns into GTM and product recommendations",
]

for i, bt in enumerate(rv):
    n = count_lines(BW, bt, inter_reg, 8.2)
    print(f"  Revillage bullet {i+1}: {n} lines, {len(bt)} chars")
    tw_wrap(tw_body, BX, rv_y[i], BW, bt, inter_reg, 8.2, LH)

# ── Van Village bullets (DARK GRAY) ────────────────────────────────────
vv_y = [524.8, 545.1, 565.4, 585.7]
vv = [
    "Built demand pipeline of 3,140 subscribers through grassroots "
    "community outreach and concept validation",
    "Ran 48 structured customer discovery interviews guiding GTM "
    "positioning and go-to-market sequencing",
    "Explored partnerships across 5 states and personally secured "
    "an investor-backed pilot program",
    "Led cross-functional execution across strategy, ops, brand, "
    "and product in a pre-launch startup environment",
]

for i, bt in enumerate(vv):
    n = count_lines(BW, bt, inter_reg, 8.2)
    print(f"  Van Village bullet {i+1}: {n} lines, {len(bt)} chars")
    tw_wrap(tw_body, BX, vv_y[i], BW, bt, inter_reg, 8.2, LH)

# ── Achievement descriptions (DARK GRAY) ──────────────────────────────
ach_desc = [
    (168.8, "Build end-to-end GTM motions for trust-based networks "
            "- activation loops, referral programs, community nurture"),
    (216.3, "A/B tested pricing and engagement programs, drove 48% "
            "annual revenue growth at sustained occupancy"),
    (274.1, "Launched and filled 8-bed network in 2 weeks, sustained "
            "94% occupancy for 19 months"),
    (331.8, "Sourced and secured an investor-backed pilot for a new "
            "community network concept across 5 states"),
    (379.4, "Built early demand pipeline of 3,140 subscribers through "
            "concept validation and outreach"),
]
for ay, at in ach_desc:
    n = count_lines(AW, at, inter_reg, 8.2)
    print(f"  Achievement desc: {n} lines")
    tw_wrap(tw_body, AX, ay, AW, at, inter_reg, 8.2, LH)

# ── Skills (DARK GRAY, Inter-Bold) ─────────────────────────────────────
skills = [
    (448.1, "GTM Strategy & Launch",     None),
    (472.8, "Community-Led Growth",      None),
    (497.6, "Cross-Functional Execution",None),
    (522.3, "Channel Experimentation",   None),
    (547.1, "Member Activation",         "Onboarding"),
    (571.8, "Lifecycle & Nurture",       "Programs"),
    (596.5, "Partnerships",              "Market Creation"),
]
for sy, s1, s2 in skills:
    tw_body.append((366.6, sy), s1, font=inter_bold, fontsize=8.9)
    if s2:
        w1 = inter_bold.text_length(s1, fontsize=8.9)
        tw_body.append((366.6 + w1 + 18, sy), s2,
                       font=inter_bold, fontsize=8.9)

tw_body.write_text(page, color=DARK_GRAY)

# ── Achievement titles (BLACK, Inter-Bold) ─────────────────────────────
tw_titles = fitz.TextWriter(page.rect)
ach_titles = [
    (155.0, "Circles GTM Launch - DRI Ready"),
    (203.0, "48% Revenue Lift via Experimentation"),
    (261.0, "Rapid Network Launch"),
    (318.5, "Investor Pilot Secured"),
    (366.0, "Demand Pipeline Built"),
]
for ay, at in ach_titles:
    tw_titles.append((AX, ay), at, font=inter_bold, fontsize=9.5)
tw_titles.write_text(page, color=BLACK)


# ═══════════════════════════════════════════════════════════════════════
# STEP 3: SAVE
# ═══════════════════════════════════════════════════════════════════════
doc.save(OUTPUT, garbage=3, deflate=True, clean=True)
doc.close()
print(f"\n  Done! -> {OUTPUT}")
