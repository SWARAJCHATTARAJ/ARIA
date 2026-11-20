import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

export function showDownloadToast(message: string, isError = false) {
  const existing = document.getElementById('aria-download-toast');
  if (existing) {
    existing.remove();
  }
  const toast = document.createElement('div');
  toast.id = 'aria-download-toast';
  toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-xl border ${
    isError
      ? 'bg-[#181113] border-red-500/40 text-red-300'
      : 'bg-[#0B0F1A] border-[#60A5FA]/30 text-zinc-100'
  } shadow-2xl backdrop-blur-md text-[12.5px] font-sans flex items-center gap-2 pointer-events-none transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`;

  toast.innerHTML = isError
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-400 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${message}</span>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 shrink-0"><path d="M20 6L9 17l-5-5"/></svg><span>${message}</span>`;

  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, 8px)';
      setTimeout(() => toast.remove(), 250);
    }
  }, 3500);
}

export async function saveOrDownloadFile(
  blob: Blob,
  filename: string,
  _mimeType: string = 'application/octet-stream'
): Promise<boolean> {
  try {
    if (!blob || blob.size === 0) {
      showDownloadToast('Export failed: Empty file content received.', true);
      return false;
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');

    if (Capacitor.isNativePlatform()) {
      const pureBase64 = await blobToBase64(blob);

      // Write raw bytes to Directory.Cache without encoding parameter to prevent binary corruption
      await Filesystem.writeFile({
        path: safeFilename,
        data: pureBase64,
        directory: Directory.Cache,
      });

      const { uri } = await Filesystem.getUri({
        path: safeFilename,
        directory: Directory.Cache,
      });

      // Always launch native Android Share/Open sheet with files: [uri]
      await Share.share({
        title: safeFilename,
        files: [uri],
        dialogTitle: `Open or Save ${safeFilename}`,
      });

      showDownloadToast(`Ready: ${safeFilename}`);
      return true;
    } else {
      // Standard browser/desktop download
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
      }, 100);
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
