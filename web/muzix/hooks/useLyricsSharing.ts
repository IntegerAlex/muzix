import { useRef, useState, useCallback } from 'react';
import { View, Platform } from 'react-native';
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
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });

      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        const file = new File([blob], 'lyrics.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
        } else {
          const a = document.createElement('a');
          a.href = uri;
          a.download = 'lyrics.png';
          a.click();
        }
      } else if (await Sharing.isAvailableAsync()) {
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
