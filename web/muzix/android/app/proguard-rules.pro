# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# expo-audio (AVPlayer/AudioPlayer)
-keep class expo.modules.audio.** { *; }

# expo-file-system
-keep class expo.modules.filesystem.** { *; }

# expo-image
-keep class expo.modules.imageloader.** { *; }
-keep class com.bumptech.glide.** { *; }

# expo-blur
-keep class expo.modules.blur.** { *; }

# expo-sharing
-keep class expo.modules.sharing.** { *; }

# @hugeicons
-keep class com.hugeicons.** { *; }

# expo-modules-core (autolinking)
-keep class expo.modules.** { *; }

# zustand
-keep class ** implements com.facebook.react.bridge.NativeModule { *; }
