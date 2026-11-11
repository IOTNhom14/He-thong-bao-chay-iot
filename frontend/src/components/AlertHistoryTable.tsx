import React, { useState, useEffect, useCallback } from 'react';
import { AlertApi, type AlertItem } from '../api/alert.api';
import { useAuth } from '../context/AuthContext';
import { useCommandTracker } from '../context/CommandTrackerContext';
import {
  AlertTriangle,
  Flame,
  CheckCircle2,
  RotateCcw,
  Search,
  ShieldAlert,
  Check,
  BellRing,
} from 'lucide-react';

export const AlertHistoryTable: React.FC = () => {
  const { user, isViewer } = useAuth();
  const { acknowledgeAlert } = useCommandTracker();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchDevice, setSearchDevice] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await AlertApi.getAlerts();
      setAlerts(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tải lịch sử cảnh báo';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Xử lý xác nhận giải quyết cảnh báo
  const handleAcknowledge = async (alert: AlertItem) => {
    const alertId = String(alert.id);
    setAcknowledgingId(alertId);
    try {
      const ok = await acknowledgeAlert(alertId, alert.alert_type);
      if (ok) {
        // Cập nhật trạng thái trực tiếp trong danh sách
        setAlerts((prev) =>
          prev.map((item) =>
            item.id === alert.id
              ? {
                  ...item,
                  resolved: true,
                  acknowledged_by: user?.id || user?.username,
                  acknowledged_at: new Date().toISOString(),
                  resolved_at: new Date().toISOString(),
                }
              : item
          )
        );
      }
    } finally {
      setAcknowledgingId(null);
    }
  };

  // Lọc danh sách cảnh báo
  const filteredAlerts = alerts.filter((item) => {
    // Lọc theo từ khóa device_id hoặc message
    const matchesSearch =
      item.device_id.toLowerCase().includes(searchDevice.toLowerCase()) ||
      item.message.toLowerCase().includes(searchDevice.toLowerCase()) ||
      item.alert_type.toLowerCase().includes(searchDevice.toLowerCase());
    if (!matchesSearch) return false;

    // Lọc theo trạng thái
    if (statusFilter === 'UNRESOLVED' && item.resolved) return false;
    if (statusFilter === 'RESOLVED' && !item.resolved) return false;

    // Lọc theo mức độ nghiêm trọng
    if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Thanh công cụ lọc & tìm kiếm */}
      <div className="p-3 rounded-md bg-[#111318] border border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Lọc Trạng thái */}
          <div className="flex items-center gap-1 bg-[#090a0f] p-0.5 rounded border border-zinc-800 font-mono text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'ALL' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Tất cả ({alerts.length})
            </button>
            <button
              onClick={() => setStatusFilter('UNRESOLVED')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'UNRESOLVED'
                  ? 'bg-red-950 text-red-300 border border-red-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Đang xảy ra ({alerts.filter((a) => !a.resolved).length})
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'RESOLVED'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Đã xử lý ({alerts.filter((a) => a.resolved).length})
            </button>
          </div>

          {/* Lọc Mức độ */}
          <div className="flex items-center gap-1 bg-[#090a0f] p-0.5 rounded border border-zinc-800 font-mono text-xs">
            {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  severityFilter === sev ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {sev === 'ALL' && 'Mọi mức độ'}
                {sev === 'CRITICAL' && 'Khẩn cấp'}
                {sev === 'WARNING' && 'Cảnh báo'}
                {sev === 'INFO' && 'Thông tin'}
              </button>
            ))}
          </div>
        </div>

        {/* Ô tìm kiếm & Nút làm mới */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo thiết bị, thông điệp..."
              value={searchDevice}
              onChange={(e) => setSearchDevice(e.target.value)}
              className="w-full bg-[#090a0f] border border-zinc-800 rounded pl-8 pr-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <button
            onClick={fetchAlerts}
            disabled={isLoading}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title="Làm mới danh sách"
          >
            <RotateCcw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Bảng danh sách cảnh báo */}
      {isLoading && alerts.length === 0 ? (
        <div className="p-16 text-center rounded-md border border-zinc-800 bg-[#111318] flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-400">Đang nạp dữ liệu nhật ký sự cố...</span>
        </div>
      ) : errorMsg ? (
        <div className="p-6 rounded-md bg-red-950/40 border border-red-800 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm font-semibold text-red-200">{errorMsg}</p>
          <button
            onClick={fetchAlerts}
            className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="py-16 text-center rounded-md border border-zinc-800 bg-[#111318]">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-zinc-100 mb-1">Hệ thống an toàn</h3>
          <p className="text-xs text-zinc-400">Không có sự cố hoặc cảnh báo nào phù hợp với bộ lọc hiện tại.</p>
        </div>
      ) : (
        <div className="bg-[#111318] border border-zinc-800 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#090a0f] text-zinc-400 uppercase tracking-wider font-mono text-[11px] border-b border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">Mã & Node ID</th>
                  <th className="py-2.5 px-3">Loại sự cố</th>
                  <th className="py-2.5 px-3">Thông điệp cảnh báo</th>
                  <th className="py-2.5 px-3">Mức độ</th>
                  <th className="py-2.5 px-3">Trạng thái</th>
                  <th className="py-2.5 px-3">Thời gian phát hiện</th>
                  <th className="py-2.5 px-3">Xác nhận bởi</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 font-mono text-xs tabular-nums">
                {filteredAlerts.map((alert) => {
                  const isCritical = alert.severity === 'CRITICAL';
                  const isWarning = alert.severity === 'WARNING';

                  return (
                    <tr
                      key={alert.id}
                      className={`hover:bg-zinc-800/40 transition-colors ${
                        !alert.resolved ? 'bg-red-950/20' : ''
                      }`}
                    >
                      {/* Mã & Thiết bị */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-bold text-zinc-100">#{alert.id}</div>
                        <div className="text-[11px] text-zinc-400">{alert.device_id}</div>
                      </td>

                      {/* Loại sự cố */}
                      <td className="py-2 px-3 whitespace-nowrap font-sans">
                        <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                          {alert.alert_type === 'FLAME' && <Flame className="w-3.5 h-3.5 text-red-400" />}
                          {alert.alert_type === 'HIGH_GAS' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                          {alert.alert_type === 'HIGH_TEMP' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                          {alert.alert_type}
                        </span>
                      </td>

                      {/* Thông điệp */}
                      <td className="py-2 px-3 font-sans">
                        <div className="text-zinc-200 max-w-xs sm:max-w-md">{alert.message}</div>
                      </td>

                      {/* Mức độ nghiêm trọng */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                            isCritical
                              ? 'bg-red-950 text-red-300 border-red-700'
                              : isWarning
                              ? 'bg-amber-950 text-amber-300 border-amber-700'
                              : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {alert.resolved ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800 text-[10px]">
                            <Check size={12} />
                            Đã giải quyết
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-300 font-bold bg-red-950 px-1.5 py-0.2 rounded border border-red-700 text-[10px]">
                            <BellRing size={12} />
                            ĐANG XẢY RA
                          </span>
                        )}
                      </td>

                      {/* Thời gian phát hiện */}
                      <td className="py-2 px-3 whitespace-nowrap text-zinc-400 text-[11px]">
                        {new Date(alert.created_at).toLocaleString('vi-VN')}
                      </td>

                      {/* Người xác nhận */}
                      <td className="py-2 px-3 whitespace-nowrap text-zinc-400 text-[11px]">
                        {alert.resolved ? (
                          <div>
                            <span className="text-zinc-200 font-medium">
                              {alert.acknowledged_by ? `User: ${alert.acknowledged_by.slice(0, 8)}...` : 'Hệ thống'}
                            </span>
                            {alert.acknowledged_at && (
                              <div className="text-[10px] text-zinc-500">
                                {new Date(alert.acknowledged_at).toLocaleTimeString('vi-VN')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">Chưa xác nhận</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-2 px-3 whitespace-nowrap text-right font-sans">
                        {alert.resolved ? (
                          <span className="text-zinc-500 text-xs italic">Đã giải quyết</span>
                        ) : isViewer ? (
                          <button
                            disabled
                            className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-600 text-xs cursor-not-allowed opacity-50 flex items-center gap-1 ml-auto"
                            title="Tài khoản Viewer: Không có quyền giải quyết cảnh báo"
                          >
                            <ShieldAlert size={13} />
                            <span>Khóa (403)</span>
                          </button>
                        ) : (
                          <button
                            disabled={acknowledgingId === String(alert.id)}
                            onClick={() => handleAcknowledge(alert)}
                            className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs border border-emerald-600 transition-colors flex items-center gap-1 ml-auto disabled:opacity-50"
                          >
                            <Check size={13} />
                            <span>{acknowledgingId === String(alert.id) ? 'Lưu...' : 'Xác nhận xử lý'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
