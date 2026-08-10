#!/usr/bin/env python3
"""Doctrine reconcile — keep "same brain, N bodies" in sync.

MGSF's locked numbers live in THREE places that don't auto-share:
  1. the mgsf-core Agent Skill (SKILL.md) — the source of truth for Claude AI skills
  2. the DOCTRINE block inside Klyfton's api/klyfton.js (const DOCTRINE = `...`)
  3. the seed tables inside public/estimator.html — FOAM_SEED, COAT_SEED, GEO_SEED,
     GUARD_BF, GUARD_ROOF, STATE_MULT. This is the body that actually prices jobs
     in the browser, and until 2026-08-05 nothing watched it at all.
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
  python3 tools/doctrine_reconcile.py --estimator public/estimator.html
                                      --constants /path/to/mgsf-core/reference/constants.json

BODY 3 (estimator.html) is diffed against constants.json rather than SKILL.md prose,
because yields and set prices are structured data — regexing them out of prose is how
a roofing yield ends up applied to closed-cell foam. If constants.json is not found the
section is skipped with a NOTE and the exit code is unaffected; the original two-body
check runs exactly as before.

Exit 0 = every checked constant matches. Exit 1 = a real mismatch or a value present
in one body but not the other. Exit 2 = a file/parse problem. It never edits —
mgsf-core is the source of truth; a human reconciles flagged items.

As of 2026-07-31 mgsf-core and the DOCTRINE block are reconciled (soil-stab = OFFERED,
owner-activated, pricing PENDING in both), so every checked constant should read "ok".
A soil-stab MISMATCH now is a real regression, not expected drift — fix it, don't ignore it.
"""
import json
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

# No expected drift: mgsf-core and the DOCTRINE block are reconciled (soil-stab OFFERED
# in both as of 2026-07-31). Any MISMATCH here is a real regression to fix, not noise.
KNOWN = {}


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


# ============================================================================
# BODY 3 — public/estimator.html seed tables
# ============================================================================
# The browser estimator carries its own copies of every price, yield and guardrail
# band. They are JSON, so they are PARSED, not regexed — a yield is structured data
# and pulling it out of prose is exactly how a roofing yield (2,900) ended up
# reproducing the phantom $0.982/BF closed-cell rate.
#
# Source of truth for this section is constants.json, not SKILL.md, for the same
# reason. Measured yields beat published ones; constants.json records which is which.

