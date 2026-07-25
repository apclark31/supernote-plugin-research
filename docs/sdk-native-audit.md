# sn-plugin-lib Native Source Audit (T-002)

> Full read of the SDK's shipped Java/Kotlin sources (2026-07-24, session 34).
> Sources live at `node_modules/sn-plugin-lib/android/src/main/java/com/ratta/supernote/pluginlib/`.
> The only binary (`plugincommonlib.aar`) holds AIDL parcelables only -- host-side
> implementations live in the Ratta apps and are NOT in the package. The SDK is a
> thin RN-bridge shim; host behavior is inferred from signatures/parcelables.

## Headline answers to the questions that motivated the audit

| Question | Verdict |
|---|---|
| Can a plugin intercept custom URL-scheme link taps? | **No.** Zero URI/scheme/IntentFilter/BroadcastReceiver handling anywhere in the SDK. Confirms ratta-feedback item 7 is a genuine gap, and F-027's gesture+cache approach is the ceiling today. |
| Page navigation API? | **None** ("goto page N" doesn't exist). Nearest levers: linkType 0 LinkTrail (native tap = intra-file page jump) and the host-app intent we already use (NoteInsidePagesActivity). |
| Background execution? | **Essentially none.** No alarms/services/receivers. Events only fire while the RN context lives. Closest: `setSystemDormancyState(false)` keeps the device awake. |
| File writes beyond FileUtils? | Internal helpers exist (`saveTextToFile`, `saveBitmapToPng`, `moveFile`, `unZip`) but are NOT TurboModule-exposed. The documented surface stands. |

## Undocumented / hidden capabilities (ranked)

1. **DexUtils dynamic code loading** (`utils/DexUtils.java`, `Constant.java:12-17`):
   plugin bundles can declare `DexDependencies.json` / `dexPath` / `soDirPath` and the
   SDK will DexClassLoader arbitrary dex + native .so at runtime. No caller in shipped
   source (wired host-side). Most powerful -- and most security-relevant -- mechanism
   in the package. **Policy for our plugins: do not use;** we already ship native code
   through the sanctioned npk path.
2. **LinkTrail fields stripped from JS** (`ConvertUtils.java:297-450` + aar javap):
   parcelable carries `destFileId`, `destPageId`, `linkInout`, `linkTimestamp`,
   `newDestPageNum` -- all commented out when marshalling to JS. `LINK_TYPES {0..4}`;
   TS comment confirms `destPage` only applies to linkType 0 (intra-file jump).
   Relevance: **F-004 dashboard entries can be linkType 1 (file) links for native-tap
   cross-note navigation** -- same mechanism the session-19 temp links proved on-device.
3. **FileSelector hidden params** (`FileSelector.java:100-161`, `SelectFileParamKey.java`):
   `selectFile` accepts undocumented `needSelectFolder`, `limitPath`, `maxNum`,
   `selectPathList`, etc. -- the native picker can be pinned to a folder or made a
   folder-chooser. Future enabler: "attach/link a note to a task" picker UI.
4. **`openFilePath` sends more than documented** (`RTNFileModule.java:415-428`):
   also `folder_path` (current file's path) and `source_type=2` to
   FileManagerMainActivity.
5. **NativePluginManager methods without friendly wrappers**: `getOrientation`,
   `normalize`, `invalidatePluginView`, `sendPluginEvent(type,data)`,
   `modifyButtonRes` (rename/re-icon buttons post-registration?), `onMounted`/`onStop`.
   `setFullAuto` is an empty stub. Callable via `NativeModules.NativePluginManager`.
6. **`getPageRotationType` is dead**: exposed in TS (`PluginFileAPI.ts`) but the native
   implementation is commented out (`CommAPIModule.java:1909-1934`). Never call it.
   (Filed in ratta-feedback.)
7. **Keep-awake / system-UI locks**: `setSystemDormancyState(bool)`,
   `setStatusBarAndSlideBarState(bool)` -- useful for long OCR/sync passes so the
   device doesn't sleep mid-operation.
8. **Path sandboxing facts**: `FileUtils.isValidPath` allows plugin dir + the six
   Ratta roots (`Document/EXPORT/INBOX/MyStyle/Note/SCREENSHOT`) + external volumes;
   blocks traversal and special chars. `PluginCheck` restricts java.io.File to a
   plugins dir under host package id `com.ratta.supernote.testfile` (a TEST build id;
   validation no-ops when pluginId unset).
9. **File scan roots** for `getFileList`/`getImageList` are hardcoded to the six Ratta
   dirs + OTG/SD, via a native lib (`NativeJNI.getFilePath`).

## Immediate implications for SuperTask

- **F-027 stands as final form** -- no native tap-intercept exists to replace it.
- **F-004 dashboard should use linkType 1 file-links per row** -- native tap opens the
  source note; no gesture needed on the dashboard. (linkType 0 + destPage for
  same-note rows.)
- **Long OCR/heal passes** can wrap in `setSystemDormancyState(true/false)` if device
  sleep ever interrupts them.
- `modifyButtonRes` might allow dynamic toolbar-button labels (e.g. task count badge)
  -- unverified, on-device probe needed before relying on it.
