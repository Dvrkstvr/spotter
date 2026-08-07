package expo.modules.nearbybuddy

import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
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

/**
 * Thin bridge over Google Nearby Connections for the buddy sync flow.
 *
 * One service id, point-to-point strategy, byte payloads (JSON strings).
 * Everything event-driven lands in JS via sendEvent; the JS side
 * (src/data/buddy-radio.ts) owns all protocol logic.
 */
class NearbyBuddyModule : Module() {
  private val serviceId = "com.calvinkohl.workoutdiary.buddy"

  private val client
    get() = Nearby.getConnectionsClient(
      appContext.reactContext ?: throw CodedException("NO_CONTEXT", "React context gone", null)
    )

  private val payloadCallback = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      val bytes = payload.asBytes() ?: return
      sendEvent("onPayload", mapOf("endpointId" to endpointId, "data" to String(bytes, Charsets.UTF_8)))
    }

    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
      if (update.status == PayloadTransferUpdate.Status.SUCCESS) {
        sendEvent("onPayloadSent", mapOf("endpointId" to endpointId, "payloadId" to update.payloadId.toString()))
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
      "onPayloadSent"
    )

    AsyncFunction("startAdvertising") { name: String, promise: Promise ->
      client.startAdvertising(
        name,
        serviceId,
        connectionCallback,
        AdvertisingOptions.Builder().setStrategy(Strategy.P2P_POINT_TO_POINT).build()
      )
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(CodedException("ADVERTISE_FAILED", it.message, it)) }
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
        .addOnFailureListener { promise.reject(CodedException("DISCOVERY_FAILED", it.message, it)) }
    }

    AsyncFunction("stopDiscovery") {
      client.stopDiscovery()
    }

    AsyncFunction("requestConnection") { name: String, endpointId: String, promise: Promise ->
      client.requestConnection(name, endpointId, connectionCallback)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(CodedException("REQUEST_FAILED", it.message, it)) }
    }

    AsyncFunction("acceptConnection") { endpointId: String, promise: Promise ->
      client.acceptConnection(endpointId, payloadCallback)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(CodedException("ACCEPT_FAILED", it.message, it)) }
    }

    AsyncFunction("rejectConnection") { endpointId: String, promise: Promise ->
      client.rejectConnection(endpointId)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(CodedException("REJECT_FAILED", it.message, it)) }
    }

    AsyncFunction("sendPayload") { endpointId: String, data: String, promise: Promise ->
      client.sendPayload(endpointId, Payload.fromBytes(data.toByteArray(Charsets.UTF_8)))
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(CodedException("SEND_FAILED", it.message, it)) }
    }

    AsyncFunction("disconnectFrom") { endpointId: String ->
      client.disconnectFromEndpoint(endpointId)
    }

    AsyncFunction("stopAll") {
      client.stopAllEndpoints()
    }

    OnDestroy {
      runCatching { client.stopAllEndpoints() }
    }
  }
}
