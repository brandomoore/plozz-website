import runpy
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


EXPORT = runpy.run_path(str(Path(__file__).resolve().parents[2] / "tools/export-roadmap.py"))


def issue(number, state="open", labels=("bug",)):
    return {"number": number, "state": state, "title": f"Report {number}",
            "labels": [{"name": label} for label in labels]}


class ExportTests(unittest.TestCase):
    def setup_authority(self, issues, receipts=None):
        receipts = receipts or {}
        api = SimpleNamespace(pages=Mock(return_value=[]))
        index = SimpleNamespace(issues={i["number"]: i for i in issues}, api=api, reports={})
        bridge = SimpleNamespace(REPO="brandomoore/Plozz",
                                 latest_release_resolution=Mock(side_effect=lambda _, n: receipts.get(n)),
                                 message_link=Mock(return_value="https://discord.com/channels/1527028230106906704/1562104628798038107/1562104628798038107"))
        authority = {
            "BRIDGE": bridge, "COMMITMENT_LABELS": {"roadmap: planned": "Planned", "roadmap: in progress": "In progress"},
            "delivery_stage": Mock(return_value=None), "commitment": Mock(return_value="Backlog"),
        }
        return authority, index

    def test_only_bugs_and_features_and_no_closed_inference(self):
        authority, index = self.setup_authority([
            issue(1), issue(2, labels=("enhancement",)), issue(3, state="closed"),
            issue(4, labels=("bug", "duplicate")), issue(5, labels=("question",)),
        ])
        items = EXPORT["export_items"](authority, index, [], [])
        self.assertEqual([(i["number"], i["kind"], i["stage"]) for i in items],
                         [(1, "bug", "backlog"), (2, "feature", "backlog")])
        index.api.pages.assert_not_called()
        authority["delivery_stage"].assert_not_called()

    def test_delivery_is_delegated_with_receipt_events_and_both_channels(self):
        receipt = {"issue": 7, "commit": "abc"}
        authority, index = self.setup_authority([issue(7, state="closed")], {7: receipt})
        authority["delivery_stage"].return_value = "Released"
        beta, store = [{"beta": "evidence"}], [{"store": "evidence"}]
        items = EXPORT["export_items"](authority, index, beta, store)
        self.assertEqual(items[0]["stage"], "released")
        authority["delivery_stage"].assert_called_once_with(receipt, [], beta, store)
        authority["commitment"].assert_not_called()

    def test_unverified_delivery_does_not_promote_closed_issue(self):
        authority, index = self.setup_authority([issue(1, state="closed")], {1: {"issue": 1}})
        self.assertEqual(EXPORT["export_items"](authority, index, [], []), [])

    def test_maintainer_decision_is_verified_by_existing_authority(self):
        obj = issue(9, labels=("enhancement", "roadmap: planned"))
        authority, index = self.setup_authority([obj])
        authority["commitment"].return_value = "Planned"
        self.assertEqual(EXPORT["export_items"](authority, index, [], [])[0]["stage"], "planned")
        authority["commitment"].assert_called_once_with(obj, [])
        index.api.pages.assert_called_once_with("/repos/brandomoore/Plozz/issues/9/events")
        authority["commitment"].side_effect = ValueError("unverified maintainer")
        with self.assertRaisesRegex(ValueError, "unverified maintainer"):
            EXPORT["export_items"](authority, index, [], [])

    def test_delivery_errors_fail_whole_export_and_links_use_validated_index_only(self):
        authority, index = self.setup_authority([issue(1)], {1: {"issue": 1}})
        authority["delivery_stage"].side_effect = ValueError("bad receipt")
        with self.assertRaisesRegex(ValueError, "bad receipt"):
            EXPORT["export_items"](authority, index, [], [])
        authority["delivery_stage"].side_effect = None
        authority["delivery_stage"].return_value = None
        index.reports = {"thread": {"number": 1, "meta": {"message": "message"}}}
        items = EXPORT["export_items"](authority, index, [], [])
        self.assertEqual(len(items[0]["discord_urls"]), 1)
        self.assertEqual(set(items[0]), {"number", "title", "kind", "stage", "github_url", "discord_urls"})
        authority["BRIDGE"].message_link.assert_called_once_with("thread", "message")


if __name__ == "__main__":
    unittest.main()
