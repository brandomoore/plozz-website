"""Exercise the actual pinned upstream stage functions, without network or secrets."""

import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


ROOT = os.environ.get("PLOZZ_AUTHORITY_ROOT")


@unittest.skipUnless(ROOT, "Set PLOZZ_AUTHORITY_ROOT to the downloaded pinned authority.")
class AuthorityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.authority = runpy.run_path(str(Path(ROOT) / "tools/discord-roadmap.py"))

    def test_only_maintainers_last_label_application_is_a_commitment(self):
        issue = {"number": 7, "labels": [{"name": "roadmap: planned"}]}
        event = {"event": "labeled", "label": {"name": "roadmap: planned"},
                 "created_at": "2026-11-04T20:00:00Z", "id": 1,
                 "actor": {"login": "brandomoore"}}
        self.assertEqual(self.authority["commitment"](issue, [event]), "Planned")
        for events in [[], [{**event, "actor": {"login": "someone-else"}}],
                       [event, {**event, "id": 2, "event": "unlabeled"}]]:
            with self.assertRaises(self.authority["Error"]):
                self.authority["commitment"](issue, events)
        issue["labels"].append({"name": "roadmap: in progress"})
        with self.assertRaises(self.authority["Error"]):
            self.authority["commitment"](issue, [event])

    def test_real_delivery_requires_all_platforms_and_respects_reopening(self):
        receipt = {"issue": 7, "commit": "abc", "platforms": ["iOS", "tvOS"]}
        authority = self.authority
        overrides = {
            "commit_declarations": lambda *_: [receipt],
            "ancestor": lambda *_: True,
            "git": lambda *args: "2026-11-04T12:00:00+00:00" if "--format=%cI" in args else "",
        }
        source = {"source": "store", "platforms": {"IOS", "TV_OS"}}
        with patch.dict(authority["RES"], overrides), patch.dict(
                authority["delivery_stage"].__globals__, {"includes_fix": lambda *_: True}):
            stage = authority["delivery_stage"]
            self.assertEqual(stage(receipt, [], [], [source]), "Released")
            self.assertEqual(stage(receipt, [], [source], []), "In beta")
            self.assertIsNone(stage(receipt, [], [{**source, "platforms": {"IOS"}}], []))
            self.assertIsNone(stage(receipt, [{"event": "reopened", "created_at": "2026-11-04T13:00:00Z"}], [], [source]))
            with patch.dict(authority["delivery_stage"].__globals__, {"includes_fix": lambda *_: False}):
                self.assertIsNone(stage(receipt, [], [source], [source]))

    def test_historical_catalog_absence_is_not_delivery_and_missing_tags_fail(self):
        authority = self.authority
        published = [{"tag_name": "release/024", "draft": False}]
        release = {"build": "24", "platforms": {"IOS"}, "marketing": "2026.1.1"}
        with patch.object(authority["ANN"], "published_release", return_value=published[0]), patch.dict(
                authority["RES"], {"git": lambda *_: ""}):
            self.assertEqual(authority["verified_releases"]([release], published), [])
        def missing(*_):
            raise authority["Error"]("Missing tag")
        with patch.object(authority["ANN"], "published_release", return_value=published[0]), patch.dict(
                authority["RES"], {"git": missing}):
            with self.assertRaisesRegex(authority["Error"], "Missing tag"):
                authority["verified_releases"]([release], published)

    def test_app_store_uses_highest_distributed_version_not_api_order_or_pending(self):
        authority = self.authority
        def version(identifier, marketing, build, state, platform="IOS"):
            return {
                "id": identifier,
                "attributes": {"versionString": marketing, "platform": platform, "appVersionState": state},
                "relationships": {"build": {"data": {"type": "builds", "id": build}}},
            }
        versions = [
            version("pending", "2026.12.1", "71", "PENDING_DEVELOPER_RELEASE"),
            version("new", "2026.11.4", "70", "READY_FOR_DISTRIBUTION"),
            version("old", "2026.10.1", "60", "READY_FOR_SALE"),
            version("tv", "2026.11.4", "70", "READY_FOR_SALE", "TV_OS"),
        ]
        included = {("builds", build): {"attributes": {"version": build, "processingState": "VALID"}}
                    for build in ("60", "70", "71")}
        for order in (versions, list(reversed(versions))):
            with patch.object(authority["ANN"], "apple_collection",
                              side_effect=[([{"id": "app"}], {}), (order, included)]):
                result = authority["app_store_builds"](object())
                self.assertEqual(len(result), 2)
                self.assertTrue(all(r["build"] == "70" and r["marketing"] == "2026.11.4" for r in result))
                self.assertEqual(set.union(*(r["platforms"] for r in result)), {"IOS", "TV_OS"})
