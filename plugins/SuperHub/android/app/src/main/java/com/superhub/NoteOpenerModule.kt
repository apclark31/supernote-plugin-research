package com.superhub

import android.content.ComponentName
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import java.io.File

class NoteOpenerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NoteOpener"

    companion object {
        private const val TAG = "NoteOpener"
    }

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

    @ReactMethod
    fun getLastModified(path: String, promise: Promise) {
        try {
            val file = File(path)
            if (file.exists()) {
                promise.resolve(file.lastModified().toDouble())
            } else {
                promise.resolve(0.0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "getLastModified failed", e)
            promise.reject("GET_LAST_MODIFIED_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getFileSize(path: String, promise: Promise) {
        try {
            val file = File(path)
            if (file.exists()) {
                promise.resolve(file.length().toDouble())
            } else {
                promise.resolve(0.0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "getFileSize failed", e)
            promise.reject("GET_FILE_SIZE_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getFileStats(paths: ReadableArray, promise: Promise) {
        try {
            val results = Arguments.createArray()
            for (i in 0 until paths.size()) {
                val path = paths.getString(i) ?: continue
                val file = File(path)
                val map = Arguments.createMap()
                map.putString("path", path)
                if (file.exists()) {
                    map.putDouble("lastModified", file.lastModified().toDouble())
                    map.putDouble("size", file.length().toDouble())
                    map.putBoolean("isDirectory", file.isDirectory)
                } else {
                    map.putDouble("lastModified", 0.0)
                    map.putDouble("size", 0.0)
                    map.putBoolean("isDirectory", false)
                }
                results.pushMap(map)
            }
            promise.resolve(results)
        } catch (e: Exception) {
            Log.e(TAG, "getFileStats failed", e)
            promise.reject("GET_FILE_STATS_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }
}
