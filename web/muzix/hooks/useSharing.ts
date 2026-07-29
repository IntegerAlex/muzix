import { useState, useCallback } from 'react';
import { Platform, Share } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/services/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ShareContent {
  contentType: 'song' | 'album' | 'artist' | 'playlist' | 'lyrics';
  contentId: string;
  title: string;
  artist?: string;
  imageUrl?: string;
  lyrics?: string[];
  selectedLyricsLines?: number[];
}

interface GeneratedShare {
  share_token: string;
  share_url: string;
  content_type: string;
  content_id: string;
  title: string;
  artist: string;
  image_url: string;
  expires_at: string;
}

export function useSharing() {
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const resetError = useCallback(() => setShareError(null), []);

  const generateShareLink = useCallback(async (content: ShareContent): Promise<GeneratedShare> => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${API_URL}/api/share/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content_type: content.contentType,
        content_id: content.contentId,
        selected_lyrics_lines: content.selectedLyricsLines,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to generate share link' }));
      throw new Error(err.detail || 'Failed to generate share link');
    }

    const json = await res.json();
    return json.data as GeneratedShare;
  }, []);

  const share = useCallback(async (content: ShareContent) => {
    setIsSharing(true);
    setShareError(null);

    try {
      const generated = await generateShareLink(content);

      const shareText = content.contentType === 'lyrics'
        ? (content.lyrics?.join('\n') ?? '')
        : `Check out "${content.title}"${content.artist ? ` by ${content.artist}` : ''} on Muzix`;

      const shareUrl = generated.share_url;

      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          try {
            await navigator.share({
              title: content.title,
              text: shareText,
              url: shareUrl,
            });
          } catch {
            // Share cancelled or not supported — fall back to clipboard
          }
        }
        if (typeof navigator !== 'undefined') {
          try {
            await navigator.clipboard.writeText(shareUrl);
          } catch {
            // Fallback: textarea trick
            const ta = document.createElement('textarea');
            ta.value = shareUrl;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
        }
      } else {
        await Share.share({
          message: `${shareText}\n\n${shareUrl}`,
          title: content.title,
          url: shareUrl,
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      const msg = err?.message ?? 'Failed to share';
      setShareError(msg);
      throw err;
    } finally {
      setIsSharing(false);
    }
  }, [generateShareLink]);

  return { share, isSharing, shareError, resetError };
}
