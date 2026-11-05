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
        self.assertEqual(set(items[0]), {"number", "title", "kind", "stage", "github_url", "discord_urls",
                                        "severity", "severity_override", "automatic_stage", "issue_state"})
        authority["BRIDGE"].message_link.assert_called_once_with("thread", "message")

    def test_severity_is_independent_of_stage_and_manual_override_wins(self):
        for automatic in ("blocking", "major", "normal"):
            for override in (None, "blocking", "major", "normal"):
                labels = ["bug", f"severity: {automatic}"]
                if override:
                    labels.append(f"severity override: {override}")
                authority, index = self.setup_authority([issue(1, labels=labels)])
                item = EXPORT["export_items"](authority, index, [], [])[0]
                self.assertEqual(item["severity"], override or automatic)
                self.assertEqual(item["severity_override"], override)
                self.assertEqual(item["stage"], "backlog")
        self.assertEqual(EXPORT["severity"](set()), {"severity": "unassessed", "severity_override": None})

    def test_ambiguous_labels_fail_visibly(self):
        for labels in (
            {"severity: blocking", "severity: major"},
            {"severity override: normal", "severity override: major"},
        ):
            with self.assertRaisesRegex(ValueError, "Conflicting severity"):
                EXPORT["severity"](labels)

    def test_confirmed_delivery_survives_sync_for_open_and_closed_issues(self):
        for state in ("open", "closed"):
            for label, stage in EXPORT["DELIVERY_LABELS"].items():
                authority, index = self.setup_authority([issue(1, state=state, labels=("bug", label))])
                index.api.pages.return_value = [{
                    "id": 1, "event": "labeled", "label": {"name": label},
                    "actor": {"login": "brandomoore", "id": 16313090}, "created_at": "2026-11-05T00:00:00Z",
                }]
                item = EXPORT["export_items"](authority, index, [], [])[0]
                self.assertEqual(item["stage"], EXPORT["STAGES"][stage])
                self.assertIsNone(item["automatic_stage"])
                self.assertEqual(item["issue_state"], state)

    def test_automatic_delivery_can_advance_but_not_be_downgraded_by_confirmation(self):
        label = "roadmap: testflight"
        authority, index = self.setup_authority([issue(1, labels=("bug", label))], {1: {"issue": 1}})
        index.api.pages.return_value = [{
            "id": 1, "event": "labeled", "label": {"name": label},
            "actor": {"login": "brandomoore", "id": 16313090}, "created_at": "2026-11-05T00:00:00Z",
        }]
        authority["delivery_stage"].return_value = "Released"
        item = EXPORT["export_items"](authority, index, [], [])[0]
        self.assertEqual((item["stage"], item["automatic_stage"]), ("released", "released"))

    def test_delivery_confirmation_provenance_conflicts_and_reopening(self):
        label = "roadmap: released"
        event = {"id": 1, "event": "labeled", "label": {"name": label},
                 "actor": {"login": "brandomoore", "id": 16313090}, "created_at": "2026-11-05T00:00:00Z"}
        for events in ([], [{**event, "actor": {"login": "brandomoore", "id": 999}}],
                       [event, {**event, "id": 2, "event": "unlabeled"}]):
            with self.assertRaisesRegex(ValueError, "not verified"):
                EXPORT["confirmed_delivery"]({label}, events)
        self.assertIsNone(EXPORT["confirmed_delivery"]({label}, [event, {
            "id": 2, "event": "reopened", "created_at": event["created_at"],
        }]))
        for other in ("roadmap: testflight", "roadmap: planned", "roadmap: in progress"):
            authority, index = self.setup_authority([issue(1, labels=("bug", label, other))])
            with self.assertRaisesRegex(ValueError, "conflicting roadmap"):
                EXPORT["export_items"](authority, index, [], [])


if __name__ == "__main__":
    unittest.main()
