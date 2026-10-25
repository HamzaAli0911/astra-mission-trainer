"""Quality-control save server: the ?debug harness (src/dev/qc.ts) posts screenshots and
numbers here. Usage: python3 tools/qc/shotserver.py [output folder]  (default ~/Downloads/ASTRA-HOME-QC)."""
import base64, http.server, json, os, sys, urllib.parse

OUT = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/ASTRA-HOME-QC")
os.makedirs(os.path.join(OUT, "shots"), exist_ok=True)


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = os.path.basename(q.get("name", ["shot"])[0])
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        if body.startswith("data:image"):
            ext = ".png" if body.startswith("data:image/png") else ".jpg"
            with open(os.path.join(OUT, "shots", name + ext), "wb") as f:
                f.write(base64.b64decode(body.split(",", 1)[1]))
        else:
            # Numbers (timings, overlap scans, memory): pretty-printed JSON.
            with open(os.path.join(OUT, name + ".json"), "w") as f:
                json.dump(json.loads(body), f, indent=2)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass


print("Saving to", OUT)
http.server.HTTPServer(("127.0.0.1", 8799), Handler).serve_forever()
