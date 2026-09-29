package expo.modules.nearbybuddy

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.os.Build
import android.provider.Settings
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.BandwidthInfo
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionOptions
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionType
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

/**
 * Thin bridge over Google Nearby Connections for the buddy sync flow.
 *
 * One service id, point-to-point strategy, byte payloads (JSON strings).
 * Everything event-driven lands in JS via sendEvent; the JS side
 * (src/data/buddy-radio.ts) owns all protocol logic.
 */
class NearbyBuddyModule : Module() {
  private val serviceId = "com.calvinkohl.workoutdiary.buddy"

  // Nearby connects over Bluetooth and then tries to move the link onto Wi-Fi.
  // Under the default, BALANCED, it may change the phone's Wi-Fi state to get
  // there — a hotspot or Wi-Fi Direct, which can take a phone off the network
  // it was on — and it does so in the seconds after connect, the same seconds
  // the handshake runs in. That upgrade buys bandwidth, and everything Spotter
  // sends is JSON under the 32 KB byte-payload cap: there is nothing here for
  // it to carry. NON_DISRUPTIVE leaves both radios as it found them. Stated on
  // both sides of a link — the advertiser's options and the requester's —
  // because either end can start the upgrade.
  private val linkType = ConnectionType.NON_DISRUPTIVE

  // One client for the module's life. It used to be a getter, which built a
  // fresh ConnectionsClient for every call — a stop issued through a different
  // instance than the start it was stopping, and believed harmless rather than
  // known to be. Built on the *application* context, so what is cached never
  // holds the React context: that one is a weak reference that can be gone by
  // the time the teardown below wants the client. `lazy` does not cache a
  // throw, so a first call made before there is a context is simply retried by
  // the next one.
  private val clientHolder = lazy {
    val context = appContext.reactContext
      ?: throw CodedException("NO_CONTEXT", "React context gone", null)
    Nearby.getConnectionsClient(context.applicationContext)
  }
  private val client: ConnectionsClient by clientHolder

  // Every link, advertising and discovery — for the two moments nothing in JS
  // is left to own them (see the lifecycle hooks in the definition). A radio
  // that was never touched has no client, and tearing down is no reason to
  // build one.
  private fun dropEverything() {
    if (!clientHolder.isInitialized()) return
    runCatching { client.stopAllEndpoints() }
    outgoingPayloads.clear()
  }

  // Ids of payloads *this* phone sent, so onPayloadTransferUpdate can tell an
  // outgoing transfer from an incoming one — the update itself carries no
  // direction. Only an outgoing FAILURE means "our bytes never arrived", which
  // is what the JS zombie-teardown counts; an incoming failure is the peer's
  // problem and must not tear our link down. Cleared on any terminal status.
  private val outgoingPayloads: MutableSet<Long> = ConcurrentHashMap.newKeySet()

  // What a refused call is rejected with. Nearby refuses through an
  // ApiException, and its status code is the whole diagnosis — 8011 (endpoint
  // unknown) and 8012 (endpoint IO error) want different fixes, and 8025
  // (Location is off) is not a fault of the radio at all. A rejected promise
  // carries a code and a message and nothing else, so the status rides on the
  // code — "REQUEST_FAILED:8011" — where JS reads a number off a string this
  // module wrote, rather than out of a message Google did. Anything that is not
  // an ApiException keeps the bare code, exactly as before.
  private fun refusal(op: String, e: Exception): CodedException {
    val status = (e as? ApiException)?.statusCode
    return CodedException(if (status != null) "$op:$status" else op, e.message, e)
  }

  // Whether the Bluetooth switch is on; null when the phone will not say. A
  // read, not a gate: JS starts the radio either way and uses this to tell a
  // switch that is off from a stack that is still settling, which Nearby
  // reports with the same code. Needs no runtime permission — the legacy
  // BLUETOOTH one is install-time, and from Android 12 the call wants none.
  @SuppressLint("MissingPermission")
  private fun bluetoothOn(): Boolean? {
    val context = appContext.reactContext ?: return null
    return try {
      val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      manager?.adapter?.isEnabled
    } catch (e: Exception) {
      null
    }
  }

