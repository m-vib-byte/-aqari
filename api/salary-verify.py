"""Public minimal salary-voucher verification. It never returns employee identity or amounts."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from urllib.request import Request,urlopen
import html,json,re

ROOT=Path(__file__).resolve().parents[1]
UUID=re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",re.I)
def config():
    source=(ROOT/"lib/release-config.js").read_text();url=re.search(r"url:\s*'([^']+)'",source).group(1);key=re.search(r"publishableKey:\s*'([^']+)'",source).group(1);return url,key
def verify(token):
    if not UUID.fullmatch(token): return {"valid":False,"status":"invalid"}
    url,key=config();body=json.dumps({"p_token":token}).encode();request=Request(url+"/rest/v1/rpc/aqari_salary_verify",data=body,headers={"apikey":key,"Content-Type":"application/json"},method="POST")
    with urlopen(request,timeout=6) as response:return json.loads(response.read(16385))
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:data=verify(parse_qs(urlparse(self.path).query).get("token",[""])[0]);status=html.escape(str(data.get("status","not_found")));voucher=html.escape(str(data.get("voucher_no","—")));month=html.escape(str(data.get("month","—"))[:7]);valid=data.get("valid") is True
        except Exception:data={};status="unavailable";voucher=month="—";valid=False
        page=f'''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>التحقق من سند الراتب</title><style>body{{font-family:system-ui;background:#f6f1e8;color:#2c241b;margin:0;padding:24px}}main{{max-width:620px;margin:auto;background:white;border:1px solid #d7bd8c;border-radius:20px;padding:28px}}strong{{color:{'#176b45' if valid else '#a3261d'}}}</style><main><h1>عقاري — التحقق من سند الراتب</h1><p><strong>{'السند صحيح وفعال' if valid else 'السند غير فعال أو غير موجود'}</strong></p><p>الحالة: {status}</p><p>رقم السند: {voucher}</p><p>الشهر: {month}</p><small>لا تعرض صفحة التحقق أي بيانات شخصية أو مبالغ.</small></main></html>'''.encode()
        self.send_response(200);self.send_header("Content-Type","text/html; charset=utf-8");self.send_header("Cache-Control","no-store");self.send_header("X-Content-Type-Options","nosniff");self.send_header("Content-Length",str(len(page)));self.end_headers();self.wfile.write(page)

