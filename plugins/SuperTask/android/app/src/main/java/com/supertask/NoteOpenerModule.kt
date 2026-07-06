package com.supertask

import android.content.ComponentName
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native module for cross-note navigation via Android Intents.
 *
 * Uses explicit component targeting discovered by AgP42/supernote-dashboard (MIT).
 * Key findings:
 * - Target NoteInsidePagesActivity (not NoteMainActivity) for the editor
 * - Use "file_path" extra (not "only_open_file")
 * - Use reactApplicationContext (not HostContext) to avoid SDK interception
 * - No URI/FileProvider needed -- pass path as plain string extra
 *
 * See docs/design-native-intents.md for full rationale.
 */
class NoteOpenerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NoteOpener"

    companion object {
        private const val TAG = "NoteOpener"
    }

    /**
     * Open a .note file in the editor at a specific page.
     * @param path Full path to the .note file
     * @param page 1-based page number (0 = last-used page)
     */
    @ReactMethod
    fun openNote(path: String, page: Int, promise: Promise) {
        Log.i(TAG, "openNote path=$path page=$page")
        try {
            val intent = Intent().apply {
                component = ComponentName(
                    "com.ratta.supernote.note",
                    "com.ratta.supernote.note.view.NoteInsidePagesActivity"
                )
                putExtra("file_path", path)
                if (page > 0) putExtra("page", page)
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "openNote failed", e)
            promise.reject("OPEN_NOTE_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    /**
     * Open a folder in the Supernote file manager.
     * @param folderPath Full path to the folder
     */
    @ReactMethod
    fun openFolder(folderPath: String, promise: Promise) {
        Log.i(TAG, "openFolder path=$folderPath")
        try {
            val intent = Intent().apply {
                component = ComponentName(
                    "com.ratta.supernote.inbox",
                    "com.ratta.supernote.explorer.FileManagerMainActivity"
                )
                putExtra("folder_path", folderPath)
                putExtra("source_type", 2)
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "openFolder failed", e)
            promise.reject("OPEN_FOLDER_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    /**
     * Open a PDF/document in the Supernote Document viewer.
     * Note: page extra may be ignored by the viewer (always opens last-used page).
     * @param path Full path to the .pdf file
     * @param page 1-based page number (0 = last-used page)
     */
    @ReactMethod
    fun openDocument(path: String, page: Int, promise: Promise) {
        Log.i(TAG, "openDocument path=$path page=$page")
        try {
            val intent = Intent().apply {
                component = ComponentName(
                    "com.supernote.document",
                    "com.supernote.document.MainActivity"
                )
                putExtra("file_path", path)
                if (page > 0) putExtra("page", page)
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "openDocument failed", e)
            promise.reject("OPEN_DOC_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }
}
