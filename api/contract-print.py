"""Generate print copies without signing, issuing, collecting, or archiving."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError
import importlib.util
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('contract_print_common',ROOT/'api/official-document.py')
common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
from lib.contract_print_pdf import prepare_print, SourceChanged

class handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def respond(self,status,body,mime='application/json',pages=None):
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(body)))
        if pages is not None:
            self.send_header('X-Aqari-PDF-Pages',str(pages))
            self.send_header('Content-Disposition','inline; filename="contract.pdf"')
        self.end_headers();self.wfile.write(body)
    def do_POST(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=4096:
                raise ValueError('INVALID_REQUEST')
            pdf,pages=prepare_print(json.loads(self.rfile.read(size)),self.headers.get('Authorization'),read=common.upstream)
            self.respond(200,pdf,'application/pdf',pages)
        except SourceChanged:
            self.respond(409,b'{"error":"CONTRACT_SOURCE_CHANGED"}')
        except PermissionError:
            self.respond(403,b'{"error":"ACCESS_DENIED"}')
        except HTTPError as error:
            self.respond(403 if error.code in (401,403) else 502,b'{"error":"PDF_PREPARATION_FAILED"}')
        except Exception:
            self.respond(400,b'{"error":"PDF_PREPARATION_FAILED"}')
