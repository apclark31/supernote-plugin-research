# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# PluginHost provides these at runtime -- not in the compile classpath
-dontwarn com.ratta.supernote.plugincommon.**
-dontwarn javax.ws.rs.**
-dontwarn org.glassfish.jersey.**

# Keep sn-plugin-lib bridge intact (PluginHost calls into these via reflection)
-keep class com.ratta.supernote.pluginlib.** { *; }

# Keep RNFS native module (registered via reactPackages in PluginConfig.json)
-keep class com.rnfs.** { *; }
