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
        receipt = bridge.latest_release_resolution(index, number)
        events = index.api.pages(f"/repos/{bridge.REPO}/issues/{number}/events") if (
            receipt or labels & authority["COMMITMENT_LABELS"].keys()
        ) else []
        stage = authority["delivery_stage"](receipt, events, beta, store) if receipt else None
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
            "github_url": f"https://github.com/{bridge.REPO}/issues/{number}",
            "discord_urls": links,
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
        "schema_version": 1,
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
