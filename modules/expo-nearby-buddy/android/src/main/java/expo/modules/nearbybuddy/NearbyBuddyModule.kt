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

  private val client
    get() = Nearby.getConnectionsClient(
      appContext.reactContext ?: throw CodedException("NO_CONTEXT", "React context gone", null)
    )

  // Ids of payloads *this* phone sent, so onPayloadTransferUpdate can tell an
  // outgoing transfer from an incoming one — the update itself carries no
  // direction. Only an outgoing FAILURE means "our bytes never arrived", which
  // is what the JS zombie-teardown counts; an incoming failure is the peer's
  // problem and must not tear our link down. Cleared on any terminal status.
  private val outgoingPayloads: MutableSet<Long> = ConcurrentHashMap.newKeySet()

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
      "onPayloadFailed"
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
      val payload = Payload.fromBytes(data.toByteArray(Charsets.UTF_8))
      // Record before sending so a FAILURE update — which can arrive before the
      // Task's own failure listener — is recognised as ours.
      outgoingPayloads.add(payload.id)
      client.sendPayload(endpointId, payload)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener {
          outgoingPayloads.remove(payload.id)
          promise.reject(CodedException("SEND_FAILED", it.message, it))
        }
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
