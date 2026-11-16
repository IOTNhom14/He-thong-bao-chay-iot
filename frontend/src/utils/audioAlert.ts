// Tiện ích âm thanh còi báo cháy sử dụng Web Audio API thuần (Không cần file mp3 ngoại vi)
class AudioAlertService {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isMutedLocally = false;

  private initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Bắt đầu phát âm thanh còi báo động (Siren tone: đổi tần số 800Hz <-> 1200Hz)
  public startAlarm() {
    if (this.isPlaying || this.isMutedLocally) return;

    try {
      this.initContext();
      if (!this.audioCtx) return;

      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      this.oscillator.type = 'sawtooth'; // Âm thanh sắc nét như còi báo cháy
      this.oscillator.frequency.setValueAtTime(850, this.audioCtx.currentTime);

      // Âm lượng vừa phải (15%) để không gây khó chịu quá mức
      this.gainNode.gain.setValueAtTime(0.15, this.audioCtx.currentTime);

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator.start();
      this.isPlaying = true;

      // Tạo hiệu ứng còi hú biến điệu (Modulated Siren)
      let highTone = false;
      this.intervalId = setInterval(() => {
        if (!this.oscillator || !this.audioCtx) return;
        highTone = !highTone;
        const targetFreq = highTone ? 1150 : 750;
        this.oscillator.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.1);
      }, 400);
    } catch (err) {
      console.warn('[AudioAlert]: Không thể tự động phát âm thanh (yêu cầu người dùng tương tác trước):', err);
    }
  }

  // Dừng âm thanh còi báo động
  public stopAlarm() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
        // Đã dừng
      }
      this.oscillator = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // Đã ngắt
      }
      this.gainNode = null;
    }
    this.isPlaying = false;
  }

  // Tắt tiếng tạm thời trên trình duyệt máy tính
  public muteLocal(mute: boolean) {
    this.isMutedLocally = mute;
    if (mute) {
      this.stopAlarm();
    }
  }

  public getIsMutedLocally(): boolean {
    return this.isMutedLocally;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audioAlert = new AudioAlertService();
