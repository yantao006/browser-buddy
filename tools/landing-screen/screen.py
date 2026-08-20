#!/usr/bin/env python3
"""Screen Similarweb landing-page zip exports with v1 growth rules."""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import sys
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path

CLICK_FLOOR = 10000
NEW_DAY_CAP = 21
BURST_CHANGE = 500
BURST_LAST_OVER_FIRST = 8
CLIMB_CHANGE = 100
CLIMB_LAST_OVER_FIRST = 1.5
CLIMB_PEAK_POS = 0.5
CLIMB_LAST7_VS_PEAK = 0.4
HARD_PEAK_POS = 0.4
HARD_LAST7_VS_PEAK = 0.2

HERE = Path(__file__).resolve().parent
LABELED_PATH = HERE / "labeled.json"


def norm_url(value: str) -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"^https?://", "", text)
    text = text.split("?", 1)[0].split("#", 1)[0]
    return text.rstrip("/")


def parse_number(text: str | None) -> float | None:
    raw = str(text or "").strip().replace(",", "").replace("\u00a0", "").replace(" ", "")
    if not raw or raw in {"-", "—", "n/a", "N/A"}:
        return None
    raw = raw.replace("↑", "").replace("↓", "").replace(">", "")
    match = re.match(r"^([+\-–−]?)(\d+(?:\.\d+)?)([KMB万])?%?$", raw, re.I)
    if not match:
        try:
            return float(raw)
        except ValueError:
            return None
    sign = -1.0 if match.group(1) in {"-", "–", "−"} else 1.0
    value = float(match.group(2))
    unit = (match.group(3) or "").upper()
    mul = {"K": 1e3, "M": 1e6, "B": 1e9, "万": 1e4}.get(unit, 1.0)
    return sign * value * mul


def mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def load_labeled(path: Path = LABELED_PATH) -> set[str]:
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    return {norm_url(item) for item in data.get("landings", [])}


def read_zip(zip_path: Path) -> tuple[list[dict], dict[str, list[tuple[str, float]]]]:
    summaries: list[dict] = []
    trends: dict[str, list[tuple[str, float]]] = defaultdict(list)
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            text = zf.read(name).decode("utf-8-sig")
            rows = list(csv.DictReader(io.StringIO(text)))
            if name.endswith("-汇总.csv"):
                for row in rows:
                    landing = norm_url(row.get("着陆页") or "")
                    if not landing:
                        continue
                    change_raw = row.get("变动") or ""
                    summaries.append(
                        {
                            "parent": row.get("域名") or "",
                            "landing": landing,
                            "clicks_raw": row.get("点击量") or "",
                            "clicks": parse_number(row.get("点击量")),
                            "share_raw": row.get("点击量占比") or "",
                            "change_raw": change_raw,
                            "change": parse_number(change_raw),
                            "is_new": "新" in change_raw,
                            "is_down": "↓" in change_raw,
                            "desktop_raw": row.get("桌面端占比") or "",
                            "mobile_raw": row.get("移动端占比") or "",
                            "kw_count": parse_number(row.get("关键词数")),
                            "top_kw": row.get("热搜关键词") or "",
                            "index": row.get("序号") or "",
                        }
                    )
            elif name.endswith("-趋势.csv"):
                for row in rows:
                    landing = norm_url(row.get("着陆页") or "")
                    day = row.get("日期") or ""
                    clicks = parse_number(row.get("点击量"))
                    if landing and day:
                        trends[landing].append((day, 0.0 if clicks is None else clicks))
    for series in trends.values():
        series.sort()
    return summaries, trends


