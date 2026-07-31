#!/usr/bin/env python3
"""Doctrine reconcile — keep "same brain, two bodies" in sync.

MGSF's locked numbers live in TWO places that don't auto-share:
  1. the mgsf-core Agent Skill (SKILL.md) — the source of truth for Claude AI skills
  2. the DOCTRINE block inside Klyfton's api/klyfton.js (const DOCTRINE = `...`)
Change one and the other silently drifts, and two systems quote different numbers.
This tool extracts the locked constants from both and diffs them.

It ONLY reads the authoritative regions — core's whole SKILL.md and klyfton's
DOCTRINE template literal — so it can't grab an unrelated number from elsewhere in
the 900-line app file (e.g. the product-line GM targets that live in a different
block). Patterns are case-insensitive and anchored so wording differences
("Open-cell" vs "OC", "JOB MINIMUM" vs "Job minimum") don't create false drift.

Usage (from field-os repo root):
  python3 tools/doctrine_reconcile.py
  python3 tools/doctrine_reconcile.py --core /path/to/mgsf-core/SKILL.md --klyfton api/klyfton.js

Exit 0 = every checked constant matches. Exit 1 = a real mismatch or a value present
in one body but not the other. Exit 2 = a file/parse problem. It never edits —
mgsf-core is the source of truth; a human reconciles flagged items.

KNOWN drift (documented in klyfton.js itself): soil-stab status — klyfton has it
OFFERED (owner-activated), core still says BLOCKED. The tool flags it on purpose so
it stays visible until Clifton updates mgsf-core.
"""
import os
import re
import sys

CORE_DEFAULT = "/root/.claude/skills/mgsf-core/SKILL.md"

# (label, regex). group(1) = the value. Applied case-insensitively to BOTH the core
# text and the extracted klyfton DOCTRINE block. Decimals use \d+\.\d+ so a trailing
# sentence period can't be captured (the "1.12." bug). Tolerant of the two wordings.
CHECKS = [
    ("open-cell $/BF",        r"(?:open[- ]?cell(?:\s*foam)?|\bOC\b)[^$\n]{0,20}\$(\d+\.\d+)\s*/BF"),
    ("closed-cell 2.8# $/BF", r"2\.8#?[^$\n]{0,24}\$(\d+\.\d+)\s*/BF"),
    ("SPF roofing 3.0# $/BF", r"3\.0#?[^$\n]{0,24}\$(\d+\.\d+)\s*/BF"),
    ("labor installer $/hr",  r"installer\s*\$(\d+)\s*/?\s*hr"),
    ("labor helper $/hr",     r"helper\s*\$(\d+)\s*/?\s*hr"),
    ("concrete lifting $/lb", r"concrete lifting[^$\n]{0,6}\$(\d+\.\d+)\s*/lb"),
    ("void fill $/lb",        r"void fill[^$\n]{0,6}\$(\d+\.\d+)\s*/lb"),
    ("polyurea $/SF",         r"polyurea[^$\n]{0,6}\$(\d+\.\d+)\s*/SF"),
    ("coating silicone $/SF", r"\$(\d+\.\d+)\s*/SF silicone"),
    ("coating acrylic $/SF",  r"\$(\d+\.\d+)\s*/SF acrylic"),
    ("GM residential %",      r"residential\s*(\d+)\s*%"),
    ("GM commercial %",       r"commercial\s*(\d+)\s*%"),
    ("GM industrial %",       r"industrial\s*(\d+)\s*%"),
    ("GM government %",       r"government\s*(\d+)\s*%"),
    ("multiplier MT",         r"MT\s*[×x]\s*(\d+\.\d+)"),
    ("multiplier ND",         r"ND\s*[×x]\s*(\d+\.\d+)"),
    ("multiplier SD",         r"SD\s*[×x]\s*(\d+\.\d+)"),
    ("multiplier WY",         r"WY\s*[×x]\s*(\d+\.\d+)"),
    ("job minimum $",         r"job min(?:imum)?[^$0-9\n]{0,10}\$?(\d[\d,]*)"),
    # mobilization tiers — api/geo.js hardcodes these, so drift between mgsf-core and the
    # DOCTRINE block must be caught. Each value sits on one line (50+ wraps in DOCTRINE but
    # its own line is intact). "25–50" may use an en/em dash or hyphen.
    ("mobilization <25mi $",  r"<\s*25\s*mi[^$\n]{0,4}\$(\d+)"),
    ("mobilization 25-50mi $", r"25\s*[–—-]\s*50\s*mi[^$\n]{0,4}\$(\d+)"),
    ("mobilization 50+mi $",  r"50\+\s*mi[^$\n]{0,4}\$(\d+)"),
    ("mobilization $/mi>100", r"\$(\d+\.\d+)\s*/\s*mi"),
    # [\s\S] (not [^\n]) so a line-wrapped "= \nOFFERED" is still captured.
    ("soil-stab status",      r"soil stab[a-z]*[\s\S]{0,40}?(BLOCKED|OFFERED|PENDING)"),
]

