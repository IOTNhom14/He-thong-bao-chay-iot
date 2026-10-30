export interface AckPayload {
  command_id: string;
  device_id: string;
  status: 'SUCCESS' | 'FAILED';
  message: string;
}

type AckListener = (ack: AckPayload) => void;

const listeners = new Set<AckListener>();

export const ackEmitter = {
  emit(ack: AckPayload) {
    listeners.forEach((listener) => {
      try {
        listener(ack);
      } catch (err) {
        console.error('Lỗi khi kích hoạt listener ACK:', err);
      }
    });
  },

  subscribe(listener: AckListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
