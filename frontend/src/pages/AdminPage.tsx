import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { UserApi, type UserItem, type CreateUserInput } from '../api/user.api';
import { DeviceApi, type DeviceItem } from '../api/device.api';
import { SettingsApi, type ThresholdSettings } from '../api/settings.api';
import { AuditApi, type AuditLogItem } from '../api/audit.api';
import { useToast } from '../context/ToastContext';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  Users,
  Cpu,
  Sliders,
  FileText,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Shield,
  Search,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Building,
  X,
  Layers,
  Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const AdminPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const { isConnected: wsConnected, connectionStatus, reconnectAttempts } = useWebSocket();

  // Active Tab: USERS | DEVICES | THRESHOLDS | AUDIT
  const [activeTab, setActiveTab] = useState<'USERS' | 'DEVICES' | 'THRESHOLDS' | 'AUDIT'>('USERS');

  // ==========================================
  // TAB 1: QUẢN LÝ NGƯỜI DÙNG & GÁN THIẾT BỊ
  // ==========================================
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState<CreateUserInput>({
    username: '',
    email: '',
    password: '',
    role: 'OPERATOR',
  });
  const [selectedUserForAssign, setSelectedUserForAssign] = useState<UserItem | null>(null);
  const [deviceToAssign, setDeviceToAssign] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const data = await UserApi.getUsers();
      // Nạp kèm danh sách thiết bị được gán cho từng user nếu cần
      const detailedUsers = await Promise.all(
        data.map(async (u) => {
          try {
            const detail = await UserApi.getUserById(u.id);
            return { ...u, assigned_devices: detail.assignedDevices || [] };
          } catch {
            return u;
          }
        })
      );
      setUsers(detailedUsers);
    } catch (err: any) {
      showError('Lỗi lấy danh sách người dùng', err.response?.data?.error || err.message);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [showError]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserData.username || !newUserData.password) {
      showError('Thiếu dữ liệu', 'Vui lòng nhập tên đăng nhập và mật khẩu');
      return;
    }
    try {
      await UserApi.createUser(newUserData);
      showSuccess('Tạo tài khoản thành công', `Đã tạo người dùng ${newUserData.username} (${newUserData.role})`);
      setIsAddUserModalOpen(false);
      setNewUserData({ username: '', email: '', password: '', role: 'OPERATOR' });
      fetchUsers();
    } catch (err: any) {
      showError('Tạo tài khoản thất bại', err.response?.data?.error || err.message);
    }
  };

  const handleToggleUserStatus = async (user: UserItem) => {
    if (user.id === currentUser?.id) {
      showError('Không hợp lệ', 'Bạn không thể tự khóa tài khoản quản trị của chính mình');
      return;
    }
    const nextActive = !user.is_active;
    try {
      await UserApi.updateStatus(user.id, { is_active: nextActive, unlock: nextActive });
      showSuccess(
        'Cập nhật thành công',
        nextActive
          ? `Đã mở khóa và kích hoạt tài khoản ${user.username}`
          : `Đã khóa tài khoản ${user.username}`
      );
      fetchUsers();
    } catch (err: any) {
      showError('Lỗi cập nhật trạng thái', err.response?.data?.error || err.message);
    }
  };

  const handleChangeRole = async (userId: string, newRole: 'ADMIN' | 'OPERATOR' | 'VIEWER') => {
    if (userId === currentUser?.id) {
      showError('Không hợp lệ', 'Không thể tự hạ vai trò tài khoản quản trị của chính mình');
      return;
    }
    try {
      await UserApi.updateRole(userId, newRole);
      showSuccess('Cập nhật vai trò', `Đã đổi vai trò sang ${newRole}`);
      fetchUsers();
    } catch (err: any) {
      showError('Lỗi đổi vai trò', err.response?.data?.error || err.message);
    }
  };

  const handleDeleteUser = async (user: UserItem) => {
    if (user.id === currentUser?.id) {
      showError('Không thể xóa', 'Bạn không thể tự xóa tài khoản của chính mình!');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản ${user.username}?`)) {
      return;
    }
    try {
      await UserApi.deleteUser(user.id);
      showSuccess('Đã xóa người dùng', `Tài khoản ${user.username} đã được xóa khỏi hệ thống.`);
      fetchUsers();
    } catch (err: any) {
      showError('Lỗi xóa người dùng', err.response?.data?.error || err.message);
    }
  };

  const handleAssignDevice = async (userId: string, deviceId: string) => {
    if (!deviceId) return;
    try {
      await UserApi.assignDevice(userId, deviceId);
      showSuccess('Gán thiết bị thành công', `Đã phân quyền thiết bị ${deviceId} cho người dùng`);
      setDeviceToAssign('');
      fetchUsers();
    } catch (err: any) {
      showError('Lỗi gán thiết bị', err.response?.data?.error || err.message);
    }
  };

  const handleRemoveDevice = async (userId: string, deviceId: string) => {
    try {
      await UserApi.removeDevice(userId, deviceId);
      showSuccess('Đã hủy gán', `Đã gỡ quyền truy cập thiết bị ${deviceId}`);
      fetchUsers();
    } catch (err: any) {
      showError('Lỗi hủy gán thiết bị', err.response?.data?.error || err.message);
    }
  };

  // ==========================================
  // TAB 2: QUẢN LÝ THIẾT BỊ
  // ==========================================
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false);
  const [newDeviceData, setNewDeviceData] = useState({
    id: '',
    name: '',
    location: '',
    temp_threshold: 55,
    gas_threshold: 400,
  });

  const fetchDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const data = await DeviceApi.getDevices();
      setDevices(data);
    } catch (err: any) {
      showError('Lỗi lấy danh sách thiết bị', err.response?.data?.error || err.message);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [showError]);

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceData.id || !newDeviceData.name || !newDeviceData.location) {
      showError('Thiếu dữ liệu', 'Vui lòng nhập đầy đủ Mã ID, Tên và Vị trí thiết bị');
      return;
    }
    try {
      await DeviceApi.createDevice(newDeviceData);
      showSuccess('Tạo thiết bị thành công', `Đã thêm thiết bị mới: ${newDeviceData.id}`);
      setIsAddDeviceModalOpen(false);
      setNewDeviceData({ id: '', name: '', location: '', temp_threshold: 55, gas_threshold: 400 });
      fetchDevices();
    } catch (err: any) {
      showError('Tạo thiết bị thất bại', err.response?.data?.error || err.message);
    }
  };

  const handleDecommissionDevice = async (device: DeviceItem) => {
    if (device.status === 'DECOMMISSIONED') {
      showError('Thông báo', 'Thiết bị này đã được thu hồi trước đó.');
      return;
    }
    if (!window.confirm(`Xác nhận hủy vận hành (DECOMMISSION) thiết bị ${device.id}? Trạng thái sẽ được chuyển thành DECOMMISSIONED.`)) {
      return;
    }
    try {
      await DeviceApi.deleteDevice(device.id);
      showSuccess('Thu hồi thiết bị thành công', `Thiết bị ${device.id} đã chuyển trạng thái DECOMMISSIONED.`);
      fetchDevices();
    } catch (err: any) {
      showError('Lỗi thu hồi thiết bị', err.response?.data?.error || err.message);
    }
  };

  // ==========================================
  // TAB 3: NGƯỠNG TOÀN CỤC
  // ==========================================
  const [thresholds, setThresholds] = useState<ThresholdSettings>({ temp_threshold: 55, gas_threshold: 400 });
  const [isLoadingThresholds, setIsLoadingThresholds] = useState(false);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);

  const fetchThresholds = useCallback(async () => {
    setIsLoadingThresholds(true);
    try {
      const data = await SettingsApi.getThresholds();
      setThresholds(data);
    } catch (err: any) {
      showError('Lỗi lấy cấu hình ngưỡng', err.response?.data?.error || err.message);
    } finally {
      setIsLoadingThresholds(false);
    }
  }, [showError]);

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingThresholds(true);
    try {
      const updated = await SettingsApi.updateThresholds(thresholds);
      setThresholds(updated);
      showSuccess(
        'Đã lưu ngưỡng toàn cục',
        `Nhiệt độ: ${updated.temp_threshold}°C • Khí Gas: ${updated.gas_threshold} ppm. Tất cả thiết bị mới sẽ áp dụng ngưỡng này.`
      );
    } catch (err: any) {
      showError('Lưu ngưỡng thất bại', err.response?.data?.error || err.message);
    } finally {
      setIsSavingThresholds(false);
    }
  };

  // ==========================================
  // TAB 4: NHẬT KÝ KIỂM TOÁN (AUDIT LOGS)
  // ==========================================
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [auditUserSearch, setAuditUserSearch] = useState<string>('');
  const [auditFromDate, setAuditFromDate] = useState<string>('');
  const [auditToDate, setAuditToDate] = useState<string>('');
  const [selectedAuditDetail, setSelectedAuditDetail] = useState<AuditLogItem | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const res = await AuditApi.getAuditLogs({
        action: auditActionFilter !== 'ALL' ? auditActionFilter : undefined,
        username: auditUserSearch || undefined,
        from: auditFromDate ? new Date(auditFromDate).toISOString() : undefined,
        to: auditToDate ? new Date(auditToDate).toISOString() : undefined,
        limit: 100,
      });
      setAuditLogs(res.data);
      setTotalLogs(res.total);
    } catch (err: any) {
      showError('Lỗi lấy nhật ký kiểm toán', err.response?.data?.error || err.message);
    } finally {
      setIsLoadingAudit(false);
    }
  }, [auditActionFilter, auditUserSearch, auditFromDate, auditToDate, showError]);

  // Nạp dữ liệu ban đầu theo tab
  useEffect(() => {
    if (activeTab === 'USERS') {
      fetchUsers();
      fetchDevices(); // để lấy danh sách thiết bị gán
    } else if (activeTab === 'DEVICES') {
      fetchDevices();
    } else if (activeTab === 'THRESHOLDS') {
      fetchThresholds();
    } else if (activeTab === 'AUDIT') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchUsers, fetchDevices, fetchThresholds, fetchAuditLogs]);

  // Lọc users hiển thị
  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase())) ||
      u.role.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Lọc devices hiển thị
  const filteredDevices = devices.filter(
    (d) =>
      d.id.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.name.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.location.toLowerCase().includes(deviceSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col selection:bg-red-500 selection:text-white">
      {/* Header Navigation */}
      <Navbar
        wsConnected={wsConnected}
        connectionStatus={connectionStatus}
        reconnectAttempts={reconnectAttempts}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Banner tiêu đề trang Quản trị Admin */}
        <div className="p-5 rounded-3xl glass-panel border border-red-500/30 bg-gradient-to-r from-red-950/40 via-gray-900/80 to-gray-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-lg shadow-red-500/30">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-wide">TRUNG TÂM QUẢN TRỊ HỆ THỐNG</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-900/80 text-red-300 border border-red-600/50 font-bold font-mono">
                  CHỈ DÀNH CHO ADMIN
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Quản lý người dùng & phân quyền thiết bị • Quản lý thiết bị • Ngưỡng toàn cục • Nhật ký Audit Logs an ninh
              </p>
            </div>
          </div>

          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold transition-all shadow-md active:scale-95 border border-gray-700"
          >
            <Layers size={16} className="text-cyan-400" />
            Quay lại Giám sát Dashboard
          </Link>
        </div>

        {/* 4 Tabs Quản trị */}
        <div className="flex items-center gap-2 border-b border-gray-800 pb-2 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('USERS')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              activeTab === 'USERS'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <Users size={16} />
            <span>Người dùng & Gán thiết bị ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              activeTab === 'DEVICES'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <Cpu size={16} />
            <span>Quản lý Thiết bị ({devices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('THRESHOLDS')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              activeTab === 'THRESHOLDS'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <Sliders size={16} />
            <span>Ngưỡng toàn cục</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              activeTab === 'AUDIT'
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <FileText size={16} />
            <span>Nhật ký Audit Logs ({totalLogs})</span>
          </button>
        </div>

        {/* ================================================================= */}
        {/* NỘI DUNG TAB 1: QUẢN LÝ NGƯỜI DÙNG & GÁN THIẾT BỊ                 */}
        {/* ================================================================= */}
        {activeTab === 'USERS' && (
          <div className="space-y-5">
            {/* Thanh công cụ tìm kiếm và tạo user mới */}
            <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo tên đăng nhập, email, vai trò..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={fetchUsers}
                  disabled={isLoadingUsers}
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  title="Làm mới"
                >
                  <RotateCcw size={16} className={isLoadingUsers ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={() => setIsAddUserModalOpen(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  <Plus size={16} />
                  Thêm Người dùng mới
                </button>
              </div>
            </div>

            {/* Bảng danh sách người dùng */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-950/90 text-gray-400 uppercase tracking-wider font-semibold border-b border-gray-800">
                    <tr>
                      <th className="p-3.5">Tên đăng nhập & Email</th>
                      <th className="p-3.5">Vai trò (Role)</th>
                      <th className="p-3.5">Trạng thái</th>
                      <th className="p-3.5">Thiết bị phụ trách (user_devices)</th>
                      <th className="p-3.5">Ngày tạo</th>
                      <th className="p-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {filteredUsers.map((u) => {
                      const isMe = u.id === currentUser?.id;
                      const assignedList = u.assigned_devices || [];

                      return (
                        <tr key={u.id} className="hover:bg-gray-800/40 transition-colors">
                          {/* Tên & Email */}
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{u.username}</span>
                              {isMe && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                                  Tôi (Bạn)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">{u.email || 'Chưa cập nhật email'}</div>
                            <div className="text-[10px] text-gray-600 font-mono mt-0.5">ID: {u.id}</div>
                          </td>

                          {/* Vai trò */}
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                  u.role === 'ADMIN'
                                    ? 'bg-red-950 text-red-400 border-red-500/40'
                                    : u.role === 'OPERATOR'
                                    ? 'bg-blue-950 text-blue-400 border-blue-500/40'
                                    : 'bg-amber-950 text-amber-300 border-amber-500/40'
                                }`}
                              >
                                {u.role}
                              </span>

                              {/* Đổi role nhanh */}
                              {!isMe && (
                                <select
                                  value={u.role}
                                  onChange={(e) =>
                                    handleChangeRole(u.id, e.target.value as 'ADMIN' | 'OPERATOR' | 'VIEWER')
                                  }
                                  className="bg-gray-950 border border-gray-800 text-[11px] text-gray-300 rounded-lg px-2 py-1 focus:border-red-500 focus:outline-none"
                                >
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="OPERATOR">OPERATOR</option>
                                  <option value="VIEWER">VIEWER</option>
                                </select>
                              )}
                            </div>
                          </td>

                          {/* Trạng thái Hoạt động / Khóa */}
                          <td className="p-3.5 whitespace-nowrap">
                            {u.is_active ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-500/30">
                                <Check size={12} />
                                Đang hoạt động
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-400 font-bold bg-rose-950/80 px-2.5 py-1 rounded-full border border-rose-500/40">
                                <Lock size={12} />
                                Bị khóa / Vô hiệu hóa
                              </span>
                            )}
                            {u.failed_attempts > 0 && (
                              <div className="text-[10px] text-amber-400 mt-1 font-mono">
                                Sai mật khẩu: {u.failed_attempts}/5 lần
                              </div>
                            )}
                          </td>

                          {/* Danh sách thiết bị gán */}
                          <td className="p-3.5 min-w-[220px]">
                            {u.role === 'ADMIN' ? (
                              <span className="text-[11px] text-gray-400 italic font-medium">
                                Toàn quyền xem mọi thiết bị
                              </span>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {assignedList.length === 0 ? (
                                    <span className="text-[11px] text-gray-500 italic">Chưa gán thiết bị nào</span>
                                  ) : (
                                    assignedList.map((devId) => (
                                      <span
                                        key={devId}
                                        className="inline-flex items-center gap-1 text-[11px] font-mono bg-gray-950 text-cyan-300 px-2 py-0.5 rounded border border-gray-800"
                                      >
                                        {devId}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveDevice(u.id, devId)}
                                          className="text-gray-500 hover:text-red-400 ml-0.5"
                                          title={`Hủy gán thiết bị ${devId}`}
                                        >
                                          <X size={12} />
                                        </button>
                                      </span>
                                    ))
                                  )}
                                </div>

                                {/* Nút mở modal gán thiết bị */}
                                <button
                                  type="button"
                                  onClick={() => setSelectedUserForAssign(u)}
                                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 mt-1 underline"
                                >
                                  <Plus size={12} /> Gán thêm thiết bị
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Ngày tạo */}
                          <td className="p-3.5 whitespace-nowrap text-gray-400 font-mono text-[11px]">
                            {new Date(u.created_at).toLocaleDateString('vi-VN')}
                          </td>

                          {/* Thao tác */}
                          <td className="p-3.5 whitespace-nowrap text-right space-x-1.5">
                            {!isMe && (
                              <>
                                <button
                                  onClick={() => handleToggleUserStatus(u)}
                                  className={`p-1.5 rounded-lg border transition-colors ${
                                    u.is_active
                                      ? 'bg-amber-950/40 border-amber-600/40 text-amber-400 hover:bg-amber-950'
                                      : 'bg-emerald-950/40 border-emerald-600/40 text-emerald-400 hover:bg-emerald-950'
                                  }`}
                                  title={u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                                >
                                  {u.is_active ? <Lock size={14} /> : <Unlock size={14} />}
                                </button>

                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 rounded-lg bg-red-950/40 border border-red-600/40 text-red-400 hover:bg-red-950 transition-colors"
                                  title="Xóa người dùng"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* NỘI DUNG TAB 2: QUẢN LÝ THIẾT BỊ                                  */}
        {/* ================================================================= */}
        {activeTab === 'DEVICES' && (
          <div className="space-y-5">
            {/* Thanh công cụ tìm kiếm và thêm thiết bị */}
            <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo mã ID, tên, vị trí..."
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={fetchDevices}
                  disabled={isLoadingDevices}
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  title="Làm mới"
                >
                  <RotateCcw size={16} className={isLoadingDevices ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={() => setIsAddDeviceModalOpen(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  <Plus size={16} />
                  Thêm Thiết bị mới
                </button>
              </div>
            </div>

            {/* Bảng danh sách thiết bị */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-950/90 text-gray-400 uppercase tracking-wider font-semibold border-b border-gray-800">
                    <tr>
                      <th className="p-3.5">Mã ID</th>
                      <th className="p-3.5">Tên thiết bị</th>
                      <th className="p-3.5">Vị trí lắp đặt</th>
                      <th className="p-3.5">Ngưỡng Nhiệt / Gas</th>
                      <th className="p-3.5">Trạng thái</th>
                      <th className="p-3.5">Lần cuối kết nối</th>
                      <th className="p-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {filteredDevices.map((dev) => (
                      <tr key={dev.id} className="hover:bg-gray-800/40 transition-colors font-mono">
                        <td className="p-3.5 text-cyan-400 font-bold whitespace-nowrap">{dev.id}</td>
                        <td className="p-3.5 text-white font-semibold font-sans">{dev.name}</td>
                        <td className="p-3.5 text-gray-300 font-sans">{dev.location}</td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="text-orange-400 font-bold">{dev.temp_threshold}°C</span> •{' '}
                          <span className="text-purple-400 font-bold">{dev.gas_threshold} ppm</span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                              dev.status === 'ONLINE'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-500/40'
                                : dev.status === 'DECOMMISSIONED'
                                ? 'bg-gray-800 text-gray-400 border-gray-700'
                                : 'bg-rose-950 text-rose-300 border-rose-800'
                            }`}
                          >
                            {dev.status}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-gray-400 text-[11px]">
                          {dev.last_seen ? new Date(dev.last_seen).toLocaleString('vi-VN') : 'Chưa có'}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-right">
                          {dev.status !== 'DECOMMISSIONED' ? (
                            <button
                              onClick={() => handleDecommissionDevice(dev)}
                              className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-950 border border-red-600/40 text-red-400 text-xs font-bold transition-all shadow-sm active:scale-95"
                              title="Hủy vận hành (status: DECOMMISSIONED)"
                            >
                              Thu hồi (Decommission)
                            </button>
                          ) : (
                            <span className="text-gray-500 italic text-[11px]">Đã thu hồi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* NỘI DUNG TAB 3: CẤU HÌNH NGƯỠNG TOÀN CỤC                           */}
        {/* ================================================================= */}
        {activeTab === 'THRESHOLDS' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="p-6 rounded-3xl bg-gray-900/60 border border-gray-800 shadow-xl space-y-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400">
                  <Sliders size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cấu hình Ngưỡng Cảnh báo Toàn cục</h3>
                  <p className="text-xs text-gray-400">
                    Ngưỡng mặc định sẽ tự động áp dụng cho các thiết bị mới khởi tạo trong toàn bộ hệ thống.
                  </p>
                </div>
              </div>

              {isLoadingThresholds ? (
                <div className="py-12 text-center text-xs text-gray-400">Đang tải cấu hình ngưỡng...</div>
              ) : (
                <form onSubmit={handleSaveThresholds} className="space-y-5 pt-2">
                  {/* Ngưỡng nhiệt */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-300 block">
                      Ngưỡng Nhiệt độ Toàn cục (°C):
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="30"
                        max="100"
                        step="1"
                        value={thresholds.temp_threshold}
                        onChange={(e) =>
                          setThresholds((prev) => ({ ...prev, temp_threshold: parseFloat(e.target.value) }))
                        }
                        className="flex-1 accent-orange-500 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="30"
                        max="100"
                        step="0.5"
                        value={thresholds.temp_threshold}
                        onChange={(e) =>
                          setThresholds((prev) => ({ ...prev, temp_threshold: parseFloat(e.target.value) || 55 }))
                        }
                        className="w-24 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white font-mono text-center focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Mức khuyến nghị: <b className="text-gray-300">50°C - 60°C</b>. Vượt quá mức này còi sẽ tự động hú.
                    </p>
                  </div>

                  {/* Ngưỡng khí Gas */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-300 block">
                      Ngưỡng Nồng độ Khí Gas Toàn cục (PPM):
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="100"
                        max="2000"
                        step="50"
                        value={thresholds.gas_threshold}
                        onChange={(e) =>
                          setThresholds((prev) => ({ ...prev, gas_threshold: parseFloat(e.target.value) }))
                        }
                        className="flex-1 accent-purple-500 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="100"
                        max="5000"
                        step="10"
                        value={thresholds.gas_threshold}
                        onChange={(e) =>
                          setThresholds((prev) => ({ ...prev, gas_threshold: parseFloat(e.target.value) || 400 }))
                        }
                        className="w-24 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white font-mono text-center focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Mức khuyến nghị: <b className="text-gray-300">300 - 500 ppm</b> (khí Gas LPG / khói khí dễ cháy).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingThresholds}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs transition-all shadow-lg active:scale-98 disabled:opacity-50"
                  >
                    {isSavingThresholds ? 'Đang lưu cài đặt...' : 'Lưu Thay đổi Ngưỡng Toàn Cục'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* NỘI DUNG TAB 4: NHẬT KÝ KIỂM TOÁN (AUDIT LOGS)                     */}
        {/* ================================================================= */}
        {activeTab === 'AUDIT' && (
          <div className="space-y-4">
            {/* Bộ lọc Audit Logs */}
            <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Lọc theo Action */}
                <div>
                  <label className="text-gray-400 block mb-1">Loại hành động:</label>
                  <select
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="ALL">Tất cả hành động</option>
                    <option value="LOGIN_SUCCESS">LOGIN_SUCCESS (Đăng nhập thành công)</option>
                    <option value="LOGIN_FAILED">LOGIN_FAILED (Đăng nhập thất bại)</option>
                    <option value="COMMAND_SENT">COMMAND_SENT (Gửi lệnh điều khiển)</option>
                    <option value="THRESHOLD_CHANGED">THRESHOLD_CHANGED (Đổi ngưỡng)</option>
                    <option value="USER_CREATED">USER_CREATED (Tạo người dùng)</option>
                    <option value="USER_DELETED">USER_DELETED (Xóa người dùng)</option>
                    <option value="ALERT_ACKNOWLEDGED">ALERT_ACKNOWLEDGED (Xử lý cảnh báo)</option>
                    <option value="DEVICE_CREATED">DEVICE_CREATED (Thêm thiết bị)</option>
                    <option value="DEVICE_DECOMMISSIONED">DEVICE_DECOMMISSIONED (Thu hồi)</option>
                  </select>
                </div>

                {/* Tìm theo Username */}
                <div>
                  <label className="text-gray-400 block mb-1">Người dùng (Username):</label>
                  <input
                    type="text"
                    placeholder="Tìm người dùng..."
                    value={auditUserSearch}
                    onChange={(e) => setAuditUserSearch(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {/* Từ ngày */}
                <div>
                  <label className="text-gray-400 block mb-1">Từ ngày:</label>
                  <input
                    type="datetime-local"
                    value={auditFromDate}
                    onChange={(e) => setAuditFromDate(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {/* Đến ngày */}
                <div>
                  <label className="text-gray-400 block mb-1">Đến ngày:</label>
                  <input
                    type="datetime-local"
                    value={auditToDate}
                    onChange={(e) => setAuditToDate(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-800/80">
                <span className="text-xs text-gray-400">
                  Tìm thấy <b className="text-purple-400">{auditLogs.length}</b> bản ghi kiểm toán
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setAuditActionFilter('ALL');
                      setAuditUserSearch('');
                      setAuditFromDate('');
                      setAuditToDate('');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-all"
                  >
                    Đặt lại bộ lọc
                  </button>
                  <button
                    onClick={fetchAuditLogs}
                    disabled={isLoadingAudit}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md"
                  >
                    <RotateCcw size={14} className={isLoadingAudit ? 'animate-spin' : ''} />
                    Tra cứu Logs
                  </button>
                </div>
              </div>
            </div>

            {/* Bảng danh sách Audit Logs */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-950/90 text-gray-400 uppercase tracking-wider font-semibold border-b border-gray-800">
                    <tr>
                      <th className="p-3.5">Thời gian</th>
                      <th className="p-3.5">Người thực hiện</th>
                      <th className="p-3.5">Hành động (Action)</th>
                      <th className="p-3.5">Đối tượng (Target)</th>
                      <th className="p-3.5">IP</th>
                      <th className="p-3.5">Kết quả</th>
                      <th className="p-3.5 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="p-3.5 text-gray-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('vi-VN')}
                        </td>
                        <td className="p-3.5 text-white font-sans font-semibold whitespace-nowrap">
                          {log.username || (log.user_id ? log.user_id.slice(0, 8) + '...' : 'System / Unauth')}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.action.includes('SUCCESS') || log.action.includes('CREATED')
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                : log.action.includes('FAILED') || log.action.includes('DELETED')
                                ? 'bg-red-950 text-red-300 border border-red-500/40'
                                : 'bg-purple-950 text-purple-300 border border-purple-500/40'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3.5 text-gray-300 truncate max-w-xs">{log.target || '--'}</td>
                        <td className="p-3.5 text-gray-400">{log.ip || '--'}</td>
                        <td className="p-3.5 whitespace-nowrap">
                          {log.success ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 size={13} /> Thành công
                            </span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-1 font-bold">
                              <XCircle size={13} /> Thất bại
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-right">
                          <button
                            onClick={() => setSelectedAuditDetail(log)}
                            className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-sans font-semibold transition-colors"
                          >
                            Xem Payload
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================================================================= */}
      {/* MODAL 1: THÊM NGƯỜI DÙNG MỚI                                      */}
      {/* ================================================================= */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111726] border border-gray-800 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users size={18} className="text-red-400" /> Thêm Người dùng Mới
              </h3>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-300 block mb-1.5 font-medium">Tên đăng nhập (Username) *:</label>
                <input
                  type="text"
                  required
                  placeholder="ví dụ: technician01"
                  value={newUserData.username}
                  onChange={(e) => setNewUserData((prev) => ({ ...prev, username: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-300 block mb-1.5 font-medium">Email:</label>
                <input
                  type="email"
                  placeholder="ví dụ: tech@firealert.iot"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-300 block mb-1.5 font-medium">Mật khẩu khởi tạo *:</label>
                <input
                  type="password"
                  required
                  placeholder="Tối thiểu 6 ký tự"
                  value={newUserData.password}
                  onChange={(e) => setNewUserData((prev) => ({ ...prev, password: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-300 block mb-1.5 font-medium">Vai trò (Role) *:</label>
                <select
                  value={newUserData.role}
                  onChange={(e) =>
                    setNewUserData((prev) => ({
                      ...prev,
                      role: e.target.value as 'ADMIN' | 'OPERATOR' | 'VIEWER',
                    }))
                  }
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="OPERATOR">Kỹ thuật viên điều khiển (OPERATOR)</option>
                  <option value="VIEWER">Giám sát viên chỉ đọc (VIEWER)</option>
                  <option value="ADMIN">Quản trị viên toàn quyền (ADMIN)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all shadow-md"
                >
                  Tạo tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: GÁN THIẾT BỊ CHO NGƯỜI DÙNG                               */}
      {/* ================================================================= */}
      {selectedUserForAssign && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111726] border border-gray-800 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building size={18} className="text-cyan-400" /> Phân quyền thiết bị
              </h3>
              <button
                onClick={() => setSelectedUserForAssign(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Gán thiết bị phụ trách cho người dùng <b className="text-white">{selectedUserForAssign.username}</b>:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-gray-300 block mb-1 font-medium">Chọn thiết bị trong hệ thống:</label>
                <select
                  value={deviceToAssign}
                  onChange={(e) => setDeviceToAssign(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">-- Chọn mã thiết bị --</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} - {d.name} ({d.location})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForAssign(null)}
                  className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={!deviceToAssign}
                  onClick={() => {
                    handleAssignDevice(selectedUserForAssign.id, deviceToAssign);
                    setSelectedUserForAssign(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold transition-all shadow-md"
                >
                  Gán thiết bị
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: THÊM THIẾT BỊ MỚI                                        */}
      {/* ================================================================= */}
      {isAddDeviceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111726] border border-gray-800 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu size={18} className="text-cyan-400" /> Thêm Thiết bị Mới
              </h3>
              <button
                onClick={() => setIsAddDeviceModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDevice} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-300 block mb-1.5 font-medium">Mã thiết bị (ID) *:</label>
                <input
                  type="text"
                  required
                  placeholder="ví dụ: ESP32_DEV_04"
                  value={newDeviceData.id}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, id: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-300 block mb-1.5 font-medium">Tên thiết bị *:</label>
                <input
                  type="text"
                  required
                  placeholder="ví dụ: Cảm biến Khí Ga Kho Sơn"
                  value={newDeviceData.name}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-300 block mb-1.5 font-medium">Vị trí lắp đặt *:</label>
                <input
                  type="text"
                  required
                  placeholder="ví dụ: Khu B - Tầng 2"
                  value={newDeviceData.location}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-300 block mb-1.5 font-medium">Ngưỡng nhiệt (°C):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newDeviceData.temp_threshold}
                    onChange={(e) =>
                      setNewDeviceData((prev) => ({ ...prev, temp_threshold: parseFloat(e.target.value) || 55 }))
                    }
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-gray-300 block mb-1.5 font-medium">Ngưỡng Gas (ppm):</label>
                  <input
                    type="number"
                    step="10"
                    value={newDeviceData.gas_threshold}
                    onChange={(e) =>
                      setNewDeviceData((prev) => ({ ...prev, gas_threshold: parseFloat(e.target.value) || 400 }))
                    }
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddDeviceModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-md"
                >
                  Tạo thiết bị
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: XEM CHI TIẾT AUDIT LOG DETAIL                             */}
      {/* ================================================================= */}
      {selectedAuditDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#111726] border border-gray-800 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText size={18} className="text-purple-400" /> Chi tiết Nhật ký Kiểm toán #{selectedAuditDetail.id}
              </h3>
              <button
                onClick={() => setSelectedAuditDetail(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-gray-300">
                <div>
                  <span className="text-gray-500 block">Thời gian:</span>
                  <span className="font-mono">{new Date(selectedAuditDetail.created_at).toLocaleString('vi-VN')}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Hành động:</span>
                  <span className="font-bold text-purple-400">{selectedAuditDetail.action}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Người thực hiện:</span>
                  <span>{selectedAuditDetail.username || selectedAuditDetail.user_id || 'System'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Địa chỉ IP:</span>
                  <span className="font-mono">{selectedAuditDetail.ip || 'Local / Internal'}</span>
                </div>
              </div>

              <div>
                <span className="text-gray-400 block mb-1 font-medium">Dữ liệu chi tiết (JSON Payload):</span>
                <pre className="p-3 rounded-xl bg-gray-950 border border-gray-800 text-cyan-300 font-mono text-[11px] overflow-x-auto max-h-60">
                  {JSON.stringify(selectedAuditDetail.detail, null, 2)}
                </pre>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedAuditDetail(null)}
                  className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-semibold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