def extract_js_literal(text, name):
    """Return the JS array/object literal assigned to `name`, parsed as JSON.

    Handles `const NAME=[...]` and `const NAME={...}` and tolerates unquoted object
    keys and single quotes (GUARD_BF / GUARD_ROOF / STATE_MULT are written that way).
    Returns None if absent or unparseable — never raises.
    """
    m = re.search(r"const\s+" + re.escape(name) + r"\s*=\s*([\[{])", text)
    if not m:
        return None
    open_ch = m.group(1)
    close_ch = "]" if open_ch == "[" else "}"
    i = m.end() - 1
    depth, in_str, quote, esc = 0, False, "", False
    for j in range(i, len(text)):
        c = text[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                in_str = False
            continue
        if c in "\"'":
            in_str, quote = True, c
        elif c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                raw = text[i:j + 1]
                break
    else:
        return None
    # JS -> JSON: single-quoted strings, unquoted keys, trailing commas.
    raw = re.sub(r"'([^'\\]*)'", r'"\1"', raw)
    raw = re.sub(r"([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:", r'\1"\2":', raw)
    raw = re.sub(r",(\s*[}\]])", r"\1", raw)
    try:
        return json.loads(raw)
    except Exception:
        return None


# Which measured/catalog yield each FOAM_SEED category must carry, and where it
# comes from in constants.json. Money impact is printed for every mismatch so a
# drift is never just a red row — it is a dollar figure.
SEED_YIELD_RULES = [
    ("Closed Cell", ("yield", "measured_actual", "closed_cell_bf_per_set"), "measured"),
    ("Roofing",     ("yield", "measured_actual", "roofing_bf_per_set"),     "measured"),
]
# Open cell has no measured figure (zero MGSF job history) — the catalog number is
# asserted directly so a silent edit still trips the check.
OPEN_CELL_CATALOG_BF = 14000


def dig(d, path):
    for k in path:
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def check_estimator(est_path, const_path):
    """Diff estimator.html seed tables against constants.json.

    Returns (rows, problems, notes). rows are (label, expected, actual, status, note).
    """
    rows, notes = [], []
    if not os.path.isfile(est_path):
        return None, 0, ["estimator.html not found at %s — BODY 3 skipped." % est_path]
    if not os.path.isfile(const_path):
        return None, 0, ["constants.json not found at %s — BODY 3 skipped." % const_path]
    et = open(est_path, encoding="utf-8", errors="replace").read()
    try:
        C = json.load(open(const_path, encoding="utf-8"))
    except Exception as e:
        return None, 0, ["constants.json is not valid JSON (%s) — BODY 3 skipped." % e]

    def row(label, exp, act, note=""):
        if exp is None and act is None:
            st = "— (absent both)"
        elif act is None:
            st = "ONLY-ONE"
        elif str(exp) == str(act):
            st = "ok"
        else:
            st = "MISMATCH"
        rows.append((label, exp, act, st, note))
        return st

    # ---- state multipliers -------------------------------------------------
    sm = extract_js_literal(et, "STATE_MULT")
    for st_code, want in sorted((C.get("state_multipliers") or {}).items()):
        got = sm.get(st_code) if isinstance(sm, dict) else None
        row("STATE_MULT %s" % st_code,
            "%.2f" % want, ("%.2f" % got) if isinstance(got, (int, float)) else None)

    # ---- guardrail bands ---------------------------------------------------
    gbf = extract_js_literal(et, "GUARD_BF")
    if isinstance(gbf, dict):
        for band, pair in sorted(gbf.items()):
            ok = (isinstance(pair, list) and len(pair) == 2
                  and all(isinstance(x, (int, float)) for x in pair) and pair[0] <= pair[1])
            rows.append(("GUARD_BF %s" % band, "min<=max", "%s" % pair,
                         "ok" if ok else "MISMATCH",
                         "" if ok else "band is inverted or malformed"))
    else:
        rows.append(("GUARD_BF", "present", None, "ONLY-ONE", "not found in estimator.html"))
    groof = extract_js_literal(et, "GUARD_ROOF")
    if isinstance(groof, dict):
        bad = [k for k, v in groof.items()
               if not (isinstance(v, list) and len(v) == 2 and v[0] <= v[1])]
        rows.append(("GUARD_ROOF (%d bands)" % len(groof), "all min<=max",
                     "bad: %s" % bad if bad else "all ok",
                     "MISMATCH" if bad else "ok", ""))
    else:
        rows.append(("GUARD_ROOF", "present", None, "ONLY-ONE", "not found in estimator.html"))

    # ---- FOAM_SEED yields --------------------------------------------------
    foam = extract_js_literal(et, "FOAM_SEED")
    if not isinstance(foam, list):
        rows.append(("FOAM_SEED", "parseable", None, "ONLY-ONE",
                     "could not parse — every foam yield below is UNCHECKED"))
        foam = []

    def money_note(set_price, want_bf, got_bf, ref_bf=15000):
        """What the yield drift costs on a reference job, in plain dollars."""
        if not (set_price and want_bf and got_bf) or want_bf == got_bf:
            return ""
        right = set_price / float(want_bf) * ref_bf
        wrong = set_price / float(got_bf) * ref_bf
        d = wrong - right
        return "{:+,.0f} material on a {:,} BF job".format(d, ref_bf)

    def density_class(f, marker):
        """True when a product name carries the given density marker (2.0#, 1.7#)."""
        n = f.get("n", "")
        return marker in n or marker.replace(".0", "") in n

    for cat, path, kind in SEED_YIELD_RULES:
        want = dig(C, path)
        members = [f for f in foam if f.get("cat") == cat]
        if cat == "Closed Cell":
            # The measured 4,200 is a 2.0# number. 1.7# InsulStar is a different
            # foam and a different yield -- holding it to 4,200 is a false alarm.
            main = [f for f in members if not density_class(f, "1.7#")]
            alt = [f for f in members if density_class(f, "1.7#")]
            seen_m = sorted({f.get("yieldBF") for f in main})
            got_m = seen_m[0] if len(seen_m) == 1 else "mixed %s" % seen_m
            note = "measured 2.0# yield; %d product(s)" % len(main)
            if len(seen_m) == 1 and want and seen_m[0] != want:
                note = money_note(max(f.get("set", 0) for f in main), want, seen_m[0]) or note
            row("FOAM_SEED CC 2.0# yield", want, got_m, note)
            if alt:
                seen_a = sorted({f.get("yieldBF") for f in alt})
                rows.append(("FOAM_SEED CC 1.7# yield", "no measured figure",
                             seen_a[0] if len(seen_a) == 1 else "mixed %s" % seen_a, "ok",
                             "ESTIMATED -- 1.7# has never been measured on an MGSF job"))
            continue
        if not members:
            rows.append(("FOAM_SEED %s yield" % cat, want, None, "ONLY-ONE",
                         "no %s products in FOAM_SEED" % cat))
            continue
        seen = sorted({f.get("yieldBF") for f in members})
        got = seen[0] if len(seen) == 1 else "mixed %s" % seen
        note = "%s yield; %d product(s)" % (kind, len(members))
        if len(seen) == 1 and want and seen[0] != want:
            note = money_note(members[0].get("set"), want, seen[0]) or note
        row("FOAM_SEED %s yield" % cat, want, got, note)

    oc = [f for f in foam if f.get("cat") == "Open Cell"]
    if oc:
        seen = sorted({f.get("yieldBF") for f in oc})
        # 0.5# open cell is the catalog 14,000; a 1.0# hybrid is legitimately lower,
        # so only the 0.5#-class members are held to the catalog figure.
        half = [f for f in oc if "1#" not in f.get("n", "") and "1.0" not in f.get("n", "")]
        hseen = sorted({f.get("yieldBF") for f in half})
        row("FOAM_SEED Open Cell yield", OPEN_CELL_CATALOG_BF,
            hseen[0] if len(hseen) == 1 else "mixed %s" % hseen,
            "catalog figure — MGSF has zero open-cell job history")
        if len(seen) > 1:
            rows.append(("FOAM_SEED Open Cell spread", "informational", "%s" % seen, "ok",
                         "1.0# hybrid legitimately yields less than 0.5#"))

    # ---- derived $/BF vs the locked material rates -------------------------
    RATE_MAP = [("Closed Cell", "closed_cell_hfo"), ("Roofing", "spf_roofing")]
    for cat, key in RATE_MAP:
        want = dig(C, ("material_cost_per_bf", key, "rate"))
        members = [f for f in foam if f.get("cat") == cat and f.get("yieldBF")]
        if cat == "Closed Cell":
            members = [f for f in members if "1.7#" not in f.get("n", "")]
        if not (want and members):
            continue
        rates = sorted({round(f["set"] / float(f["yieldBF"]), 4) for f in members})
        # constants pins the MOST EXPENSIVE product in the class, so compare maxima.
        got = max(rates) if rates else None
        row("derived $/BF %s" % cat, "%.4f" % want,
            ("%.4f" % got) if got is not None else None,
            "estimator's dearest %s / its own yield" % cat)

    # ---- FOAM_SEED vs GEO_SEED internal agreement --------------------------
    geo = extract_js_literal(et, "GEO_SEED")
    if isinstance(geo, list) and foam:
        fmap = {f["n"]: f.get("set") for f in foam}
        bad = [g["n"] for g in geo if g["n"] in fmap and fmap[g["n"]] != g.get("set")]
        missing = [g["n"] for g in geo if g["n"] not in fmap]
        rows.append(("GEO_SEED vs FOAM_SEED", "same set price",
                     ("%d disagree" % len(bad)) if bad else "all %d agree" % len(geo),
                     "MISMATCH" if bad else "ok",
                     "; ".join(bad[:3]) if bad else
                     ("%d geo product(s) not in FOAM_SEED" % len(missing) if missing else "")))
    elif foam:
        rows.append(("GEO_SEED", "parseable", None, "ONLY-ONE", "could not parse"))

    # ---- geo foams must not carry a board-foot yield -----------------------
    if foam:
        offenders = [f["n"] for f in foam if f.get("cat") == "Geotech" and f.get("yieldBF")]
        rows.append(("Geotech yieldBF is 0", "0 for all",
                     ("%d carry a BF yield" % len(offenders)) if offenders else "all 0",
                     "MISMATCH" if offenders else "ok",
                     "geo foam is placed by VOLUME; a BF yield invites a board-foot quote"))

    problems = sum(1 for r in rows if r[3] in ("MISMATCH", "ONLY-ONE"))
    return rows, problems, notes


def main():
    args = sys.argv[1:]
    core = CORE_DEFAULT
    here = os.path.dirname(os.path.abspath(__file__))
    kly = os.path.join(os.path.dirname(here), "api", "klyfton.js")
    def flag_value(flag, default):
        # A present flag with no following path (or followed by another flag) is a user
        # error → exit 2 (the documented file/parse code), NOT an IndexError stack trace.
        if flag not in args:
            return default
        i = args.index(flag) + 1
        if i >= len(args) or args[i].startswith("--"):
            print("ERROR: %s requires a path argument" % flag, file=sys.stderr)
            sys.exit(2)
        return args[i]
    core = flag_value("--core", core)
    kly = flag_value("--klyfton", kly)
    # CI runs inside this repo, where mgsf-core/SKILL.md does not exist -- the skill
    # lives in Clifton's Claude account, not in git. This flag lets BODY 3 run alone
    # instead of exiting 2 on a file that was never expected to be here.
    allow_missing_core = "--allow-missing-core" in args
    # BODY 3. Defaults sit where the repo and the skill actually keep them, so the
    # no-argument invocation picks them up without anyone remembering a flag.
    est = flag_value("--estimator", os.path.join(os.path.dirname(here), "public", "estimator.html"))
    repo_pub = os.path.join(os.path.dirname(here), "doctrine", "constants.public.json")
    const_default = os.path.join(os.path.dirname(os.path.abspath(core)), "reference", "constants.json")
    if not os.path.isfile(const_default) and os.path.isfile(repo_pub):
        # The redacted in-repo copy carries the pricing keys BODY 3 needs and none of
        # the company block. Generated by tools/make_public_constants.py.
        const_default = repo_pub
    const = flag_value("--constants", const_default)

    skip_12 = False
    kt = ct = None
    if not os.path.isfile(kly):
        if not allow_missing_core:
            print("ERROR: klyfton.js not found: %s" % kly, file=sys.stderr); return 2
        skip_12 = True
    if not skip_12:
        kt_full = open(kly, encoding="utf-8", errors="replace").read()
        kt = extract_doctrine(kt_full)
        if kt is None:
            if not allow_missing_core:
                print("ERROR: could not find `const DOCTRINE = ` block in %s" % kly, file=sys.stderr)
                return 2
            skip_12 = True
    if not skip_12 and not os.path.isfile(core):
        if not allow_missing_core:
            print("NOTE: mgsf-core SKILL.md not found at %s — can't reconcile." % core, file=sys.stderr)
            print("      Pass --core <path> (the skill isn't in this repo).", file=sys.stderr)
            return 2
        skip_12 = True
    if not skip_12:
        ct = open(core, encoding="utf-8", errors="replace").read()

    rows, mism, only = [], 0, 0
    for label, rx in (() if skip_12 else CHECKS):
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
    if skip_12:
        print("SKIPPED — mgsf-core SKILL.md and/or the klyfton.js DOCTRINE block are not")
        print("available here. Expected in CI: the skill lives in Clifton's Claude account,")
        print("not in this repo. Run locally with --core to check BODY 1 + 2.")
    else:
        print("%-22s %-11s %-11s %s" % ("constant", "mgsf-core", "klyfton", "status"))
    print("-" * 72)
    for label, cv, kv, status, note in rows:
        tail = ""
        if status not in ("ok", "— (absent both)"):
            tail = "  <<< " + status + (("  (%s)" % note) if note else "")
        print("%-22s %-11s %-11s %s%s" % (label, cv or "-", kv or "-", status, tail))
    if not skip_12:
        print("-" * 72)
    problems = mism + only
    if problems:
        known_ct = sum(1 for _, _, _, s, n in rows if s not in ("ok", "— (absent both)") and n)
        print("✗ %d issue(s): %d mismatch, %d present-in-only-one (%d known/documented)."
              % (problems, mism, only, known_ct))
        print("  mgsf-core wins — reconcile the unexpected ones; the known one tracks an owner to-do.")
    elif not skip_12:
        print("✓ in sync — every checked constant matches.")

    # ---------------- BODY 3: public/estimator.html seed tables ----------------
    erows, eprob, enotes = check_estimator(est, const)
    print()
    print("MGSF doctrine reconcile — constants.json  vs  estimator.html seed tables")
    print("=" * 72)
    if erows is None:
        for n in enotes:
            print("NOTE: %s" % n)
        print("      Pass --estimator and --constants to enable this section.")
    else:
        print("%-28s %-11s %-13s %s" % ("seed value", "constants", "estimator", "status"))
        print("-" * 72)
        for label, exp, act, status, note in erows:
            tail = ""
            if status in ("MISMATCH", "ONLY-ONE"):
                tail = "  <<< " + status + (("  — " + note) if note else "")
            elif note:
                tail = "  (%s)" % note
            print("%-28s %-11s %-13s %s%s"
                  % (label, exp if exp is not None else "-",
                     act if act is not None else "-", status, tail))
        print("-" * 72)
        if eprob:
            print("✗ %d issue(s) in the browser estimator." % eprob)
            print("  constants.json wins. estimator.html is what actually quotes jobs in the")
            print("  field, so a yield drift here is money out the door on every bid.")
        else:
            print("✓ estimator.html seeds match constants.json.")

    total = problems + eprob
    return 1 if total else 0


if __name__ == "__main__":
    raise SystemExit(main())
