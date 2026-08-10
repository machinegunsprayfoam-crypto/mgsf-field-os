#!/usr/bin/env python3
"""Derive doctrine/constants.public.json from the mgsf-core constants.json.

WHY THIS EXISTS
  CI has to check estimator.html against the doctrine numbers, but the source of
  truth (mgsf-core/reference/constants.json) lives in the Agent Skill, not in this
  repo -- and it carries the company block: tax and registration identifiers,
  address, phone. This repo is PUBLIC. Committing constants.json wholesale would
  violate the standing rule: "DATA: no PII, no CUI".

  So the public file is DERIVED, never hand-written. It carries an explicit
  allowlist of pricing keys and nothing else, and the script refuses to write if a
  denied pattern shows up anywhere in the output.

  Deriving rather than authoring is the point: a hand-maintained copy would just
  become a fourth body to drift. This one is regenerated from the real file.

REGENERATE (after any constants.json edit):
  python3 tools/make_public_constants.py \\
      --constants /path/to/mgsf-core/reference/constants.json

Exit 0 = written (or already current). Exit 1 = a denied value would have leaked.
Exit 2 = a file/parse problem.
"""
import json
import os
import re
import sys

# Only these paths are copied. Anything not listed is dropped, including any key
# added to constants.json later -- new fields are private until named here.
ALLOW = [
    ("state_multipliers",),
    ("gross_margin_targets",),
    ("job_minimum", "amount"),
    ("labor_rate_per_hr", "installer", "rate"),
    ("labor_rate_per_hr", "helper", "rate"),
    ("material_cost_per_bf", "open_cell", "rate"),
    ("material_cost_per_bf", "closed_cell_hfo", "rate"),
    ("material_cost_per_bf", "spf_roofing", "rate"),
    ("yield", "measured_actual", "closed_cell_bf_per_set"),
    ("yield", "measured_actual", "roofing_bf_per_set"),
    ("yield", "measured_actual", "open_cell_bf_per_set"),
    ("yield_chain", "net_factor"),
]

# If any of these appear in the rendered output, something leaked. Fail loudly.
# Identifiers are matched by SHAPE, not by value, so a changed number still trips.
DENY = [
    (r"\b\d{2}-\d{7}\b", "tax-ID-shaped number"),
    (r"\b[A-Z0-9]{12}\b", "registration-ID-shaped identifier"),
    (r"\b\d{3}[-.]\d{3}[-.]\d{4}\b", "phone number"),
    (r"(?i)\bein\b", "the literal tax-ID keyword"),
    (r"(?i)\buei\b", "the literal registration-ID keyword"),
    (r"(?i)\b\d+\s+[NSEW]\.?\s+\w+\s+(ave|st|street|avenue|rd|road)\b", "street address"),
    (r"(?i)@[\w.-]+\.(com|info|net|org)", "email address"),
]


def dig(d, path):
    for k in path:
        if not isinstance(d, dict) or k not in d:
            return None, False
        d = d[k]
    return d, True


def put(dst, path, value):
    for k in path[:-1]:
        dst = dst.setdefault(k, {})
    dst[path[-1]] = value


def main():
    args = sys.argv[1:]
    src = None
    if "--constants" in args:
        i = args.index("--constants") + 1
        if i >= len(args) or args[i].startswith("--"):
            print("ERROR: --constants requires a path", file=sys.stderr)
            return 2
        src = args[i]
    if not src:
        for cand in ("/root/.claude/skills/mgsf-core/reference/constants.json",
                     os.path.expanduser("~/klyfton/mgsf-core/reference/constants.json")):
            if os.path.isfile(cand):
                src = cand
                break
    if not src or not os.path.isfile(src):
        print("ERROR: constants.json not found. Pass --constants <path>.", file=sys.stderr)
        return 2

    here = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(os.path.dirname(here), "doctrine", "constants.public.json")

    try:
        C = json.load(open(src, encoding="utf-8"))
    except Exception as e:
        print("ERROR: %s is not valid JSON: %s" % (src, e), file=sys.stderr)
        return 2

    pub, missing = {}, []
    for path in ALLOW:
        val, ok = dig(C, path)
        if not ok:
            missing.append(".".join(path))
            continue
        put(pub, path, val)

    pub["_meta"] = {
        "GENERATED": "Do not hand-edit. Regenerate with tools/make_public_constants.py.",
        "derived_from": "mgsf-core/reference/constants.json",
        "source_effective_date": (C.get("_meta") or {}).get("constants_effective_date"),
        "why_partial": ("This repo is public. Only the pricing keys the drift check needs are "
                        "copied. The company block -- tax and registration identifiers, street "
                        "address, phone -- is never included."),
        "authority": ("constants.json in mgsf-core is the source of truth. If this file and that "
                      "one disagree, that one wins and this one is stale -- regenerate it."),
    }

    rendered = json.dumps(pub, indent=2, sort_keys=True)

    leaked = [why for rx, why in DENY if re.search(rx, rendered)]
    if leaked:
        print("REFUSING TO WRITE -- these would have leaked into a public repo:", file=sys.stderr)
        for why in leaked:
            print("  - %s" % why, file=sys.stderr)
        return 1

    if missing:
        print("NOTE: %d allowlisted key(s) absent from constants.json: %s"
              % (len(missing), ", ".join(missing)))

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    old = open(out_path, encoding="utf-8").read() if os.path.isfile(out_path) else None
    if old == rendered + "\n":
        print("already current: %s" % out_path)
        return 0
    open(out_path, "w", encoding="utf-8").write(rendered + "\n")
    print("wrote %s (%d bytes, %d key group(s), 0 denied patterns)"
          % (out_path, len(rendered) + 1, len(pub) - 1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
