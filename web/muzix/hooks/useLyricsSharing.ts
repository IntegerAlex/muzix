import { useRef, useState, useCallback } from 'react';
import { View, Platform } from 'react-native';

export function useLyricsSharing() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const imageRef = useRef<View>(null);

  const generate = useCallback(async (): Promise<string | null> => {
    if (!imageRef.current) return null;
    setIsGenerating(true);
    setShareError(null);
    try {
      const { captureRef } = await import('react-native-view-shot');
      const uri = await captureRef(imageRef.current, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      return uri;
    } catch {
      setShareError('Failed to generate image');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const shareUri = useCallback(async (uri: string) => {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      const file = new File([blob], 'lyrics.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'MUZIX Lyrics' });
      } else {
        const a = document.createElement('a');
        a.href = uri;
        a.download = 'muzix-lyrics.png';
        a.click();
      }
    } else {
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share lyrics',
        });
      } else {
        setShareError('Sharing is not available on this device');
      }
    }
  }, []);

  const share = useCallback(async () => {
    const uri = await generate();
    if (uri) await shareUri(uri);
  }, [generate, shareUri]);

  return { imageRef, generate, shareUri, share, isGenerating, shareError };
}
