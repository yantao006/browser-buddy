#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from screen import classify, norm_url, parse_number, read_zip, screen, trend_features


def make_zip(summaries: list[dict], trends: list[dict]) -> Path:
    handle = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    handle.close()
    path = Path(handle.name)
    with zipfile.ZipFile(path, "w") as zf:
        summary_buf = io.StringIO()
        writer = csv.DictWriter(
            summary_buf,
            fieldnames=["域名", "序号", "着陆页", "点击量", "点击量占比", "变动", "关键词数", "热搜关键词"],
        )
        writer.writeheader()
        writer.writerows(summaries)
        zf.writestr("demo/demo-汇总.csv", summary_buf.getvalue())
        trend_buf = io.StringIO()
        trend_writer = csv.DictWriter(trend_buf, fieldnames=["域名", "着陆页", "日期", "点击量"])
        trend_writer.writeheader()
        trend_writer.writerows(trends)
        zf.writestr("demo/demo-趋势.csv", trend_buf.getvalue())
    return path


class ScreenTest(unittest.TestCase):
    def test_parse_and_norm(self) -> None:
        self.assertEqual(norm_url("https://Foo.GITHUB.io/Bar/"), "foo.github.io/bar")
        self.assertEqual(parse_number("31.3K"), 31300)
        self.assertEqual(parse_number("↑1,461%"), 1461)
        self.assertEqual(parse_number("↑> 5,000%"), 5000)
        self.assertEqual(parse_number("新"), None)

    def test_new_and_burst(self) -> None:
        zip_path = make_zip(
            [
                {
                    "域名": "vercel.app",
                    "序号": "1",
                    "着陆页": "new-hot.vercel.app",
                    "点击量": "12.3K",
                    "点击量占比": "1%",
                    "变动": "新",
                    "关键词数": "10",
                    "热搜关键词": "x",
                },
                {
                    "域名": "vercel.app",
                    "序号": "2",
                    "着陆页": "flat.vercel.app",
                    "点击量": "80K",
                    "点击量占比": "5%",
                    "变动": "↑8%",
                    "关键词数": "10",
                    "热搜关键词": "y",
                },
            ],
            [
                {"域名": "vercel.app", "着陆页": "new-hot.vercel.app", "日期": "2026-08-01", "点击量": "100"},
                {"域名": "vercel.app", "着陆页": "new-hot.vercel.app", "日期": "2026-08-02", "点击量": "400"},
                {"域名": "vercel.app", "着陆页": "new-hot.vercel.app", "日期": "2026-08-03", "点击量": "900"},
                {"域名": "vercel.app", "着陆页": "new-hot.vercel.app", "日期": "2026-08-04", "点击量": "1200"},
                {"域名": "vercel.app", "着陆页": "flat.vercel.app", "日期": "2026-05-01", "点击量": "2000"},
                {"域名": "vercel.app", "着陆页": "flat.vercel.app", "日期": "2026-06-01", "点击量": "2100"},
                {"域名": "vercel.app", "着陆页": "flat.vercel.app", "日期": "2026-07-01", "点击量": "2050"},
                {"域名": "vercel.app", "着陆页": "flat.vercel.app", "日期": "2026-08-01", "点击量": "1980"},
            ],
        )
        self.addCleanup(zip_path.unlink)
        summaries, trends = read_zip(zip_path)
        rows = screen(summaries, trends, {"new-hot.vercel.app"})
        by_landing = {row["landing"]: row for row in rows}
        self.assertTrue(by_landing["new-hot.vercel.app"]["pass"])
        self.assertEqual(by_landing["new-hot.vercel.app"]["shape"], "new")
        self.assertFalse(by_landing["flat.vercel.app"]["pass"])

    def test_trend_last_over_first(self) -> None:
        series = [(f"2026-05-{i:02d}", 40.0) for i in range(1, 21)] + [
            (f"2026-06-{i:02d}", 90.0) for i in range(1, 21)
        ]
        feat = trend_features(series)
        self.assertIsNotNone(feat)
        assert feat is not None
        self.assertGreater(feat["last_over_first"], 1.5)
        self.assertLess(feat["last_over_first"], 8)
        passed, shape = classify(
            {"clicks": 20000, "change": 200, "is_new": False, "is_down": False},
            feat,
        )
        self.assertTrue(passed)
        self.assertEqual(shape, "climb")


if __name__ == "__main__":
    unittest.main()