# soil-stab is a known, in-code-documented drift — annotate it so a red row here is
# understood, not alarming, until Clifton reconciles mgsf-core.
KNOWN = {"soil-stab status": "known: klyfton OFFERED (owner-activated) vs core BLOCKED — update mgsf-core"}


def grab(text, rx):
    m = re.search(rx, text, re.I)
    if not m:
        return None
    v = m.group(1).strip()
    # status tokens (BLOCKED/OFFERED/PENDING) — normalize case so "blocked" == "BLOCKED".
    return v.upper() if v.upper() in ("BLOCKED", "OFFERED", "PENDING") else v


def extract_doctrine(js_text):
    """Return just the DOCTRINE template literal from klyfton.js, or None."""
    m = re.search(r"const\s+DOCTRINE\s*=\s*`(.*?)`", js_text, re.S)
    return m.group(1) if m else None


def main():
    args = sys.argv[1:]
    core = CORE_DEFAULT
    here = os.path.dirname(os.path.abspath(__file__))
    kly = os.path.join(os.path.dirname(here), "api", "klyfton.js")
    if "--core" in args:
        core = args[args.index("--core") + 1]
    if "--klyfton" in args:
        kly = args[args.index("--klyfton") + 1]

    if not os.path.isfile(kly):
        print("ERROR: klyfton.js not found: %s" % kly, file=sys.stderr); return 2
    kt_full = open(kly, encoding="utf-8", errors="replace").read()
    kt = extract_doctrine(kt_full)
    if kt is None:
        print("ERROR: could not find `const DOCTRINE = ` block in %s" % kly, file=sys.stderr)
        return 2
    if not os.path.isfile(core):
        print("NOTE: mgsf-core SKILL.md not found at %s — can't reconcile." % core, file=sys.stderr)
        print("      Pass --core <path> (the skill isn't in this repo).", file=sys.stderr)
        return 2
    ct = open(core, encoding="utf-8", errors="replace").read()

    rows, mism, only = [], 0, 0
    for label, rx in CHECKS:
        cv, kv = grab(ct, rx), grab(kt, rx)
        note = KNOWN.get(label, "")
        if cv is None and kv is None:
            status = "— (absent both)"
        elif cv == kv:
            status = "ok"
        elif cv is None or kv is None:
            status = "ONLY-ONE"; only += 1
        else:
            status = "MISMATCH"; mism += 1
        rows.append((label, cv, kv, status, note))

    print("MGSF doctrine reconcile — mgsf-core  vs  klyfton.js DOCTRINE block")
    print("=" * 72)
    print("%-22s %-11s %-11s %s" % ("constant", "mgsf-core", "klyfton", "status"))
    print("-" * 72)
    for label, cv, kv, status, note in rows:
        tail = ""
        if status not in ("ok", "— (absent both)"):
            tail = "  <<< " + status + (("  (%s)" % note) if note else "")
        print("%-22s %-11s %-11s %s%s" % (label, cv or "-", kv or "-", status, tail))
    print("-" * 72)
    problems = mism + only
    if problems:
        known_ct = sum(1 for _, _, _, s, n in rows if s not in ("ok", "— (absent both)") and n)
        print("✗ %d issue(s): %d mismatch, %d present-in-only-one (%d known/documented)."
              % (problems, mism, only, known_ct))
        print("  mgsf-core wins — reconcile the unexpected ones; the known one tracks an owner to-do.")
    else:
        print("✓ in sync — every checked constant matches.")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
