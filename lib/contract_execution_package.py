"""Prepare immutable execution PDFs; the final app-state transaction consumes them."""
from datetime import datetime, timezone
from decimal import Decimal
import base64
import hashlib
import re

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
AUTH = re.compile(r"Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
LIMIT = 2 * 1024 * 1024

def prepare(data, auth, *, read, commit, render_document, render_receipt, verify_receipt):
    keys = {"workspaceId", "contractRef", "settlementId", "documentId", "packageId",
            "preparedAt", "receiptNo", "receiptSequence", "receiptArtifacts"}
    if not isinstance(data, dict) or set(data) != keys:
        raise ValueError("INVALID_REQUEST")
    for key in ("workspaceId", "settlementId", "documentId", "packageId"):
        if not isinstance(data[key], str) or not UUID.fullmatch(data[key]):
            raise ValueError("INVALID_REQUEST")
    if (not isinstance(data["contractRef"], str) or not 1 <= len(data["contractRef"]) <= 200
            or any(ord(c) < 32 for c in data["contractRef"])):
        raise ValueError("INVALID_REQUEST")
    if not isinstance(auth, str) or len(auth) > 8192 or not AUTH.fullmatch(auth):
        raise PermissionError("AUTH_REQUIRED")
    if not isinstance(data["preparedAt"], str):
        raise ValueError("INVALID_REQUEST")
    prepared = datetime.fromisoformat(data["preparedAt"].replace("Z", "+00:00"))
    if prepared.tzinfo is None or not -60 <= (datetime.now(timezone.utc) - prepared).total_seconds() <= 600:
        raise ValueError("INVALID_PREPARATION_TIME")
    if not isinstance(data["receiptNo"], str) or len(data["receiptNo"]) > 100:
        raise ValueError("INVALID_REQUEST")
    if data["receiptSequence"] is not None and (type(data["receiptSequence"]) is not int or data["receiptSequence"] < 1):
        raise ValueError("INVALID_REQUEST")
    user = read("/auth/v1/user", auth)
    uid = user.get("id") if isinstance(user, dict) else None
    if not isinstance(uid, str) or not UUID.fullmatch(uid):
        raise PermissionError("AUTH_REQUIRED")
    query = {"p_workspace_id": data["workspaceId"], "p_contract_ref": data["contractRef"],
             "p_settlement_id": data["settlementId"], "p_contract_document_id": data["documentId"],
             "p_prepared_at": data["preparedAt"], "p_receipt_no": data["receiptNo"],
             "p_contract_receipt_sequence": data["receiptSequence"]}
    path = "/rest/v1/rpc/aqari_contract_execution_package_source"
    source = read(path, auth, query)
    expected = {"workspace_id": data["workspaceId"], "contract_ref": data["contractRef"],
                "settlement_id": data["settlementId"], "contract_document_id": data["documentId"],
                "actor_id": uid, "receipt_no": data["receiptNo"],
                "contract_receipt_sequence": data["receiptSequence"]}
    if not isinstance(source, dict) or any(source.get(k) != v for k, v in expected.items()):
        raise PermissionError("EXECUTION_SOURCE_SCOPE_MISMATCH")
    if datetime.fromisoformat(source["prepared_at"].replace("Z", "+00:00")) != prepared:
        raise ValueError("EXECUTION_SOURCE_TIME_MISMATCH")
    payload = {"p_package_id": data["packageId"], "p_actor_id": uid, "p_source": source,
               "p_receipt_artifacts": data["receiptArtifacts"], "p_renderer_version": "v267-execution-package-1"}

    def pdf_fields(name, pdf):
        if not isinstance(pdf, bytes) or not 8 <= len(pdf) <= LIMIT or not pdf.startswith(b"%PDF-"):
            raise ValueError("INVALID_RENDERED_PDF")
        return {"p_" + name + "_pdf_base64": base64.b64encode(pdf).decode(),
                "p_" + name + "_pdf_sha256": hashlib.sha256(pdf).hexdigest()}

    rent = Decimal(str(source["amounts"]["rent"]))
    if not rent.is_finite() or rent < 0:
        raise ValueError("INVALID_RENT_AMOUNT")
    artifacts = data["receiptArtifacts"]
    if rent > 0:
        if not isinstance(artifacts, dict) or set(artifacts) != {"record", "ledger", "receipt"}:
            raise ValueError("EXECUTION_RECEIPT_REQUIRED")
        receipt = artifacts["receipt"]
        if (not isinstance(receipt, dict) or receipt.get("contract") != source["signed_contract_snapshot"]
                or receipt.get("id") != data["receiptNo"]
                or receipt.get("contractReceiptSequence") != data["receiptSequence"]
                or artifacts["ledger"].get("contractReceiptSequence") != data["receiptSequence"]
                or receipt.get("record") != artifacts["record"]):
            raise ValueError("EXECUTION_RECEIPT_MISMATCH")
        candidate = {"rentReceiptsV267": [receipt], "collections": [artifacts["record"]],
                     "contractsV202": [source["signed_contract_snapshot"]], "rentLedgerV202": [artifacts["ledger"]]}
        verified = verify_receipt(candidate, data["receiptNo"])
        if Decimal(str(artifacts["record"][2])) != rent:
            raise ValueError("EXECUTION_RECEIPT_AMOUNT_MISMATCH")
        payload.update(pdf_fields("receipt", render_receipt(verified)))
    elif artifacts is not None or data["receiptNo"] or data["receiptSequence"] is not None:
        raise ValueError("EXECUTION_FAKE_RECEIPT")
    else:
        payload.update({"p_receipt_pdf_base64": None, "p_receipt_pdf_sha256": None})

    for role in ("tenant", "owner"):
        doc = source[role + "_document"]
        if (not isinstance(doc, dict) or doc.get("payload", {}).get("copyRole") != role
                or doc.get("payload", {}).get("contractSnapshot") != source["signed_contract_snapshot"]):
            raise ValueError("EXECUTION_DOCUMENT_MISMATCH")
        series = {"document_no": doc["document_no"], "kind": "contract", "status": "issued"}
        payload.update(pdf_fields(role, render_document(series, {**doc, "version": 1})))
    # Reauthorize/revalidate after rendering, before sending privileged bytes.
    if read(path, auth, query) != source:
        raise ValueError("EXECUTION_SOURCE_CHANGED")
    result = commit(payload)
    if not isinstance(result, dict) or result.get("package_id") != data["packageId"]:
        raise ValueError("EXECUTION_PACKAGE_NOT_CONFIRMED")
    expires = datetime.fromisoformat(result["expires_at"].replace("Z", "+00:00"))
    if expires.tzinfo is None or expires <= datetime.now(timezone.utc):
        raise ValueError("EXECUTION_PACKAGE_EXPIRED")
    return {"packageId": result["package_id"], "workspaceId": data["workspaceId"],
            "contractRef": data["contractRef"], "settlementId": data["settlementId"],
            "expiresAt": result["expires_at"]}
