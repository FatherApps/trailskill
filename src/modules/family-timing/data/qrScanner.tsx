import { requireOptionalNativeModule } from 'expo-modules-core';
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

type ExpoCamera = typeof import('expo-camera');

/** The scanner on top of expo-camera, or null where the library is not there (no scanner is offered). */
export function qrScannerFor(camera: ExpoCamera | null): QrScanner | null {
  if (!camera) return null;
  const { Camera, CameraView } = camera;
  return {
    async requestPermission() {
      try {
        // CameraView.isAvailableAsync is web-only (it throws UnavailabilityError on Android and iOS), so it must not gate the permission.
        // A phone without a camera ends in onMountError, and the person types the code (issue 1292).
        return (await Camera.requestCameraPermissionsAsync()).granted;
      } catch {
        return false;
      }
    },
    Scanner: function NativeScanner({ onScan, onError, style }) {
      return (
        <CameraView
          style={style}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => onScan(data)}
          onMountError={onError}
        />
      );
    },
  };
}

/**
 * expo-camera throws when it is imported without its native module, which a build made before this library joined the app does not
 * have (as with videoCamera and doNotDisturb): the library is only loaded when the module is installed, and any failure leaves no scanner.
 */
export function loadQrScanner(installed: boolean, load: () => ExpoCamera): QrScanner | null {
  if (!installed) return null;
  try {
    return qrScannerFor(load());
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import makes every build without the native module fail at startup
export const qrScanner: QrScanner | null = loadQrScanner(!!requireOptionalNativeModule('ExpoCamera'), () => require('expo-camera') as ExpoCamera);
