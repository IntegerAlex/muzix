import { useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export function useLyricsSharing() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const imageRef = useRef<View>(null);

  const share = useCallback(async () => {
    if (!imageRef.current) return;
    setIsGenerating(true);
    setShareError(null);
    try {
      const uri = await captureRef(imageRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share lyrics',
        });
      } else {
        setShareError('Sharing is not available on this device');
      }
    } catch {
      setShareError('Failed to share lyrics');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { imageRef, share, isGenerating, shareError };
}
