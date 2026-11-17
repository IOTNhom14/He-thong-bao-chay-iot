from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.core.database import supabase
from app.core.security import require_roles

router = APIRouter(prefix="/audit-logs", tags=["Nhật Ký Kiểm Toán (Audit Logs)"])

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
        query = supabase.table("audit_logs").select("*", count="exact")
        if action and action != "ALL":
            query = query.ilike("action", f"%{action}%")
        if username:
            query = query.ilike("user_id", f"%{username}%")
        if from_date:
            query = query.gte("created_at", from_date)
        if to_date:
            query = query.lte("created_at", to_date)
        
        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        res = query.execute()

        raw_data = res.data or []
        formatted_logs = [
            {
                "id": str(item.get("id")),
                "user_id": str(item.get("user_id")),
                "username": str(item.get("user_id")),
                "action": str(item.get("action")),
                "target": "SYSTEM",
                "ip": item.get("ip_address") or "127.0.0.1",
                "success": True,
                "detail": {},
                "created_at": item.get("created_at"),
            }
            for item in raw_data
        ]
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
