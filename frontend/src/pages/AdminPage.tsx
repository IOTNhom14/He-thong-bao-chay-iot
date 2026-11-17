import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { UserApi, type UserItem, type CreateUserInput } from '../api/user.api';
import { DeviceApi, type DeviceItem } from '../api/device.api';
import { SettingsApi, type ThresholdSettings } from '../api/settings.api';
import { AuditApi, type AuditLogItem } from '../api/audit.api';
import { useToast } from '../context/ToastContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatVietnamDate, formatVietnamDateTime } from '../utils/datetime';
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
  AlertCircle,
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [addUserErrors, setAddUserErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    role?: string;
  }>({});
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [selectedUserForAssign, setSelectedUserForAssign] = useState<UserItem | null>(null);
  const [deviceToAssign, setDeviceToAssign] = useState('');

  const validateAddUserForm = (data: CreateUserInput, confirmPwd: string) => {
    const errors: {
      username?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
      role?: string;
    } = {};

    const trimmedUsername = data.username.trim();
    if (!trimmedUsername) {
      errors.username = 'Tên đăng nhập không được để trống';
    } else if (trimmedUsername.length < 3) {
      errors.username = 'Tên đăng nhập tối thiểu 3 ký tự';
    } else if (trimmedUsername.length > 50) {
      errors.username = 'Tên đăng nhập tối đa 50 ký tự';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      errors.username = 'Chỉ cho phép chữ cái, chữ số, gạch dưới (_) và gạch ngang (-)';
    }

    const trimmedEmail = data.email.trim();
    if (!trimmedEmail) {
      errors.email = 'Địa chỉ email không được để trống';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        errors.email = 'Địa chỉ email không đúng định dạng (ví dụ: user@example.com)';
      }
    }

    if (!data.password) {
      errors.password = 'Mật khẩu khởi tạo không được để trống';
    } else if (data.password.length < 6) {
      errors.password = 'Mật khẩu phải có độ dài tối thiểu 6 ký tự';
    }

    if (!confirmPwd) {
      errors.confirmPassword = 'Vui lòng xác nhận lại mật khẩu';
    } else if (data.password !== confirmPwd) {
      errors.confirmPassword = 'Mật khẩu xác nhận không trùng khớp';
    }

    if (!data.role || !['ADMIN', 'OPERATOR', 'VIEWER'].includes(data.role)) {
      errors.role = 'Vui lòng chọn vai trò hợp lệ trong hệ thống';
    }

    return errors;
  };

  const handleOpenAddUserModal = () => {
    setNewUserData({ username: '', email: '', password: '', role: 'OPERATOR' });
    setConfirmPassword('');
    setAddUserErrors({});
    setIsAddUserModalOpen(true);
  };

  const handleCloseAddUserModal = () => {
    setIsAddUserModalOpen(false);
    setNewUserData({ username: '', email: '', password: '', role: 'OPERATOR' });
    setConfirmPassword('');
    setAddUserErrors({});
  };

  const handleUserFieldChange = (field: keyof CreateUserInput, value: string) => {
    setNewUserData((prev) => ({ ...prev, [field]: value }));
    if (addUserErrors[field as keyof typeof addUserErrors]) {
      setAddUserErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (addUserErrors.confirmPassword) {
      setAddUserErrors((prev) => ({ ...prev, confirmPassword: undefined }));
    }
  };

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
    const validationErrors = validateAddUserForm(newUserData, confirmPassword);
    if (Object.keys(validationErrors).length > 0) {
      setAddUserErrors(validationErrors);
      return;
    }

    setAddUserErrors({});
    setIsSubmittingUser(true);
    try {
      await UserApi.createUser({
        username: newUserData.username.trim(),
        email: newUserData.email.trim(),
        password: newUserData.password,
        role: newUserData.role,
      });
      showSuccess('Tạo tài khoản thành công', `Đã tạo người dùng ${newUserData.username.trim()} (${newUserData.role})`);
      handleCloseAddUserModal();
      fetchUsers();
    } catch (err: any) {
      showError('Tạo tài khoản thất bại', err.response?.data?.error || err.response?.data?.detail || err.message);
    } finally {
      setIsSubmittingUser(false);
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
    camera_url: '',
    provision_from_device_id: 'ESP_TEST02',
    assigned_user_id: '',
  });

  const fetchDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const data = await DeviceApi.getDevices();
      setDevices(data);
    } catch (err: any) {
      showError('Lỗi lấy danh sách thiết bị', err.response?.data?.detail || err.response?.data?.error || err.message);
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
      await DeviceApi.createDevice({
        ...newDeviceData,
        assigned_user_id: newDeviceData.assigned_user_id || currentUser?.id || null,
      });
      showSuccess('Tạo thiết bị thành công', `Đã thêm thiết bị mới: ${newDeviceData.id}`);
      setIsAddDeviceModalOpen(false);
      setNewDeviceData({
        id: '',
        name: '',
        location: '',
        temp_threshold: 55,
        gas_threshold: 400,
        camera_url: '',
        provision_from_device_id: 'ESP_TEST02',
        assigned_user_id: '',
      });
      fetchDevices();
    } catch (err: any) {
      showError('Tạo thiết bị thất bại', err.response?.data?.detail || err.response?.data?.error || err.message);
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
      await DeviceApi.decommissionDevice(device.id);
      showSuccess('Thu hồi thiết bị thành công', `Thiết bị ${device.id} đã chuyển trạng thái DECOMMISSIONED.`);
      fetchDevices();
    } catch (err: any) {
      showError('Lỗi thu hồi thiết bị', err.response?.data?.detail || err.response?.data?.error || err.message);
    }
  };

  const handleLifecycleChange = async (
    device: DeviceItem,
    nextStatus: 'ACTIVE' | 'MAINTENANCE'
  ) => {
    try {
      await DeviceApi.updateLifecycle(device.id, nextStatus);
      showSuccess(
        'Cập nhật vòng đời thành công',
        `${device.id} đã chuyển sang ${nextStatus === 'ACTIVE' ? 'ACTIVE' : 'MAINTENANCE'}.`
      );
      fetchDevices();
    } catch (err: any) {
      showError(
        'Lỗi cập nhật vòng đời',
        err.response?.data?.detail || err.response?.data?.error || err.message
      );
    }
  };

  const handleDeleteDeviceConnection = async (device: DeviceItem) => {
    if (!window.confirm(`Xóa liên kết backend của thiết bị ${device.id}? Có thể dùng ID này làm nguồn provision cho ESP32.`)) {
      return;
    }
    try {
      await DeviceApi.deleteDevice(device.id);
      showSuccess('Đã xóa kết nối', `Liên kết backend của ${device.id} đã được xóa.`);
      fetchDevices();
    } catch (err: any) {
      showError(
        'Lỗi xóa kết nối thiết bị',
        err.response?.data?.detail || err.response?.data?.error || err.message
      );
    }
  };

  const handleProvisionDevice = async (device: DeviceItem) => {
    try {
      const sourceId = newDeviceData.provision_from_device_id.trim();
      if (!sourceId) {
        showError('Thiếu ID nguồn', 'Vui lòng nhập ID ESP32 nguồn để provision.');
        return;
      }
      const result = await DeviceApi.provisionDevice(device.id, sourceId);
      showSuccess('Đã gửi lệnh provision', `Mã lệnh: ${result.command_id}`);
      fetchDevices();
    } catch (err: any) {
      showError(
        'Provision thiết bị thất bại',
        err.response?.data?.detail || err.response?.data?.error || err.message
      );
    }
  };

  const [editingThresholdDevice, setEditingThresholdDevice] = useState<DeviceItem | null>(null);
  const [editTempThreshold, setEditTempThreshold] = useState<string>('55');
  const [editGasThreshold, setEditGasThreshold] = useState<string>('400');
  const [isSavingDeviceThreshold, setIsSavingDeviceThreshold] = useState<boolean>(false);

  const openEditThresholdModal = (device: DeviceItem) => {
    if (device.status !== 'ONLINE') {
      showError(
        'Thiết bị đang ngoại tuyến',
        `Thiết bị ${device.id} đang ở trạng thái ${device.status}. Chỉ có thể sửa ngưỡng khi thiết bị ONLINE.`
      );
      return;
    }
    setEditingThresholdDevice(device);
    setEditTempThreshold(String(device.temp_threshold ?? 55));
    setEditGasThreshold(String(device.gas_threshold ?? 400));
  };

  const handleSaveDeviceThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingThresholdDevice) return;

    const tempVal = parseFloat(editTempThreshold);
    const gasVal = parseFloat(editGasThreshold);

    if (Number.isNaN(tempVal) || tempVal <= 20 || tempVal > 100) {
      showError('Ngưỡng nhiệt độ không hợp lệ', 'Ngưỡng nhiệt độ phải nằm trong khoảng (20°C, 100°C].');
      return;
    }
    if (Number.isNaN(gasVal) || gasVal <= 50 || gasVal > 2000) {
      showError('Ngưỡng khói/gas không hợp lệ', 'Ngưỡng khói/gas phải nằm trong khoảng (50 PPM, 2000 PPM].');
      return;
    }

    setIsSavingDeviceThreshold(true);
    try {
      const result = await DeviceApi.updateThresholds(editingThresholdDevice.id, {
        temp_threshold: tempVal,
        smoke_threshold: gasVal,
      });
      showSuccess(
        'Cập nhật ngưỡng thiết bị thành công',
        `${editingThresholdDevice.id}: ${tempVal}°C · ${gasVal} PPM (Mã lệnh: ${result.command_id}).`
      );
      setEditingThresholdDevice(null);
      fetchDevices();
    } catch (err: any) {
      showError(
        'Cập nhật ngưỡng thất bại',
        err.response?.data?.detail || err.response?.data?.error || err.message
      );
    } finally {
      setIsSavingDeviceThreshold(false);
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
        <div className="p-4 rounded-md border border-zinc-800 bg-[#111318] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-red-700 text-white flex items-center justify-center border border-red-600 flex-shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-zinc-100 uppercase tracking-wide">TRUNG TÂM QUẢN TRỊ HỆ THỐNG</h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-700 font-bold font-mono">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Quản lý tài khoản & phân quyền thiết bị • Quản lý thiết bị • Ngưỡng toàn cục • Nhật ký Audit Logs an ninh
              </p>
            </div>
          </div>

          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
          >
            <Layers size={14} className="text-zinc-400" />
            <span>Quay lại Dashboard</span>
          </Link>
        </div>

        {/* 4 Tabs Quản trị */}
        <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2 overflow-x-auto text-xs font-mono font-semibold">
          <button
            onClick={() => setActiveTab('USERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors border ${
              activeTab === 'USERS'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border-transparent'
            }`}
          >
            <Users size={14} />
            <span>Người dùng & Gán thiết bị ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors border ${
              activeTab === 'DEVICES'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border-transparent'
            }`}
          >
            <Cpu size={14} />
            <span>Quản lý Thiết bị ({devices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('THRESHOLDS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors border ${
              activeTab === 'THRESHOLDS'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border-transparent'
            }`}
          >
            <Sliders size={14} />
            <span>Ngưỡng toàn cục</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors border ${
              activeTab === 'AUDIT'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border-transparent'
            }`}
          >
            <FileText size={14} />
            <span>Nhật ký Audit Logs ({totalLogs})</span>
          </button>
        </div>

        {/* ================================================================= */}
        {/* NỘI DUNG TAB 1: QUẢN LÝ NGƯỜI DÙNG & GÁN THIẾT BỊ                 */}
        {/* ================================================================= */}
        {activeTab === 'USERS' && (
          <div className="space-y-4">
            {/* Thanh công cụ tìm kiếm và tạo user mới */}
            <div className="p-3 rounded-md bg-[#111318] border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo tên đăng nhập, email, vai trò..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded pl-8 pr-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={fetchUsers}
                  disabled={isLoadingUsers}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  title="Làm mới"
                >
                  <RotateCcw size={14} className={isLoadingUsers ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={handleOpenAddUserModal}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-semibold border border-red-600 transition-colors"
                >
                  <Plus size={14} />
                  <span>Thêm Người dùng</span>
                </button>
              </div>
            </div>

            {/* Bảng danh sách người dùng */}
            <div className="bg-[#111318] border border-zinc-800 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#090a0f] text-zinc-400 uppercase tracking-wider font-mono text-[11px] border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">Tên đăng nhập & Email</th>
                      <th className="py-2.5 px-3">Vai trò (Role)</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3">Thiết bị phụ trách (user_devices)</th>
                      <th className="py-2.5 px-3">Ngày tạo</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 font-mono text-xs tabular-nums">
                    {filteredUsers.map((u) => {
                      const isMe = u.id === currentUser?.id;
                      const assignedList = u.assigned_devices || [];

                      return (
                        <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                          {/* Tên & Email */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-100 font-sans text-xs">{u.username}</span>
                              {isMe && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                  Tôi (Bạn)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 font-sans mt-0.5">{u.email || 'Chưa cập nhật email'}</div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">ID: {u.id}</div>
                          </td>

                          {/* Vai trò */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                  u.role === 'ADMIN'
                                    ? 'bg-red-950 text-red-300 border-red-700'
                                    : u.role === 'OPERATOR'
                                    ? 'bg-blue-950 text-blue-300 border-blue-700'
                                    : 'bg-zinc-900 text-zinc-300 border-zinc-700'
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
                                  className="bg-[#090a0f] border border-zinc-800 text-[11px] text-zinc-300 rounded px-1.5 py-0.5 focus:border-zinc-600 focus:outline-none"
                                >
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="OPERATOR">OPERATOR</option>
                                  <option value="VIEWER">VIEWER</option>
                                </select>
                              )}
                            </div>
                          </td>

                          {/* Trạng thái Hoạt động / Khóa */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {u.is_active ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800 text-[10px]">
                                <Check size={11} />
                                Hoạt động
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-400 font-bold bg-red-950/80 px-1.5 py-0.2 rounded border border-red-800 text-[10px]">
                                <Lock size={11} />
                                Bị khóa
                              </span>
                            )}
                            {u.failed_attempts > 0 && (
                              <div className="text-[10px] text-amber-400 mt-0.5">
                                Sai pass: {u.failed_attempts}/5 lần
                              </div>
                            )}
                          </td>

                          {/* Danh sách thiết bị gán */}
                          <td className="py-2.5 px-3 min-w-[200px]">
                            {u.role === 'ADMIN' ? (
                              <span className="text-[11px] text-zinc-400 italic">
                                Toàn quyền toàn trạm
                              </span>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  {assignedList.length === 0 ? (
                                    <span className="text-[11px] text-zinc-500 italic">Chưa gán thiết bị nào</span>
                                  ) : (
                                    assignedList.map((devId) => (
                                      <span
                                        key={devId}
                                        className="inline-flex items-center gap-1 text-[11px] font-mono bg-[#090a0f] text-zinc-200 px-1.5 py-0.2 rounded border border-zinc-800"
                                      >
                                        {devId}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveDevice(u.id, devId)}
                                          className="text-zinc-500 hover:text-red-400 ml-0.5"
                                          title={`Hủy gán thiết bị ${devId}`}
                                        >
                                          <X size={11} />
                                        </button>
                                      </span>
                                    ))
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setSelectedUserForAssign(u)}
                                  className="text-[10px] text-zinc-400 hover:text-zinc-200 font-medium flex items-center gap-1 underline"
                                >
                                  <Plus size={11} /> Gán thêm thiết bị
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Ngày tạo */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-zinc-400 text-[11px]">
                            {formatVietnamDate(u.created_at)}
                          </td>

                          {/* Thao tác */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-right space-x-1">
                            {!isMe && (
                              <>
                                <button
                                  onClick={() => handleToggleUserStatus(u)}
                                  className={`p-1 rounded border transition-colors ${
                                    u.is_active
                                      ? 'bg-amber-950/40 border-amber-800 text-amber-300 hover:bg-amber-950'
                                      : 'bg-emerald-950/40 border-emerald-800 text-emerald-300 hover:bg-emerald-950'
                                  }`}
                                  title={u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                                >
                                  {u.is_active ? <Lock size={13} /> : <Unlock size={13} />}
                                </button>

                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1 rounded bg-red-950/40 border border-red-800 text-red-300 hover:bg-red-950 transition-colors"
                                  title="Xóa người dùng"
                                >
                                  <Trash2 size={13} />
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
          <div className="space-y-4">
            {/* Thanh công cụ tìm kiếm và thêm thiết bị */}
            <div className="p-3 rounded-md bg-[#111318] border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo mã ID, tên, vị trí..."
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded pl-8 pr-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={fetchDevices}
                  disabled={isLoadingDevices}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  title="Làm mới"
                >
                  <RotateCcw size={14} className={isLoadingDevices ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={() => setIsAddDeviceModalOpen(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-semibold border border-red-600 transition-colors"
                >
                  <Plus size={14} />
                  <span>Thêm Thiết bị</span>
                </button>
              </div>
            </div>

            {/* Bảng danh sách thiết bị */}
            <div className="bg-[#111318] border border-zinc-800 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#090a0f] text-zinc-400 uppercase tracking-wider font-mono text-[11px] border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">Mã ID</th>
                      <th className="py-2.5 px-3">Tên thiết bị</th>
                      <th className="py-2.5 px-3">Vị trí lắp đặt</th>
                      <th className="py-2.5 px-3">Ngưỡng Nhiệt / Gas</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3">Lần cuối kết nối</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 font-mono text-xs tabular-nums">
                    {filteredDevices.map((dev) => (
                      <tr key={dev.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2 px-3 text-zinc-100 font-bold whitespace-nowrap">{dev.id}</td>
                        <td className="py-2 px-3 text-zinc-200 font-sans font-semibold">{dev.name}</td>
                        <td className="py-2 px-3 text-zinc-400 font-sans">{dev.location}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="text-zinc-200 font-bold">{dev.temp_threshold}°C</span> ·{' '}
                          <span className="text-zinc-200 font-bold">{dev.gas_threshold} PPM</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                              dev.status === 'ONLINE'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : dev.status === 'DECOMMISSIONED'
                                ? 'bg-zinc-900 text-zinc-500 border-zinc-800'
                                : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                            }`}
                          >
                            {dev.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-zinc-400 text-[11px]">
                          {dev.last_seen ? formatVietnamDateTime(dev.last_seen) : 'Chưa có'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-right font-sans">
                          {dev.status !== 'DECOMMISSIONED' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {dev.status === 'MAINTENANCE' ? (
                                <button
                                  onClick={() => handleLifecycleChange(dev, 'ACTIVE')}
                                  className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs transition-colors"
                                >
                                  Kích hoạt
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleLifecycleChange(dev, 'MAINTENANCE')}
                                  className="px-2.5 py-1 rounded bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 text-xs transition-colors"
                                >
                                  Bảo trì
                                </button>
                              )}
                              <button
                                onClick={() => openEditThresholdModal(dev)}
                                disabled={dev.status !== 'ONLINE'}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 border border-zinc-700 text-xs transition-colors flex items-center gap-1"
                                title={
                                  dev.status === 'ONLINE'
                                    ? 'Sửa ngưỡng nhiệt độ và khói/gas của thiết bị'
                                    : `Thiết bị đang ${dev.status}, chỉ có thể sửa ngưỡng khi ONLINE`
                                }
                              >
                                <Sliders size={12} />
                                <span>Sửa ngưỡng</span>
                              </button>
                              <button
                                onClick={() => handleProvisionDevice(dev)}
                                className="px-2.5 py-1 rounded bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 text-xs transition-colors"
                                title="Gửi lại lệnh cấp phát tới ESP32 nguồn"
                              >
                                Provision
                              </button>
                              <button
                                onClick={() => handleDecommissionDevice(dev)}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-red-950 text-zinc-300 hover:text-red-300 border border-zinc-700 hover:border-red-800 text-xs transition-colors"
                                title="Hủy vận hành (status: DECOMMISSIONED)"
                              >
                                Thu hồi
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDeleteDeviceConnection(dev)}
                              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-300 border border-zinc-700 hover:border-red-800 text-xs transition-colors"
                              title="Xóa liên kết backend sau khi thu hồi"
                            >
                              Xóa kết nối
                            </button>
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
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="p-5 rounded-md bg-[#111318] border border-zinc-800 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800/80">
                <div className="w-8 h-8 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-700">
                  <Sliders size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Cấu hình Ngưỡng Cảnh báo Toàn cục</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Ngưỡng mặc định sẽ tự động áp dụng cho các thiết bị mới khởi tạo trong toàn trạm.
                  </p>
                </div>
              </div>

              {isLoadingThresholds ? (
                <div className="py-10 text-center text-xs text-zinc-500 font-mono">Đang tải cấu hình ngưỡng...</div>
              ) : (
                <form onSubmit={handleSaveThresholds} className="space-y-4 pt-1 font-mono">
                  {/* Ngưỡng nhiệt */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300 block font-sans">
                      Ngưỡng Nhiệt độ Toàn cục (°C):
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="30"
                        max="100"
                        step="1"
                        value={thresholds.temp_threshold}
                        onChange={(e) =>
                          setThresholds((prev) => ({ ...prev, temp_threshold: parseFloat(e.target.value) }))
                        }
                        className="flex-1 accent-red-600 cursor-pointer"
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
                        className="w-24 bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-white font-mono text-center focus:border-zinc-600 focus:outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 font-sans">
                      Mức khuyến nghị: <strong className="text-zinc-300">50°C - 60°C</strong>. Vượt mức này hệ thống tự động kích hoạt cảnh báo.
                    </p>
                  </div>

                  {/* Ngưỡng khí Gas */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300 block font-sans">
                      Ngưỡng Nồng độ Khí Gas Toàn cục (PPM):
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="100"
                        max="2000"
                        step="50"
                        value={thresholds.gas_threshold}
                        onChange={(e) =>
                          setThresholds((prev) => ({ ...prev, gas_threshold: parseFloat(e.target.value) }))
                        }
                        className="flex-1 accent-sky-600 cursor-pointer"
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
                        className="w-24 bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-white font-mono text-center focus:border-zinc-600 focus:outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 font-sans">
                      Mức khuyến nghị: <strong className="text-zinc-300">300 - 500 PPM</strong> (khí LPG / khói khí dễ cháy).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingThresholds}
                    className="w-full py-2 px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-xs border border-zinc-700 transition-colors disabled:opacity-50 font-sans"
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
            <div className="p-3 rounded-md bg-[#111318] border border-zinc-800 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs font-mono">
                {/* Lọc theo Action */}
                <div>
                  <label className="text-zinc-400 block mb-1">Loại hành động:</label>
                  <select
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  >
                    <option value="ALL">Tất cả hành động</option>
                    <option value="LOGIN_SUCCESS">LOGIN_SUCCESS (Đăng nhập thành công)</option>
                    <option value="LOGIN_FAILED">LOGIN_FAILED (Đăng nhập thất bại)</option>
                    <option value="SEND_COMMAND">SEND_COMMAND (Gửi lệnh điều khiển)</option>
                    <option value="UPDATE_THRESHOLDS">UPDATE_THRESHOLDS (Đổi ngưỡng cảnh báo)</option>
                    <option value="ACK_ALERT">ACK_ALERT (Xác nhận xử lý cảnh báo)</option>
                    <option value="CREATE_USER">CREATE_USER (Tạo người dùng)</option>
                    <option value="UPDATE_ROLE">UPDATE_ROLE (Đổi vai trò người dùng)</option>
                    <option value="STATUS_USER">STATUS_USER (Khóa / Mở khóa tài khoản)</option>
                    <option value="DELETE_USER">DELETE_USER (Xóa người dùng)</option>
                    <option value="ASSIGN_DEVICE">ASSIGN_DEVICE (Gán thiết bị cho user)</option>
                    <option value="REMOVE_DEVICE">REMOVE_DEVICE (Hủy gán thiết bị)</option>
                    <option value="ONBOARD_DEVICE">ONBOARD_DEVICE (Thêm thiết bị mới)</option>
                    <option value="CHANGE_STATUS">CHANGE_STATUS (Đổi trạng thái thiết bị)</option>
                    <option value="DEVICE_DECOMMISSIONED">DECOMMISSIONED (Thu hồi thiết bị)</option>
                    <option value="DELETE_DEVICE_LINK">DELETE_DEVICE_LINK (Xóa liên kết thiết bị)</option>
                    <option value="LINK_CAMERA">CAMERA (Gán / Gỡ camera)</option>
                    <option value="PROVISION_DEVICE">PROVISION_DEVICE (Cấp phát lại ESP32)</option>
                  </select>
                </div>

                {/* Tìm theo Username */}
                <div>
                  <label className="text-zinc-400 block mb-1">Người dùng (Username):</label>
                  <input
                    type="text"
                    placeholder="Tìm người dùng..."
                    value={auditUserSearch}
                    onChange={(e) => setAuditUserSearch(e.target.value)}
                    className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  />
                </div>

                {/* Từ ngày */}
                <div>
                  <label className="text-zinc-400 block mb-1">Từ ngày:</label>
                  <input
                    type="datetime-local"
                    value={auditFromDate}
                    onChange={(e) => setAuditFromDate(e.target.value)}
                    className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  />
                </div>

                {/* Đến ngày */}
                <div>
                  <label className="text-zinc-400 block mb-1">Đến ngày:</label>
                  <input
                    type="datetime-local"
                    value={auditToDate}
                    onChange={(e) => setAuditToDate(e.target.value)}
                    className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800 font-mono">
                <span className="text-xs text-zinc-400">
                  Bản ghi kiểm toán: <strong className="text-zinc-200">{auditLogs.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setAuditActionFilter('ALL');
                      setAuditUserSearch('');
                      setAuditFromDate('');
                      setAuditToDate('');
                    }}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
                  >
                    Đặt lại
                  </button>
                  <button
                    onClick={fetchAuditLogs}
                    disabled={isLoadingAudit}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-mono font-medium border border-zinc-700 transition-colors"
                  >
                    <RotateCcw size={13} className={isLoadingAudit ? 'animate-spin' : ''} />
                    <span>Tra cứu</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bảng danh sách Audit Logs */}
            <div className="bg-[#111318] border border-zinc-800 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#090a0f] text-zinc-400 uppercase tracking-wider font-mono text-[11px] border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">Thời gian</th>
                      <th className="py-2.5 px-3">Người thực hiện</th>
                      <th className="py-2.5 px-3">Hành động (Action)</th>
                      <th className="py-2.5 px-3">Đối tượng (Target)</th>
                      <th className="py-2.5 px-3">IP</th>
                      <th className="py-2.5 px-3">Kết quả</th>
                      <th className="py-2.5 px-3 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 font-mono text-[11px] tabular-nums">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                          {formatVietnamDateTime(log.created_at)}
                        </td>
                        <td className="py-2 px-3 text-zinc-200 font-sans font-semibold whitespace-nowrap">
                          {log.username || (log.user_id ? log.user_id.slice(0, 8) + '...' : 'System / Unauth')}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                              log.action.includes('SUCCESS') ||
                              log.action.includes('CREATE') ||
                              log.action.includes('ONBOARD') ||
                              log.action.includes('ACK')
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : log.action.includes('FAILED') ||
                                  log.action.includes('DELETE') ||
                                  log.action.includes('DECOMMISSION')
                                ? 'bg-red-950 text-red-300 border-red-800'
                                : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-zinc-300 truncate max-w-xs">{log.target || '--'}</td>
                        <td className="py-2 px-3 text-zinc-400">{log.ip || '--'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {log.success ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 size={12} /> Thành công
                            </span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-1 font-bold">
                              <XCircle size={12} /> Thất bại
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-right font-sans">
                          <button
                            onClick={() => setSelectedAuditDetail(log)}
                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                          >
                            Payload
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
      {/* ================================================================= */}
      {/* MODAL 1: THÊM NGƯỜI DÙNG MỚI                                      */}
      {/* ================================================================= */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111318] border border-zinc-800 rounded-md p-5 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                <Users size={16} className="text-zinc-400" /> Thêm Người dùng Mới
              </h3>
              <button
                type="button"
                onClick={handleCloseAddUserModal}
                disabled={isSubmittingUser}
                className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} noValidate className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-zinc-300 block mb-1 font-sans">
                  Tên đăng nhập (Username) <span className="text-red-400">*</span>:
                </label>
                <input
                  type="text"
                  placeholder="ví dụ: technician01"
                  value={newUserData.username}
                  onChange={(e) => handleUserFieldChange('username', e.target.value)}
                  className={`w-full bg-[#090a0f] border ${addUserErrors.username ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-600'} rounded px-2.5 py-1.5 text-zinc-100 focus:outline-none transition-colors`}
                  aria-invalid={!!addUserErrors.username}
                />
                {addUserErrors.username && (
                  <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1 font-sans" role="alert">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{addUserErrors.username}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">
                  Email <span className="text-red-400">*</span>:
                </label>
                <input
                  type="email"
                  placeholder="ví dụ: tech@firealert.iot"
                  value={newUserData.email}
                  onChange={(e) => handleUserFieldChange('email', e.target.value)}
                  className={`w-full bg-[#090a0f] border ${addUserErrors.email ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-600'} rounded px-2.5 py-1.5 text-zinc-100 focus:outline-none transition-colors`}
                  aria-invalid={!!addUserErrors.email}
                />
                {addUserErrors.email && (
                  <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1 font-sans" role="alert">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{addUserErrors.email}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">
                  Mật khẩu khởi tạo <span className="text-red-400">*</span>:
                </label>
                <input
                  type="password"
                  placeholder="Tối thiểu 6 ký tự"
                  value={newUserData.password}
                  onChange={(e) => handleUserFieldChange('password', e.target.value)}
                  className={`w-full bg-[#090a0f] border ${addUserErrors.password ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-600'} rounded px-2.5 py-1.5 text-zinc-100 focus:outline-none transition-colors`}
                  aria-invalid={!!addUserErrors.password}
                />
                {addUserErrors.password && (
                  <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1 font-sans" role="alert">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{addUserErrors.password}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">
                  Xác nhận mật khẩu <span className="text-red-400">*</span>:
                </label>
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu khởi tạo"
                  value={confirmPassword}
                  onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                  className={`w-full bg-[#090a0f] border ${addUserErrors.confirmPassword ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-600'} rounded px-2.5 py-1.5 text-zinc-100 focus:outline-none transition-colors`}
                  aria-invalid={!!addUserErrors.confirmPassword}
                />
                {addUserErrors.confirmPassword && (
                  <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1 font-sans" role="alert">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{addUserErrors.confirmPassword}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">
                  Vai trò (Role) <span className="text-red-400">*</span>:
                </label>
                <select
                  value={newUserData.role}
                  onChange={(e) =>
                    handleUserFieldChange('role', e.target.value as 'ADMIN' | 'OPERATOR' | 'VIEWER')
                  }
                  className={`w-full bg-[#090a0f] border ${addUserErrors.role ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-600'} rounded px-2.5 py-1.5 text-zinc-100 focus:outline-none transition-colors`}
                  aria-invalid={!!addUserErrors.role}
                >
                  <option value="OPERATOR">Kỹ thuật viên điều khiển (OPERATOR)</option>
                  <option value="VIEWER">Giám sát viên chỉ đọc (VIEWER)</option>
                  <option value="ADMIN">Quản trị viên toàn quyền (ADMIN)</option>
                </select>
                {addUserErrors.role && (
                  <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1 font-sans" role="alert">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{addUserErrors.role}</span>
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 font-sans">
                <button
                  type="button"
                  onClick={handleCloseAddUserModal}
                  disabled={isSubmittingUser}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold disabled:opacity-50 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors border border-red-600 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingUser && (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{isSubmittingUser ? 'Đang tạo...' : 'Tạo tài khoản'}</span>
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111318] border border-zinc-800 rounded-md p-5 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                <Building size={16} className="text-zinc-400" /> Phân quyền thiết bị
              </h3>
              <button
                onClick={() => setSelectedUserForAssign(null)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Gán thiết bị phụ trách cho người dùng <strong className="text-zinc-200 font-mono">{selectedUserForAssign.username}</strong>:
            </p>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-zinc-300 block mb-1 font-sans">Chọn thiết bị trong hệ thống:</label>
                <select
                  value={deviceToAssign}
                  onChange={(e) => setDeviceToAssign(e.target.value)}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 focus:border-zinc-600 focus:outline-none"
                >
                  <option value="">-- Chọn mã thiết bị --</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} - {d.name} ({d.location})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => setSelectedUserForAssign(null)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
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
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 font-semibold border border-zinc-700 transition-colors"
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111318] border border-zinc-800 rounded-md p-5 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                <Cpu size={16} className="text-zinc-400" /> Thêm Thiết bị Mới
              </h3>
              <button
                onClick={() => setIsAddDeviceModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateDevice} className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-zinc-300 block mb-1 font-sans">Mã thiết bị (ID) *:</label>
                <input
                  type="text"
                  required
                  placeholder="ví dụ: ESP32_DEV_04"
                  value={newDeviceData.id}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, id: e.target.value }))}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">Tên thiết bị *:</label>
                <input
                  type="text"
                  required
                  placeholder="ví dụ: Cảm biến Khí Ga Kho Sơn"
                  value={newDeviceData.name}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-sans focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">Vị trí lắp đặt *:</label>
                <input
                  type="text"
                  required
                  placeholder="ví dụ: Khu B - Tầng 2"
                  value={newDeviceData.location}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-sans focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-zinc-300 block mb-1 font-sans">Ngưỡng nhiệt (°C):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newDeviceData.temp_threshold}
                    onChange={(e) =>
                      setNewDeviceData((prev) => ({ ...prev, temp_threshold: parseFloat(e.target.value) || 55 }))
                    }
                    className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-white font-mono focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-300 block mb-1 font-sans">Ngưỡng Gas (PPM):</label>
                  <input
                    type="number"
                    step="10"
                    value={newDeviceData.gas_threshold}
                    onChange={(e) =>
                      setNewDeviceData((prev) => ({ ...prev, gas_threshold: parseFloat(e.target.value) || 400 }))
                    }
                    className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1 text-white font-mono focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">URL Camera giám sát (Tùy chọn):</label>
                <input
                  type="text"
                  placeholder="ví dụ: http://192.168.1.238:8080/video"
                  value={newDeviceData.camera_url}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, camera_url: e.target.value }))}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">
                  ID ESP32 nguồn để cấp phát thiết bị:
                </label>
                <input
                  type="text"
                  required
                  value={newDeviceData.provision_from_device_id}
                  onChange={(e) =>
                    setNewDeviceData((prev) => ({
                      ...prev,
                      provision_from_device_id: e.target.value.trim(),
                    }))
                  }
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono focus:border-zinc-600 focus:outline-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1 font-sans">
                  ESP32 này sẽ nhận lệnh MQTT, đổi sang ID mới và tự kết nối lại.
                </p>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-sans">Người phụ trách thiết bị:</label>
                <select
                  value={newDeviceData.assigned_user_id}
                  onChange={(e) => setNewDeviceData((prev) => ({ ...prev, assigned_user_id: e.target.value }))}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 focus:border-zinc-600 focus:outline-none"
                >
                  <option value="">-- Mặc định (Tự gán cho {currentUser?.fullName || currentUser?.username || 'tôi'}) --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role}) {u.email ? `- ${u.email}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => setIsAddDeviceModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors border border-red-600"
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#111318] border border-zinc-800 rounded-md p-5 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                <FileText size={16} className="text-zinc-400" /> Chi tiết Nhật ký Kiểm toán #{selectedAuditDetail.id}
              </h3>
              <button
                onClick={() => setSelectedAuditDetail(null)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="grid grid-cols-2 gap-2 text-zinc-300">
                <div>
                  <span className="text-zinc-500 block text-[11px]">Thời gian:</span>
                  <span>{formatVietnamDateTime(selectedAuditDetail.created_at)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Hành động:</span>
                  <span className="font-bold text-zinc-100">{selectedAuditDetail.action}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Người thực hiện:</span>
                  <span>{selectedAuditDetail.username || selectedAuditDetail.user_id || 'System'}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Địa chỉ IP:</span>
                  <span>{selectedAuditDetail.ip || 'Local / Internal'}</span>
                </div>
              </div>

              <div>
                <span className="text-zinc-400 block mb-1 font-medium font-sans">Dữ liệu chi tiết (JSON Payload):</span>
                <pre className="p-2.5 rounded bg-[#090a0f] border border-zinc-800 text-zinc-200 font-mono text-[11px] overflow-x-auto max-h-56">
                  {JSON.stringify(selectedAuditDetail.detail, null, 2)}
                </pre>
              </div>

              <div className="pt-1.5 flex justify-end font-sans">
                <button
                  type="button"
                  onClick={() => setSelectedAuditDetail(null)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 5: SỬA NGƯỠNG CẢNH BÁO CHO TỪNG THIẾT BỊ                    */}
      {/* ================================================================= */}
      {editingThresholdDevice && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111318] border border-zinc-800 rounded-md p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                <Sliders size={15} className="text-zinc-400" />
                <span>Sửa ngưỡng · {editingThresholdDevice.id}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingThresholdDevice(null)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              Thiết bị: <strong className="text-zinc-200">{editingThresholdDevice.name}</strong> ({editingThresholdDevice.location})
            </div>

            <form onSubmit={handleSaveDeviceThreshold} className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-zinc-400 block mb-1">Ngưỡng nhiệt độ (°C) · Giới hạn (20 - 100):</label>
                <input
                  type="number"
                  step="0.5"
                  min="20.5"
                  max="100"
                  required
                  value={editTempThreshold}
                  onChange={(e) => setEditTempThreshold(e.target.value)}
                  disabled={isSavingDeviceThreshold}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 focus:border-zinc-600 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Ngưỡng khói / khí Gas (PPM) · Giới hạn (50 - 2000):</label>
                <input
                  type="number"
                  step="10"
                  min="51"
                  max="2000"
                  required
                  value={editGasThreshold}
                  onChange={(e) => setEditGasThreshold(e.target.value)}
                  disabled={isSavingDeviceThreshold}
                  className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 focus:border-zinc-600 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => setEditingThresholdDevice(null)}
                  disabled={isSavingDeviceThreshold}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingDeviceThreshold}
                  className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors border border-red-600 disabled:opacity-50"
                >
                  {isSavingDeviceThreshold ? 'Đang lưu & gửi lệnh...' : 'Lưu & Gửi xuống ESP32'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
