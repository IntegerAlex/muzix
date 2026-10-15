package com.muzix.app

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.media.AudioManager
import android.os.Build

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  /**
   * Android sends ACTION_AUDIO_BECOMING_NOISY when wired headphones are
   * unplugged or a Bluetooth audio device disconnects (audio is about to
   * reroute to the built-in speaker). expo-audio ignores this broadcast on
   * Android (expo/expo#48138, fixed upstream only in expo-audio 58), so
   * forward it to JS, which pauses playback like other music apps.
   *
   * Application-scoped on purpose: registered for the process lifetime so it
   * still fires while playback continues in the background.
   */
  private val becomingNoisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action != AudioManager.ACTION_AUDIO_BECOMING_NOISY) return
      reactHost.currentReactContext?.emitDeviceEvent("muzix.becomingNoisy", null)
    }
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)

    // Becoming-noisy is a system broadcast: it is delivered to
    // non-exported receivers, and the flags are only required on API 33+.
    val noisyFilter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(becomingNoisyReceiver, noisyFilter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(becomingNoisyReceiver, noisyFilter)
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
