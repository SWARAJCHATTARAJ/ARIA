import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface DirectDownloadPlugin {
  saveToDownloads(options: {
    filename: string;
    mimeType: string;
    base64Data: string;
  }): Promise<{ uri: string; displayPath: string }>;

  openFile(options: {
    uri: string;
    mimeType: string;
  }): Promise<void>;
}

export const DirectDownload = registerPlugin<DirectDownloadPlugin>('DirectDownload');

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const pureBase64 = result.split(',').pop() || '';
      resolve(pureBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export function showDownloadToast(
  message: string,
  isError = false,
  action?: ToastAction
) {
  const existing = document.getElementById('aria-download-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'aria-download-toast';
  // Positioned above bottom composer, theme-aware, clickable pointer events
  toast.className = `fixed bottom-24 sm:bottom-20 left-1/2 -translate-x-1/2 z-[9999] max-w-[90vw] px-4 py-2.5 rounded-xl border ${
    isError
      ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-[#181113] dark:border-red-500/40 dark:text-red-300'
      : 'bg-white border-slate-200 text-slate-800 shadow-slate-900/10 dark:bg-[#0B0F1A] dark:border-[#60A5FA]/30 dark:text-zinc-100 dark:shadow-black/50'
  } shadow-2xl backdrop-blur-md text-[13px] font-sans flex items-center gap-2 pointer-events-auto transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`;

  const iconWrapper = document.createElement('span');
  iconWrapper.className = 'shrink-0 flex items-center';
  iconWrapper.innerHTML = isError
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-rose-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><path d="M20 6L9 17l-5-5"/></svg>`;
  toast.appendChild(iconWrapper);

  const msgSpan = document.createElement('span');
  msgSpan.className = 'truncate max-w-[260px] sm:max-w-md font-medium';
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className =
      'ml-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-sm transition-colors cursor-pointer shrink-0';
    actionBtn.textContent = action.label;
    actionBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await action.onClick();
      } catch (err) {
        console.error('Toast action failed:', err);
      }
    };
    toast.appendChild(actionBtn);
  }

  document.body.appendChild(toast);

  const duration = action ? 6000 : 3500;
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, 8px)';
      setTimeout(() => toast.remove(), 250);
    }
  }, duration);
}

export async function saveOrDownloadFile(
  blob: Blob,
  filename: string,
  mimeType: string = 'application/octet-stream',
  options?: { autoOpen?: boolean }
): Promise<boolean> {
  try {
    if (!blob || blob.size === 0) {
      showDownloadToast('Export failed: Empty file content received.', true);
      return false;
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');

    // On Android Native: Direct MediaStore one-tap save into Downloads/ARIA/
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const pureBase64 = await blobToBase64(blob);

      try {
        const res = await DirectDownload.saveToDownloads({
          filename: safeFilename,
          mimeType,
          base64Data: pureBase64,
        });

        const displayPath = res?.displayPath || `Downloads/ARIA/${safeFilename}`;
        if (options?.autoOpen && res?.uri) {
          try {
            await DirectDownload.openFile({ uri: res.uri, mimeType });
          } catch {
            // Viewer may be absent on some formats; fall back to toast with Open button
          }
        }
        showDownloadToast(`Saved to ${displayPath}`, false, {
          label: 'Open',
          onClick: async () => {
            try {
              await DirectDownload.openFile({
                uri: res.uri,
                mimeType,
              });
            } catch (openErr: any) {
              console.error('Failed to open downloaded file:', openErr);
              showDownloadToast(`Could not open file: ${openErr?.message || 'No viewer app'}`, true);
            }
          },
        });
        return true;
      } catch (directErr: any) {
        console.warn('DirectDownload failed, falling back to Filesystem + Share:', directErr);
        // Fallback to @capacitor/filesystem + @capacitor/share
        await Filesystem.writeFile({
          path: safeFilename,
          data: pureBase64,
          directory: Directory.Cache,
        });

        const { uri } = await Filesystem.getUri({
          path: safeFilename,
          directory: Directory.Cache,
        });

        await Share.share({
          title: safeFilename,
          files: [uri],
          dialogTitle: `Open or Save ${safeFilename}`,
        });

        showDownloadToast(`Ready: ${safeFilename}`);
        return true;
      }
    } else if (Capacitor.isNativePlatform()) {
      // Other native platforms (e.g. iOS): Write to cache and present Share sheet
      const pureBase64 = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: safeFilename,
        data: pureBase64,
        directory: Directory.Cache,
      });

      const { uri } = await Filesystem.getUri({
        path: safeFilename,
        directory: Directory.Cache,
      });

      await Share.share({
        title: safeFilename,
        files: [uri],
        dialogTitle: `Open or Save ${safeFilename}`,
      });

      showDownloadToast(`Ready: ${safeFilename}`);
      return true;
    } else {
      // Standard browser & desktop Windows/Linux/macOS download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 1500);
      showDownloadToast(`Downloaded: ${safeFilename}`);
      return true;
    }
  } catch (err: any) {
    console.error('saveOrDownloadFile error:', err);
    if (err?.message?.includes('canceled') || err?.message?.includes('dismissed') || err?.name === 'AbortError') {
      return false;
    }
    showDownloadToast(`Download failed: ${err?.message || 'Unknown error'}`, true);
    return false;
  }
}
