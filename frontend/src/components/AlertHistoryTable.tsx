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
      <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Lọc Trạng thái */}
          <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                statusFilter === 'ALL' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Tất cả ({alerts.length})
            </button>
            <button
              onClick={() => setStatusFilter('UNRESOLVED')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                statusFilter === 'UNRESOLVED'
                  ? 'bg-red-950 text-red-400 border border-red-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Đang xảy ra ({alerts.filter((a) => !a.resolved).length})
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                statusFilter === 'RESOLVED'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Đã xử lý ({alerts.filter((a) => a.resolved).length})
            </button>
          </div>

          {/* Lọc Mức độ */}
          <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
            {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
                  severityFilter === sev ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
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
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo thiết bị, thông điệp..."
              value={searchDevice}
              onChange={(e) => setSearchDevice(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
            />
          </div>

          <button
            onClick={fetchAlerts}
            disabled={isLoading}
            className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            title="Làm mới danh sách"
          >
            <RotateCcw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Bảng danh sách cảnh báo */}
      {isLoading && alerts.length === 0 ? (
        <div className="p-16 text-center glass-panel rounded-2xl border border-gray-800 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400">Đang nạp dữ liệu nhật ký sự cố...</span>
        </div>
      ) : errorMsg ? (
        <div className="p-6 rounded-2xl bg-red-950/40 border border-red-500/40 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm font-semibold text-red-200">{errorMsg}</p>
          <button
            onClick={fetchAlerts}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all"
          >
            Thử lại
          </button>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="py-20 text-center glass-panel rounded-2xl border border-gray-800">
          <CheckCircle2 className="w-12 h-12 text-emerald-400/60 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Hệ thống an toàn tuyệt đối</h3>
          <p className="text-xs text-gray-400">Không có sự cố hoặc cảnh báo nào phù hợp với bộ lọc hiện tại.</p>
        </div>
      ) : (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-gray-950/90 text-gray-400 uppercase tracking-wider font-semibold border-b border-gray-800">
                <tr>
                  <th className="p-3.5">Mã & Thiết bị</th>
                  <th className="p-3.5">Loại sự cố</th>
                  <th className="p-3.5">Thông điệp cảnh báo</th>
                  <th className="p-3.5">Mức độ</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5">Thời gian phát hiện</th>
                  <th className="p-3.5">Người xác nhận</th>
                  <th className="p-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredAlerts.map((alert) => {
                  const isCritical = alert.severity === 'CRITICAL';
                  const isWarning = alert.severity === 'WARNING';

                  return (
                    <tr
                      key={alert.id}
                      className={`hover:bg-gray-800/40 transition-colors ${
                        !alert.resolved ? 'bg-red-950/10' : ''
                      }`}
                    >
                      {/* Mã & Thiết bị */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-cyan-400">#{alert.id}</div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{alert.device_id}</div>
                      </td>

                      {/* Loại sự cố */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          {alert.alert_type === 'FLAME' && <Flame className="w-4 h-4 text-red-500 animate-pulse" />}
                          {alert.alert_type === 'HIGH_GAS' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                          {alert.alert_type === 'HIGH_TEMP' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                          {alert.alert_type}
                        </span>
                      </td>

                      {/* Thông điệp */}
                      <td className="p-3.5">
                        <div className="font-medium text-gray-200 max-w-xs sm:max-w-md">{alert.message}</div>
                      </td>

                      {/* Mức độ nghiêm trọng */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            isCritical
                              ? 'bg-red-950 text-red-300 border-red-500/50'
                              : isWarning
                              ? 'bg-amber-950 text-amber-300 border-amber-500/50'
                              : 'bg-blue-950 text-blue-300 border-blue-500/50'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td className="p-3.5 whitespace-nowrap">
                        {alert.resolved ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                            <Check size={13} />
                            Đã giải quyết
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 font-bold bg-red-950/80 px-2 py-0.5 rounded border border-red-500/50 animate-pulse">
                            <BellRing size={13} />
                            ĐANG XẢY RA
                          </span>
                        )}
                      </td>

                      {/* Thời gian phát hiện */}
                      <td className="p-3.5 whitespace-nowrap text-gray-400 font-mono text-[11px]">
                        {new Date(alert.created_at).toLocaleString('vi-VN')}
                      </td>

                      {/* Người xác nhận */}
                      <td className="p-3.5 whitespace-nowrap text-gray-400 text-[11px]">
                        {alert.resolved ? (
                          <div>
                            <span className="text-gray-200 font-medium">
                              {alert.acknowledged_by ? `User: ${alert.acknowledged_by.slice(0, 8)}...` : 'Hệ thống'}
                            </span>
                            {alert.acknowledged_at && (
                              <div className="text-[10px] text-gray-500 font-mono">
                                {new Date(alert.acknowledged_at).toLocaleTimeString('vi-VN')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600 italic">Chưa xác nhận</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="p-3.5 whitespace-nowrap text-right">
                        {alert.resolved ? (
                          <span className="text-gray-500 text-xs italic">Đã xử lý xong</span>
                        ) : isViewer ? (
                          <button
                            disabled
                            className="px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-600 text-xs cursor-not-allowed opacity-50 flex items-center gap-1 ml-auto"
                            title="Tài khoản Viewer: Không có quyền giải quyết cảnh báo (Bị chặn 403)"
                          >
                            <ShieldAlert size={14} />
                            Xác nhận (403)
                          </button>
                        ) : (
                          <button
                            disabled={acknowledgingId === String(alert.id)}
                            onClick={() => handleAcknowledge(alert)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md flex items-center gap-1.5 ml-auto disabled:opacity-50"
                          >
                            <Check size={14} />
                            {acknowledgingId === String(alert.id) ? 'Đang lưu...' : 'Xác nhận đã xử lý'}
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
