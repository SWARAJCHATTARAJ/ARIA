package com.aria.app;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "DirectDownload")
public class DirectDownloadPlugin extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename", "aria-export.bin");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64Data = call.getString("base64Data", "");

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("Download failed: Empty file content received.");
            return;
        }

        // Strip data:*;base64, prefix if present
        String cleanBase64 = base64Data;
        int commaIdx = cleanBase64.indexOf(',');
        if (commaIdx != -1) {
            cleanBase64 = cleanBase64.substring(commaIdx + 1);
        }
        cleanBase64 = cleanBase64.trim();

        byte[] rawBytes;
        try {
            rawBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Download failed: Invalid base64 data - " + e.getMessage(), e);
            return;
        }

        if (rawBytes == null || rawBytes.length == 0) {
            call.reject("Download failed: Decoded file buffer is empty.");
            return;
        }

        // Sanitize filename (remove illegal path characters, collapse whitespace)
        String sanitized = (filename != null ? filename : "aria-export.bin")
                .replaceAll("[\\\\/:*?\"<>|]", "_")
                .replaceAll("\\s+", "_")
                .trim();
        if (sanitized.isEmpty()) {
            sanitized = "aria-export.bin";
        }
        final String finalName = sanitized;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ (API 29+): Scoped MediaStore.Downloads API
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, finalName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ARIA");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri contentUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (contentUri == null) {
                    call.reject("Download failed: Failed to create MediaStore entry in Downloads/ARIA");
                    return;
                }

                try (OutputStream os = resolver.openOutputStream(contentUri)) {
                    if (os == null) {
                        call.reject("Download failed: Failed to open output stream for " + contentUri);
                        return;
                    }
                    os.write(rawBytes);
                    os.flush();
                }

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(contentUri, values, null, null);

                // Fetch actual display name if MediaStore appended an index (e.g. filename (1).pdf)
                String resolvedName = finalName;
                try (Cursor cursor = resolver.query(contentUri, new String[]{MediaStore.Downloads.DISPLAY_NAME}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int idx = cursor.getColumnIndex(MediaStore.Downloads.DISPLAY_NAME);
                        if (idx != -1) {
                            String colVal = cursor.getString(idx);
                            if (colVal != null && !colVal.trim().isEmpty()) {
                                resolvedName = colVal;
                            }
                        }
                    }
                } catch (Exception ignored) {
                    // Fall back to finalName
                }

                JSObject ret = new JSObject();
                ret.put("uri", contentUri.toString());
                ret.put("displayPath", "Downloads/ARIA/" + resolvedName);
                call.resolve(ret);

            } else {
                // Android 9 and below: Direct public storage write
                File publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File ariaDir = new File(publicDownloads, "ARIA");
                if (!ariaDir.exists()) {
                    boolean created = ariaDir.mkdirs();
                    if (!created && !ariaDir.isDirectory()) {
                        call.reject("Download failed: Could not create ARIA directory in Downloads");
                        return;
                    }
                }

                File targetFile = new File(ariaDir, finalName);
                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    fos.write(rawBytes);
                    fos.flush();
                }

                Uri fileUri;
                try {
                    fileUri = FileProvider.getUriForFile(
                            getContext(),
                            getContext().getPackageName() + ".fileprovider",
                            targetFile
                    );
                } catch (Exception ex) {
                    fileUri = Uri.fromFile(targetFile);
                }

                JSObject ret = new JSObject();
                ret.put("uri", fileUri.toString());
                ret.put("displayPath", "Downloads/ARIA/" + finalName);
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Download failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String uriString = call.getString("uri");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (uriString == null || uriString.trim().isEmpty()) {
            call.reject("Cannot open file: URI is missing");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Context context = getContext();
            try {
                context.startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException anfe) {
                // Fallback to system app chooser
                try {
                    Intent chooser = Intent.createChooser(intent, "Open file with");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    context.startActivity(chooser);
                    call.resolve();
                } catch (Exception ex) {
                    call.reject("No viewer app available to open this file (" + mimeType + ")", ex);
                }
            }
        } catch (Exception e) {
            call.reject("Failed to open file: " + e.getMessage(), e);
        }
    }
}
