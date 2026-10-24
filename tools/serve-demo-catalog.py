#!/usr/bin/env python3
"""Loopback Jellyfin-protocol fixture serving the original screenshot media.

This is a capture fixture, not a Jellyfin server or a replacement app interface.
It supplies original catalog data to Plozz's unmodified Jellyfin client.
"""
import argparse
import hashlib
import http.server
import json
from pathlib import Path
import re
import urllib.parse
import xml.etree.ElementTree as ET


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8879)
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    items, paths = {}, {}
    for index, folder in enumerate(sorted((root / "Movies").iterdir())):
        metadata = ET.parse(folder / "movie.nfo").getroot()
        item_id = f"original-{index}"
        title = metadata.findtext("title")
        video = next(folder.glob("*.mp4"))
        paths[item_id] = {"video": video, "Primary": folder / "poster.jpg", "Backdrop": folder / "fanart.jpg",
                          "subtitle": next(folder.glob("*.srt"))}
        streams = [
            {"Index": 0, "Type": "Video", "Codec": "h264", "Width": 1920, "Height": 1080, "VideoRange": "SDR", "BitRate": 2_000_000},
            {"Index": 1, "Type": "Audio", "Codec": "aac", "Channels": 2, "Language": "eng", "IsDefault": True, "SampleRate": 48000},
            {"Index": 2, "Type": "Subtitle", "Codec": "srt", "Language": "eng", "DisplayTitle": "English", "IsExternal": True,
             "IsDefault": True, "DeliveryMethod": "External", "DeliveryUrl": f"/Videos/{item_id}/{item_id}/Subtitles/2/Stream.srt"},
        ]
        source = {"Id": item_id, "Container": "mp4", "Protocol": "Http", "Type": "Default", "Path": f"/Videos/{item_id}/stream.mp4",
                  "Size": video.stat().st_size, "Bitrate": 2_096_000, "RunTimeTicks": 1_800_000_000,
                  "SupportsDirectPlay": True, "SupportsDirectStream": True, "SupportsTranscoding": False,
                  "MediaStreams": streams, "DefaultAudioStreamIndex": 1, "DefaultSubtitleStreamIndex": 2}
        items[item_id] = {
            "Id": item_id, "Name": title, "SortName": title, "Type": "Movie", "MediaType": "Video", "IsFolder": False,
            "ServerId": "plozz-original-demo", "ParentId": "original-films", "ProductionYear": 2026,
            "DateCreated": f"2026-01-{index+1:02d}T12:00:00Z", "PremiereDate": f"2026-01-{index+1:02d}T00:00:00Z",
            "Overview": metadata.findtext("plot"), "Genres": ["Visual studies"], "Studios": [{"Name": "Plozz Demo"}],
            "RunTimeTicks": 1_800_000_000, "ImageTags": {"Primary": hashlib.sha256((folder/"poster.jpg").read_bytes()).hexdigest()},
            "BackdropImageTags": [hashlib.sha256((folder/"fanart.jpg").read_bytes()).hexdigest()],
            "ProviderIds": {}, "People": [], "MediaSources": [source], "MediaStreams": streams,
            "UserData": {"Played": False, "IsFavorite": False, "PlaybackPositionTicks": 450_000_000 if title == "Orbital Drift" else 0, "PlayCount": 0},
        }
    library = {"Id": "original-films", "Name": "Original Films", "Type": "CollectionFolder", "CollectionType": "movies",
               "IsFolder": True, "ImageTags": {"Primary": "original-library"}}

    class Handler(http.server.BaseHTTPRequestHandler):
        def send_bytes(self, data, content_type, status=200):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if self.command != "HEAD":
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def reply(self, value):
            self.send_bytes(json.dumps(value).encode(), "application/json")

        def media(self, file, content_type):
            size = file.stat().st_size
            first, last, status = 0, size-1, 200
            value = self.headers.get("Range")
            if value:
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
                if not match or not any(match.groups()):
                    return self.send_error(416)
                start, end = match.groups()
                first, last = (int(start), min(int(end), last) if end else last) if start else (max(0, size-int(end)), last)
                if first > last or first >= size:
                    return self.send_error(416)
                status = 206
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(last-first+1))
            self.send_header("Accept-Ranges", "bytes")
            if status == 206:
                self.send_header("Content-Range", f"bytes {first}-{last}/{size}")
            self.end_headers()
            if self.command != "HEAD":
                try:
                    with file.open("rb") as stream:
                        stream.seek(first)
                        left = last-first+1
                        while left:
                            chunk = stream.read(min(left, 1_048_576))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            left -= len(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def handle_api(self):
            path = urllib.parse.urlsplit(self.path)
            endpoint = path.path.rstrip("/")
            query = dict(urllib.parse.parse_qsl(path.query))
            if self.command == "POST":
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
            if endpoint in ["/System/Info/Public", "/System/Info"]:
                return self.reply({"Id": "plozz-original-demo", "ServerName": "Plozz Demo", "Version": "10.10.7", "ProductName": "Jellyfin"})
            if endpoint.endswith("/Views"):
                return self.reply({"Items": [library], "TotalRecordCount": 1})
            if endpoint.startswith("/DisplayPreferences/"):
                return self.reply({"CustomPrefs": {}})
            if endpoint in ["/Users/Me", "/Users/demo"]:
                return self.reply({"Id": "demo", "Name": "Alex", "Policy": {"IsAdministrator": False, "EnableAllFolders": True, "EnableMediaPlayback": True},
                                   "Configuration": {"OrderedViews": ["original-films"], "GroupedFolders": []}})
            image = re.fullmatch(r"/Items/([^/]+)/Images/(Primary|Backdrop|Thumb)(?:/\d+)?", endpoint)
            if image:
                item_id, kind = image.groups()
                if item_id == "original-films":
                    item_id = next(iter(items))
                if item_id not in paths:
                    return self.send_error(404)
                return self.media(paths[item_id]["Backdrop" if kind in ["Backdrop", "Thumb"] else "Primary"], "image/jpeg")
            playback = re.fullmatch(r"/Items/([^/]+)/PlaybackInfo", endpoint)
            if playback and playback[1] in items:
                return self.reply({"PlaySessionId": "original-demo-playback", "MediaSources": items[playback[1]]["MediaSources"]})
            video = re.fullmatch(r"/Videos/([^/]+)/(?:stream(?:\.mp4)?|[^/]+/Subtitles/2/(?:0/)?Stream\.(?:srt|vtt))", endpoint)
            if video and video[1] in paths:
                return self.media(paths[video[1]]["subtitle" if "Subtitles" in endpoint else "video"],
                                  "text/plain" if "Subtitles" in endpoint else "video/mp4")
            single = re.fullmatch(r"(?:/Users/[^/]+)?/Items/([^/]+)", endpoint)
            if single and single[1] in items:
                return self.reply(items[single[1]])
            if endpoint.startswith("/Sessions/Playing") or endpoint.startswith("/Users/demo/PlayedItems") or endpoint.startswith("/UserItems/"):
                return self.reply({})
            if endpoint.endswith("/Latest"):
                return self.reply(list(items.values()))
            if endpoint.endswith("/Resume"):
                selected = [item for item in items.values() if item["UserData"]["PlaybackPositionTicks"]]
            elif endpoint in ["/Items", "/Users/demo/Items"]:
                types = query.get("IncludeItemTypes", "Movie").split(",")
                selected = list(items.values()) if "Movie" in types else []
                search = query.get("SearchTerm", query.get("searchTerm"))
                if search:
                    selected = [item for item in selected if search.casefold() in item["Name"].casefold()]
                if "Ids" in query:
                    selected = [item for item in selected if item["Id"] in query["Ids"].split(",")]
                if query.get("Filters") == "IsFavorite":
                    selected = []
            elif endpoint.endswith(("/Similar", "/NextUp", "/Upcoming", "/Seasons", "/Episodes", "/Channels", "/Programs", "/Persons", "/Genres", "/Studios")):
                selected = []
            elif endpoint.endswith(("/Recommendations", "/SpecialFeatures", "/LocalTrailers", "/ThemeMedia")):
                return self.reply({"ThemeVideosResult": {"Items": []}, "ThemeSongsResult": {"Items": []}} if endpoint.endswith("/ThemeMedia") else [])
            elif endpoint in ["/Sessions", "/Plugins", "/Users/Public"]:
                return self.reply([])
            else:
                return self.send_error(404, "Unsupported capture-fixture endpoint")
            start = int(query.get("StartIndex", "0"))
            limit = int(query.get("Limit", "100"))
            return self.reply({"Items": selected[start:start+limit], "TotalRecordCount": len(selected), "StartIndex": start})

        do_GET = handle_api
        do_HEAD = handle_api
        do_POST = handle_api

    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Original-media catalog fixture: http://127.0.0.1:{server.server_port}/", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
