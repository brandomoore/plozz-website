import http.client
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import urllib.parse
import json


class DemoServerTests(unittest.TestCase):
    def test_read_only_revision_checked_media(self):
        script = Path(__file__).resolve().parents[2] / "tools/serve-demo-catalog.py"
        with tempfile.TemporaryDirectory(prefix="plozz-demo-server-") as folder:
            root = Path(folder)
            movie = root / "Movies" / "Original film"
            movie.mkdir(parents=True)
            (movie / "original.mp4").write_bytes(b"original-media-bytes")
            (movie / "movie.nfo").write_text("<movie><title>Original film</title><plot>An original scene.</plot></movie>")
            (movie / "poster.jpg").write_bytes(b"original-poster")
            (movie / "fanart.jpg").write_bytes(b"original-backdrop")
            (movie / "original.srt").write_text("An original caption.")
            process = subprocess.Popen(
                [sys.executable, str(script), "--root", str(root), "--port", "0"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
            )
            try:
                line = process.stdout.readline()
                self.assertIn("http://127.0.0.1:", line)
                url = urllib.parse.urlsplit(line.split(": ", 1)[1].strip())

                def request(method, path, headers=None):
                    conn = http.client.HTTPConnection(url.hostname, url.port, timeout=5)
                    try:
                        conn.request(method, path, headers=headers or {})
                        response = conn.getresponse()
                        return response.status, dict(response.getheaders()), response.read()
                    finally:
                        conn.close()

                status, _, body = request("GET", "/Users/demo/Items?IncludeItemTypes=Movie")
                self.assertEqual(status, 200)
                item = json.loads(body)["Items"][0]
                self.assertEqual(item["Name"], "Original film")
                self.assertEqual(item["ProviderIds"], {})
                self.assertEqual(request("GET", "/Items/original-0/Images/Primary")[2], b"original-poster")
                self.assertEqual(request("GET", "/Items/original-0/Images/Backdrop")[2], b"original-backdrop")
                self.assertEqual(request("GET", "/Videos/original-0/original-0/Subtitles/2/0/Stream.srt")[2], b"An original caption.")
                self.assertEqual(json.loads(request("GET", "/Users/demo/Items?searchTerm=unmatched")[2])["Items"], [])
                status, headers, body = request("GET", "/Videos/original-0/stream.mp4", {"Range": "bytes=0-7"})
                self.assertEqual(status, 206)
                self.assertEqual(body, b"original")
                self.assertEqual(headers["Content-Range"], "bytes 0-7/20")
                self.assertEqual(request("GET", "/Videos/original-0/stream.mp4", {"Range": "bytes=999-1000"})[0], 416)
                self.assertEqual(request("HEAD", "/Videos/original-0/stream.mp4")[2], b"")
                self.assertEqual(request("GET", "/%2e%2e/outside")[0], 404)
                self.assertEqual(request("PUT", "/original.mp4")[0], 501)
                self.assertEqual((movie / "original.mp4").read_bytes(), b"original-media-bytes")
            finally:
                process.terminate()
                process.wait(timeout=5)
                process.stdout.close()


if __name__ == "__main__":
    unittest.main()
