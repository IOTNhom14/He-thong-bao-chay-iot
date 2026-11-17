import re
from typing import Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Query

from app.core.database import supabase
from app.core.security import require_roles

router = APIRouter(prefix="/audit-logs", tags=["Nhật Ký Kiểm Toán (Audit Logs)"])

# Ánh xạ khóa lọc chuẩn sang các prefix thực tế đã lưu trong DB (tương thích ngược)
ACTION_FILTER_PATTERNS: Dict[str, List[str]] = {
    "LOGIN_SUCCESS": ["LOGIN_SUCCESS"],
    "LOGIN_FAILED": ["LOGIN_FAILED"],
    "SEND_COMMAND": ["SEND_COMMAND", "COMMAND_SENT"],
    "COMMAND_SENT": ["SEND_COMMAND", "COMMAND_SENT"],
    "UPDATE_THRESHOLDS": ["UPDATE_THRESHOLDS", "THRESHOLD_CHANGED"],
    "THRESHOLD_CHANGED": ["UPDATE_THRESHOLDS", "THRESHOLD_CHANGED"],
    "CREATE_USER": ["CREATE_USER", "USER_CREATED"],
    "USER_CREATED": ["CREATE_USER", "USER_CREATED"],
    "DELETE_USER": ["DELETE_USER", "USER_DELETED"],
    "USER_DELETED": ["DELETE_USER", "USER_DELETED"],
    "UPDATE_ROLE": ["UPDATE_ROLE"],
    "STATUS_USER": ["STATUS_USER"],
    "ASSIGN_DEVICE": ["ASSIGN_DEVICE"],
    "REMOVE_DEVICE": ["REMOVE_DEVICE"],
    "ACK_ALERT": ["ACK_ALERT", "ALERT_ACKNOWLEDGED"],
    "ALERT_ACKNOWLEDGED": ["ACK_ALERT", "ALERT_ACKNOWLEDGED"],
    "ONBOARD_DEVICE": ["ONBOARD_DEVICE", "DEVICE_CREATED"],
    "DEVICE_CREATED": ["ONBOARD_DEVICE", "DEVICE_CREATED"],
    "CHANGE_STATUS": ["CHANGE_STATUS"],
    "DEVICE_DECOMMISSIONED": ["->DECOMMISSIONED", "DEVICE_DECOMMISSIONED"],
    "DELETE_DEVICE_LINK": ["DELETE_DEVICE_LINK"],
    "LINK_CAMERA": ["LINK_CAMERA", "UNLINK_CAMERA"],
    "PROVISION_DEVICE": ["PROVISION_DEVICE"],
    "TEST_CAMERA_SNAPSHOT": ["TEST_CAMERA_SNAPSHOT"],
}

_POSTGREST_UNSAFE_RE = re.compile(r"[,()*%\"'\\]")


def _sanitize_filter_token(value: str) -> str:
    return _POSTGREST_UNSAFE_RE.sub("", value.strip())


def _load_user_directory() -> Tuple[Dict[str, str], List[Dict[str, str]]]:
    user_map: Dict[str, str] = {}
    records: List[Dict[str, str]] = []
    try:
        res = supabase.table("users").select("id, username, email").execute()
        for row in res.data or []:
            uid = str(row.get("id") or "")
            if not uid:
                continue
            email = str(row.get("email") or "")
            uname = str(row.get("username") or (email.split("@")[0] if email else uid))
            user_map[uid] = uname
            records.append({"id": uid, "username": uname.lower(), "email": email.lower()})
    except Exception as exc:
        print(f"[AUDIT USER LOOKUP ERROR]: {exc}")
    return user_map, records


def _parse_audit_action(raw_action: str) -> Tuple[str, str, bool]:
    action_str = raw_action.strip()
    if ":" in action_str:
        prefix, target = action_str.split(":", 1)
    else:
        prefix, target = action_str, "SYSTEM"
    is_success = "FAILED" not in prefix.upper()
    return prefix, target or "SYSTEM", is_success


@router.get("", summary="Lấy danh sách nhật ký kiểm toán (Chỉ ADMIN)")
def get_audit_logs(
    action: Optional[str] = Query(None, description="Lọc theo hành động"),
    username: Optional[str] = Query(None, description="Lọc theo user_id hoặc username"),
    from_date: Optional[str] = Query(None, alias="from", description="Từ thời điểm (ISO 8601)"),
    to_date: Optional[str] = Query(None, alias="to", description="Đến thời điểm (ISO 8601)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_roles(["ADMIN"])),
):
    try:
        user_map, user_records = _load_user_directory()
        query = supabase.table("audit_logs").select("*", count="exact")
        or_groups: List[str] = []

        if action and action != "ALL":
            action_key = action.strip().upper()
            patterns = ACTION_FILTER_PATTERNS.get(action_key)
            if patterns:
                if len(patterns) == 1:
                    query = query.ilike("action", f"%{patterns[0]}%")
                else:
                    or_groups.append(",".join(f"action.ilike.*{p}*" for p in patterns))
            else:
                safe_action = _sanitize_filter_token(action)
                if safe_action:
                    query = query.ilike("action", f"%{safe_action}%")

        if username and username.strip():
            search_lower = username.strip().lower()
            safe_search = _sanitize_filter_token(username)
            matched_ids = [
                rec["id"]
                for rec in user_records
                if search_lower in rec["username"]
                or search_lower in rec["email"]
                or search_lower in rec["id"].lower()
            ]
            user_conds: List[str] = []
            if matched_ids:
                user_conds.append(f"user_id.in.({','.join(matched_ids)})")
            if safe_search:
                user_conds.append(f"user_id.ilike.*{safe_search}*")
            if len(user_conds) == 1 and not matched_ids:
                query = query.ilike("user_id", f"%{safe_search}%")
            elif user_conds:
                or_groups.append(",".join(user_conds))

        if len(or_groups) == 1:
            query = query.or_(or_groups[0])
        elif len(or_groups) > 1:
            compound = ",".join(f"or({grp})" for grp in or_groups)
            query.params = query.params.add("and", f"({compound})")

        if from_date:
            query = query.gte("created_at", from_date)
        if to_date:
            query = query.lte("created_at", to_date)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        res = query.execute()

        raw_data = res.data or []
        formatted_logs = []
        for item in raw_data:
            raw_uid = str(item.get("user_id") or "")
            raw_action = str(item.get("action") or "")
            action_name, target_value, is_success = _parse_audit_action(raw_action)
            formatted_logs.append(
                {
                    "id": str(item.get("id")),
                    "user_id": raw_uid,
                    "username": user_map.get(raw_uid, raw_uid),
                    "action": action_name,
                    "target": target_value,
                    "ip": item.get("ip_address") or "127.0.0.1",
                    "success": is_success,
                    "detail": {"raw_action": raw_action},
                    "created_at": item.get("created_at"),
                }
            )
        return {
            "success": True,
            "total": res.count if res.count is not None else len(formatted_logs),
            "data": formatted_logs,
        }
    except Exception as exc:
        print(f"[AUDIT LOGS FETCH ERROR]: {exc}")
        return {
            "success": True,
            "total": 0,
            "data": [],
        }
