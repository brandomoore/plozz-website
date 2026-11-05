#!/usr/bin/env python3
"""Export public roadmap JSON using the pinned Plozz delivery authority."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import runpy
import subprocess


AUTHORITY_REVISION = "54858354cb10314f843c1236d3cbab7a9f8f0f13"
AUTHORITY_FILES = (
    "discord-roadmap.py", "discord-bridge.py", "testflight-resolutions.py",
    "testflight-discord.py", "release-notes.py", "format-triage-comments.py",
)
STAGES = {
    "Backlog": "backlog", "Planned": "planned", "In progress": "in-progress",
    "In beta": "in-beta", "Released": "released",
}
SEVERITIES = ("blocking", "major", "normal")
DELIVERY_LABELS = {"roadmap: testflight": "In beta", "roadmap: released": "Released"}


def confirmed_delivery(labels, events):
    selected = labels & DELIVERY_LABELS.keys()
    if len(selected) > 1:
        raise ValueError("Conflicting roadmap delivery confirmations; resolve them on GitHub.")
    if not selected:
        return None
    label = next(iter(selected))
    changes = [e for e in events if e.get("event") in ("labeled", "unlabeled")
               and e.get("label", {}).get("name") == label]
    latest = max(changes, key=lambda e: (e["created_at"], e["id"]), default=None)
    if (not latest or latest["event"] != "labeled"
            or latest.get("actor", {}).get("login") != "brandomoore"
            or latest.get("actor", {}).get("id") != 16313090):
        raise ValueError("Roadmap delivery confirmation is not verified as the maintainer's choice.")
    confirmed_at = datetime.fromisoformat(latest["created_at"].replace("Z", "+00:00"))
    if any(e.get("event") == "reopened" and datetime.fromisoformat(
            e["created_at"].replace("Z", "+00:00")) >= confirmed_at for e in events):
        return None
    return DELIVERY_LABELS[label]


def severity(labels):
    automatic = [value for value in SEVERITIES if f"severity: {value}" in labels]
    overrides = [value for value in SEVERITIES if f"severity override: {value}" in labels]
    if len(automatic) > 1 or len(overrides) > 1:
        raise ValueError("Conflicting severity labels; resolve them on GitHub.")
    return {
        "severity": (overrides or automatic or ["unassessed"])[0],
        "severity_override": overrides[0] if overrides else None,
    }


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], timeout=60)


def load_authority(root):
    revision = git(root, "rev-parse", "HEAD").decode().strip()
    if revision != git(root, "rev-parse", "refs/remotes/origin/main").decode().strip():
        raise ValueError("Source checkout must be the fetched Plozz main revision.")
    for name in AUTHORITY_FILES:
        path = f"tools/{name}"
        if (root / path).read_bytes() != git(root, "show", f"{AUTHORITY_REVISION}:{path}"):
            raise ValueError(f"{path} differs from the reviewed roadmap authority.")
    return runpy.run_path(str(root / "tools/discord-roadmap.py")), revision


def export_items(authority, index, beta, store):
    bridge = authority["BRIDGE"]
    items = []
    for number, issue in sorted(index.issues.items()):
        labels = {label["name"] for label in issue.get("labels", [])}
        if not labels & {"bug", "enhancement"} or "duplicate" in labels:
            continue
        if len(labels & (authority["COMMITMENT_LABELS"].keys() | DELIVERY_LABELS.keys())) > 1:
            raise ValueError(f"Issue #{number} has conflicting roadmap stage labels.")
        receipt = bridge.latest_release_resolution(index, number)
        events = index.api.pages(f"/repos/{bridge.REPO}/issues/{number}/events") if (
            receipt or labels & (authority["COMMITMENT_LABELS"].keys() | DELIVERY_LABELS.keys())
        ) else []
        automatic = authority["delivery_stage"](receipt, events, beta, store) if receipt else None
        confirmed = confirmed_delivery(labels, events)
        stage = max((value for value in (automatic, confirmed) if value),
                    key=lambda value: list(STAGES).index(value), default=None)
        if stage is None:
            if issue["state"] != "open":
                continue
            stage = authority["commitment"](issue, events)
        links = sorted({
            bridge.message_link(thread, record["meta"]["message"])
            for thread, record in index.reports.items() if record["number"] == number
        })
        items.append({
            "number": number,
            "title": " ".join(issue["title"].split()),
            "kind": "bug" if "bug" in labels else "feature",
            "stage": STAGES[stage],
            "automatic_stage": STAGES[automatic] if automatic else None,
            "issue_state": issue["state"],
            "github_url": f"https://github.com/{bridge.REPO}/issues/{number}",
            "discord_urls": links,
            **severity(labels),
        })
    return items


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    run_url = os.environ.get("ROADMAP_RUN_URL", "")
    if not re.fullmatch(r"https://github\.com/brandomoore/plozz-website/actions/runs/[1-9]\d*", run_url):
        raise ValueError("A website workflow run URL is required for provenance.")
    authority, revision = load_authority(args.source_root.resolve())
    bridge, announcements = authority["BRIDGE"], authority["ANN"]
    github = bridge.API("GitHub", os.environ.get("GITHUB_TOKEN"))
    index = bridge.GitHubIndex(github)
    apple = bridge.API("App Store Connect", announcements.apple_token())
    published = github.pages(f"/repos/{bridge.REPO}/releases")
    beta = authority["verified_releases"](announcements.available_builds(apple, (0,)), published)
    store = authority["verified_releases"](authority["app_store_builds"](apple), published)
    items = export_items(authority, index, beta, store)
    # Write only after every item and delivery check succeeded.
    feed = {
        "schema_version": 3,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": {
            "repository": bridge.REPO, "revision": revision,
            "authority_revision": AUTHORITY_REVISION, "run_url": run_url,
        },
        "items": items,
    }
    args.output.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n")
    print(f"Verified {len(items)} public roadmap items at {revision}.")


if __name__ == "__main__":
    main()