def trend_features(series: list[tuple[str, float]]) -> dict | None:
    if len(series) < 3:
        return None
    values = [point[1] for point in series]
    start = next((i for i, value in enumerate(values) if value > 0), 0)
    active = values[start:]
    days = len(active)
    if days < 3:
        return None
    first = active[: max(3, days // 3)]
    last = active[-max(3, days // 3) :]
    last7 = active[-7:]
    prev7 = active[-14:-7] if days >= 14 else active[: max(1, days - 7)]
    last14 = active[-14:]
    last28 = active[-28:]
    peak_i = max(range(days), key=lambda i: active[i])
    last_over_first = (mean(last) or 0.0) / max(mean(first) or 0.0, 1e-9)
    last7_over_prev7 = (mean(last7) or 0.0) / max(mean(prev7) or 0.0, 1e-9)
    last7_vs_peak = (mean(last7) or 0.0) / max(max(active), 1e-9)
    peak_pos = peak_i / max(days - 1, 1)
    sampled = active[:: max(1, days // 20)]
    pairs = 0
    up = 0
    for i, left in enumerate(sampled):
        for right in sampled[i + 1 :]:
            pairs += 1
            if right > left:
                up += 1
    first_day = datetime.strptime(series[start][0], "%Y-%m-%d")
    last_day = datetime.strptime(series[-1][0], "%Y-%m-%d")
    return {
        "days": days,
        "span_days": (last_day - first_day).days + 1,
        "mean": mean(active) or 0.0,
        "last7": mean(last7) or 0.0,
        "last14": mean(last14) or 0.0,
        "last28": mean(last28) or 0.0,
        "last_over_first": last_over_first,
        "last7_over_prev7": last7_over_prev7,
        "last7_vs_peak": last7_vs_peak,
        "peak_pos": peak_pos,
        "trend_up": (up / pairs) if pairs else 0.0,
        "max": max(active),
        "end": active[-1],
    }


def classify(row: dict, feat: dict | None) -> tuple[bool, str]:
    clicks = row.get("clicks") or 0.0
    if clicks < CLICK_FLOOR:
        return False, "clicks"
    if row.get("is_down"):
        return False, "down"
    if feat:
        if feat["peak_pos"] < HARD_PEAK_POS and not row.get("is_new"):
            return False, "peak-early"
        if feat["last7_vs_peak"] < HARD_LAST7_VS_PEAK and not row.get("is_new"):
            return False, "cooled"
    change = row.get("change")
    is_new = bool(row.get("is_new"))
    days = feat["days"] if feat else 0
    last_over_first = feat["last_over_first"] if feat else 0.0
    peak_pos = feat["peak_pos"] if feat else 0.0
    last7_vs_peak = feat["last7_vs_peak"] if feat else 0.0

    if is_new or (days and days < NEW_DAY_CAP):
        return True, "new"
    if (change is not None and change >= BURST_CHANGE) or last_over_first >= BURST_LAST_OVER_FIRST:
        return True, "burst"
    if (
        change is not None
        and change >= CLIMB_CHANGE
        and last_over_first >= CLIMB_LAST_OVER_FIRST
        and peak_pos >= CLIMB_PEAK_POS
        and last7_vs_peak >= CLIMB_LAST7_VS_PEAK
    ):
        return True, "climb"
    return False, "shape"


def score(row: dict, feat: dict | None) -> float:
    clicks = max(row.get("clicks") or 0.0, 1.0)
    change = max(row.get("change") or 0.0, 0.0)
    last_over_first = max((feat or {}).get("last_over_first") or 1.0, 1.0)
    peak_pos = (feat or {}).get("peak_pos") or 0.0
    last7_vs_peak = (feat or {}).get("last7_vs_peak") or 0.0
    new_bonus = 2.0 if row.get("is_new") else 0.0
    return (
        math.log10(clicks)
        + 1.5 * math.log10(1.0 + change)
        + 2.0 * math.log10(last_over_first)
        + peak_pos
        + 1.5 * last7_vs_peak
        + new_bonus
    )


def screen(summaries: list[dict], trends: dict[str, list[tuple[str, float]]], labeled: set[str]) -> list[dict]:
    out: list[dict] = []
    for row in summaries:
        feat = trend_features(trends.get(row["landing"], []))
        passed, shape = classify(row, feat)
        item = {
            **row,
            "feat": feat,
            "pass": passed,
            "shape": shape,
            "score": score(row, feat) if passed else 0.0,
            "labeled": row["landing"] in labeled,
        }
        out.append(item)
    return out


def candidates(rows: list[dict]) -> list[dict]:
    picked = [row for row in rows if row["pass"]]
    picked.sort(key=lambda row: (-row["score"], -(row.get("clicks") or 0)))
    return picked


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "序号",
        "着陆页",
        "父域",
        "形态",
        "分数",
        "点击量",
        "变动",
        "达标样本",
        "趋势天数",
        "后期比前期",
        "峰值位置",
        "近7天比峰值",
        "关键词数",
        "热搜关键词",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for index, row in enumerate(rows, start=1):
            feat = row.get("feat") or {}
            writer.writerow(
                {
                    "序号": str(index),
                    "着陆页": row["landing"],
                    "父域": row["parent"],
                    "形态": {"new": "新品", "burst": "爆发", "climb": "持续爬升"}.get(row["shape"], row["shape"]),
                    "分数": f"{row['score']:.3f}",
                    "点击量": row["clicks_raw"],
                    "变动": row["change_raw"],
                    "达标样本": "是" if row["labeled"] else "",
                    "趋势天数": feat.get("days", ""),
                    "后期比前期": f"{feat['last_over_first']:.2f}" if feat else "",
                    "峰值位置": f"{feat['peak_pos']:.2f}" if feat else "",
                    "近7天比峰值": f"{feat['last7_vs_peak']:.2f}" if feat else "",
                    "关键词数": row["kw_count"] if row["kw_count"] is not None else "",
                    "热搜关键词": row["top_kw"],
                }
            )


def regression_report(rows: list[dict], labeled: set[str]) -> dict:
    picked = {row["landing"] for row in rows if row["pass"]}
    present = {row["landing"] for row in rows if row["labeled"]}
    recalled = sorted(picked & labeled)
    missed = sorted(labeled - picked)
    extras = sorted(picked - labeled)
    missing_in_zip = sorted(labeled - {row["landing"] for row in rows})
    return {
        "labeled": len(labeled),
        "present": len(present),
        "passed": len(picked),
        "recalled": recalled,
        "missed": missed,
        "extras": extras,
        "missing_in_zip": missing_in_zip,
        "recall": (len(recalled) / len(present)) if present else 0.0,
    }


def print_report(report: dict) -> None:
    print(f"达标样本 {report['labeled']}，zip 里有 {report['present']}，规则通过 {report['passed']}")
    print(f"召回 {len(report['recalled'])}/{report['present']} = {report['recall']:.0%}")
    if report["missed"]:
        print("漏掉：")
        for item in report["missed"]:
            print(f"  {item}")
    if report["missing_in_zip"]:
        print("zip 里没有：")
        for item in report["missing_in_zip"]:
            print(f"  {item}")
    print(f"额外通过 {len(report['extras'])} 条（未在达标名单里，待你裁定）")
    for item in report["extras"][:20]:
        print(f"  {item}")
    if len(report["extras"]) > 20:
        print(f"  … 还有 {len(report['extras']) - 20} 条")


def default_out_path(zip_path: Path) -> Path:
    stamp = datetime.now().strftime("%Y-%m-%d")
    return zip_path.parent / f"landing-candidates-{stamp}.csv"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="按 v1 规则筛选 Similarweb 着陆页 zip")
    parser.add_argument("zip_path", type=Path, help="landing-pages-YYYY-MM-DD.zip")
    parser.add_argument("-o", "--out", type=Path, help="候选 CSV 输出路径")
    parser.add_argument("--labeled", type=Path, default=LABELED_PATH, help="达标样本 JSON")
    args = parser.parse_args(argv)
    zip_path = args.zip_path.expanduser().resolve()
    if not zip_path.exists():
        print(f"找不到 {zip_path}", file=sys.stderr)
        return 1
    labeled = load_labeled(args.labeled)
    summaries, trends = read_zip(zip_path)
    rows = screen(summaries, trends, labeled)
    picked = candidates(rows)
    out_path = (args.out or default_out_path(zip_path)).expanduser().resolve()
    write_csv(out_path, picked)
    print(f"写了 {len(picked)} 条候选到 {out_path}")
    if labeled:
        print_report(regression_report(rows, labeled))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
