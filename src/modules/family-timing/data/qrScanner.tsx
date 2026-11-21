import { Camera, CameraView } from 'expo-camera';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

// The port to the phone's camera for reading the QR of a swimmer's share code (issue 1322). The screen only sees this port; the adapter
// below wraps expo-camera, and the tests use a fake. The image is never kept: the camera only hands over the text of the QR.

export type QrScannerProps = {
  /** The text of a QR the camera read; it may fire more than once for the same QR. */
  onScan: (data: string) => void;
  /** The camera could not open (another app has it, the provider failed, no camera). */
  onError: () => void;
  style?: StyleProp<ViewStyle>;
};

export type QrScanner = {
  /** Asks for the camera permission; false when the person refuses it or the phone has no camera. */
  requestPermission(): Promise<boolean>;
  /** The rear camera's live image, reading QR codes. */
  Scanner: ComponentType<QrScannerProps>;
};

function NativeScanner({ onScan, onError, style }: QrScannerProps) {
  return (
    <CameraView
      style={style}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }) => onScan(data)}
      onMountError={onError}
    />
  );
}

export const qrScanner: QrScanner = {
  async requestPermission() {
    try {
      // The camera is optional hardware (issue 1292): without one the person types the code.
      if (!(await CameraView.isAvailableAsync())) return false;
      return (await Camera.requestCameraPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },
  Scanner: NativeScanner,
};