  // Whether the system Location switch is on; null when the phone will not
  // say. Older Android needs it for a Bluetooth scan and not for advertising,
  // which is how one phone comes to be seen while seeing nobody.
  private fun locationOn(): Boolean? {
    val context = appContext.reactContext ?: return null
    return try {
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
      if (manager == null) {
        null
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        manager.isLocationEnabled
      } else {
        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
          manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
      }
    } catch (e: Exception) {
      null
    }
  }

  private val payloadCallback = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      val bytes = payload.asBytes() ?: return
      sendEvent("onPayload", mapOf("endpointId" to endpointId, "data" to String(bytes, Charsets.UTF_8)))
    }

    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
      val outgoing = outgoingPayloads.contains(update.payloadId)
      when (update.status) {
        PayloadTransferUpdate.Status.SUCCESS -> {
          if (outgoing) outgoingPayloads.remove(update.payloadId)
          // Either direction completing proves the link is alive, which is all
          // the JS side reads onPayloadSent for.
          sendEvent("onPayloadSent", mapOf("endpointId" to endpointId, "payloadId" to update.payloadId.toString()))
        }
        PayloadTransferUpdate.Status.FAILURE -> {
          if (outgoing) {
            outgoingPayloads.remove(update.payloadId)
            // Delivery failed at the transport. sendPayload's own Task resolving
            // only means the payload was enqueued, so this update is the one place
            // Nearby admits the bytes never arrived — which the JS side reads as
            // "this link is dead even though onDisconnected hasn't fired". Only
            // *our* outgoing failures count; an incoming one is not our teardown.
            sendEvent("onPayloadFailed", mapOf("endpointId" to endpointId, "payloadId" to update.payloadId.toString()))
          }
        }
        else -> {}
      }
    }
  }

  private val connectionCallback = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
      sendEvent(
        "onConnectionInitiated",
        mapOf(
          "endpointId" to endpointId,
          "name" to info.endpointName,
          "isIncoming" to info.isIncomingConnection,
          "authDigits" to info.authenticationDigits
        )
      )
    }

    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      when (result.status.statusCode) {
        ConnectionsStatusCodes.STATUS_OK ->
          sendEvent("onConnected", mapOf("endpointId" to endpointId))
        else ->
          sendEvent(
            "onConnectionFailed",
            mapOf("endpointId" to endpointId, "status" to result.status.statusCode)
          )
      }
    }

    override fun onDisconnected(endpointId: String) {
      sendEvent("onDisconnected", mapOf("endpointId" to endpointId))
    }

    // Nearby moving a link to another medium — the Wi-Fi upgrade that follows a
    // Bluetooth connect, or the fall back down from it. Reported and nothing
    // else: JS only logs it, which is how a link that drops seconds after an
    // upgrade gets told apart from one that was never upgraded at all.
    // `quality` is BandwidthInfo.Quality — 0 unknown, 1 low, 2 medium, 3 high.
    override fun onBandwidthChanged(endpointId: String, info: BandwidthInfo) {
      sendEvent("onBandwidthChanged", mapOf("endpointId" to endpointId, "quality" to info.quality))
    }
  }

  private val discoveryCallback = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      if (info.serviceId != serviceId) return
      sendEvent("onEndpointFound", mapOf("endpointId" to endpointId, "name" to info.endpointName))
    }

    override fun onEndpointLost(endpointId: String) {
      sendEvent("onEndpointLost", mapOf("endpointId" to endpointId))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NearbyBuddy")

    Events(
      "onEndpointFound",
      "onEndpointLost",
      "onConnectionInitiated",
      "onConnected",
      "onConnectionFailed",
      "onDisconnected",
      "onPayload",
      "onPayloadSent",
      "onPayloadFailed",
      "onBandwidthChanged"
    )

    // The Play services build on this phone, for the diagnostics header: Nearby
    // lives in Play services rather than in the app, so two phones on one APK
    // can still be running two different radios. Null when it cannot be read.
    Function("playServicesVersion") {
      runCatching {
        appContext.reactContext?.packageManager
          ?.getPackageInfo("com.google.android.gms", 0)
          ?.versionName
      }.getOrNull()
    }

    AsyncFunction("startAdvertising") { name: String, promise: Promise ->
      client.startAdvertising(
        name,
        serviceId,
        connectionCallback,
        AdvertisingOptions.Builder()
          .setStrategy(Strategy.P2P_POINT_TO_POINT)
          .setConnectionType(linkType)
          .build()
      )
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(refusal("ADVERTISE_FAILED", it)) }
    }

    AsyncFunction("stopAdvertising") {
      client.stopAdvertising()
    }

    AsyncFunction("startDiscovery") { promise: Promise ->
      client.startDiscovery(
        serviceId,
        discoveryCallback,
        DiscoveryOptions.Builder().setStrategy(Strategy.P2P_POINT_TO_POINT).build()
      )
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(refusal("DISCOVERY_FAILED", it)) }
    }

    AsyncFunction("stopDiscovery") {
      client.stopDiscovery()
    }

    AsyncFunction("requestConnection") { name: String, endpointId: String, promise: Promise ->
      client.requestConnection(
        name,
        endpointId,
        connectionCallback,
        ConnectionOptions.Builder().setConnectionType(linkType).build()
      )
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(refusal("REQUEST_FAILED", it)) }
    }

    AsyncFunction("acceptConnection") { endpointId: String, promise: Promise ->
      client.acceptConnection(endpointId, payloadCallback)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(refusal("ACCEPT_FAILED", it)) }
    }

    AsyncFunction("rejectConnection") { endpointId: String, promise: Promise ->
      client.rejectConnection(endpointId)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(refusal("REJECT_FAILED", it)) }
    }

    AsyncFunction("sendPayload") { endpointId: String, data: String, promise: Promise ->
      val payload = Payload.fromBytes(data.toByteArray(Charsets.UTF_8))
      // Record before sending so a FAILURE update — which can arrive before the
      // Task's own failure listener — is recognised as ours.
      outgoingPayloads.add(payload.id)
      client.sendPayload(endpointId, payload)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener {
          outgoingPayloads.remove(payload.id)
          promise.reject(refusal("SEND_FAILED", it))
        }
    }

    AsyncFunction("disconnectFrom") { endpointId: String ->
      client.disconnectFromEndpoint(endpointId)
    }

    AsyncFunction("stopAll") {
      client.stopAllEndpoints()
    }

    AsyncFunction("isBluetoothOn") {
      bluetoothOn()
    }

    AsyncFunction("isLocationOn") {
      locationOn()
    }

    // Android's own screen for one of the two switches. Neither is this app's
    // to flip, so the way out of "Bluetooth is off" is the place it is turned
    // on. A plain startActivity: no result is waited for, and JS looks at the
    // switch again when the app comes back to the front.
    AsyncFunction("openSwitch") { which: String ->
      val context = appContext.reactContext
        ?: throw CodedException("NO_CONTEXT", "React context gone", null)
      val action =
        if (which == "location") Settings.ACTION_LOCATION_SOURCE_SETTINGS
        else Settings.ACTION_BLUETOOTH_SETTINGS
      context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // The module going away is the React instance going away — a dev reload,
    // the host being invalidated — and the JS that knew these links goes with
    // it. It is *not* what a swipe-away fires: see below.
    OnDestroy {
      dropEverything()
    }

    // The activity going away while the process lives on: swiped out of
    // recents with a session's foreground service still holding the process,
    // or destroyed by the system behind one. The module survives that — only
    // ACTIVITY_DESTROYS is posted, never MODULE_DESTROY — but the React tree
    // does not: the surface is stopped in the same call, the store and
    // <BuddyRadio> unmount, and the endpoint id, the handshake state and who
    // had proved what are gone. What would be left is a link Nearby still
    // holds and nothing in JS knows about. Point-to-point allows one
    // connection, so the tree that mounts on the way back in could never make
    // another, and the buddy — whose payloads still deliver to a process that
    // is still receiving — would never learn there was anything to heal. So
    // the link ends where its owner did: their phone hears a disconnect, which
    // is the one event its reconnect is built on.
    OnActivityDestroys {
      dropEverything()
    }
  }
}
